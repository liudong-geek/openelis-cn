import React, { useEffect, useRef, useState } from "react";
import { Button, InlineNotification, Tile } from "@carbon/react";
import { useIntl } from "react-intl";
import { Prompt, useHistory, useLocation } from "react-router-dom";
import SpecimenLookupPanel from "../../order/SpecimenLookupPanel";
import { parseIntakeHandoff } from "./resultRestrictionHandoff";
import {
  readRestrictedIntakeLookup,
  ResultRestriction,
  ResultRestrictionError,
  RestrictionFailure,
  restrictionFailure,
} from "./resultRestrictionRequest";
import { useResultRestriction } from "./useResultRestriction";
import ResultRestrictionFacts from "./ResultRestrictionFacts";
import "./result-restriction.scss";
export default function ResultIntakeHandoff() {
  const intl = useIntl(),
    history = useHistory(),
    location = useLocation();
  const t = (key: string) =>
    intl.formatMessage({ id: `results.restriction.${key}` });
  const handoff = parseIntakeHandoff(location.search),
    identityKey = JSON.stringify(handoff?.identity);
  const read = useResultRestriction(identityKey, Boolean(handoff));
  const [binding, setBinding] = useState<{
    owner: string;
    identityKey: string;
    scopeStamp: string;
    target: NonNullable<ResultRestriction["target"]>;
    initialLookup: any;
    canEditIntake: boolean;
    intakeEditUnavailableReason: string | null;
  } | null>(null);
  const recoveryRequest = useRef<AbortController | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  useEffect(
    () => () => recoveryRequest.current?.abort(),
    [identityKey, read.owner],
  );
  const [accessError, setAccessError] = useState<RestrictionFailure | null>(
    null,
  );
  const [blocked, setBlocked] = useState(false),
    [operation, setOperation] = useState({
      busy: false,
      dirty: false,
      unknown: false,
    });
  const live = useRef({
    read,
    identityKey,
    handoff,
    binding,
    blocked,
    operation,
  });
  live.current = { read, identityKey, handoff, binding, blocked, operation };
  const authorityReady = Boolean(
    binding &&
    read.owner === binding.owner &&
    identityKey === binding.identityKey &&
    read.scopeStamp === binding.scopeStamp &&
    !blocked,
  );
  useEffect(() => {
    setBlocked(true);
    setAccessError(null);
    if (handoff)
      void read.read(handoff.identity).then((data) => {
        if (data?.canOpenIntake && data.target && read.isCurrent()) {
          setBinding({
            owner: read.owner!,
            identityKey,
            scopeStamp: read.scopeStamp,
            target: data.target,
            initialLookup: data.intakeLookup,
            canEditIntake: data.canEditIntake,
            intakeEditUnavailableReason: data.intakeEditUnavailableReason,
          });
          setBlocked(false);
        }
      });
  }, [identityKey, read.owner]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (operation.busy || operation.dirty || operation.unknown) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [operation]);
  const isTargetCurrent = () => {
    const now = live.current;
    return Boolean(
      now.binding &&
      now.read.owner === now.binding.owner &&
      now.identityKey === now.binding.identityKey &&
      now.read.scopeStamp === now.binding.scopeStamp &&
      now.read.isCurrent() &&
      !now.blocked,
    );
  };
  const lookupReader = async (
    code: string,
    { signal, purpose }: { signal?: AbortSignal; purpose?: string } = {},
  ) => {
    const start = live.current,
      bound = start.binding;
    if (!bound || !isTargetCurrent() || code !== bound.target.lookupCode)
      throw new ResultRestrictionError("scope");
    try {
      if (purpose === "readback") {
        const value = await readRestrictedIntakeLookup(
          bound.target,
          signal || new AbortController().signal,
          bound.owner,
        );
        if (!isTargetCurrent()) throw new ResultRestrictionError("scope");
        return value;
      }
      const value = await start.read.read(start.handoff!.identity);
      if (
        !value?.canOpenIntake ||
        !value.target ||
        JSON.stringify(value.target) !== JSON.stringify(bound.target) ||
        !isTargetCurrent()
      )
        throw new ResultRestrictionError("changed");
      // The latest diagnosis independently controls the UI write entrance.
      // It is not an action token; the existing fresh guards still authorize POST.
      const updated = {
        ...bound,
        canEditIntake: value.canEditIntake,
        intakeEditUnavailableReason: value.intakeEditUnavailableReason,
      };
      live.current.binding = updated;
      setBinding(updated);
      return value.intakeLookup;
    } catch (error) {
      if (
        !signal?.aborted &&
        live.current.identityKey === start.identityKey &&
        live.current.read.owner === bound.owner &&
        live.current.read.scopeStamp === bound.scopeStamp
      ) {
        setBlocked(true);
        setAccessError(restrictionFailure(error));
        read.invalidate();
      }
      throw error;
    }
  };
  const retry = async () => {
    if (!handoff) return;
    if (
      operation.unknown &&
      binding &&
      read.owner === binding.owner &&
      identityKey === binding.identityKey
    ) {
      recoveryRequest.current?.abort();
      const controller = new AbortController();
      recoveryRequest.current = controller;
      setRecoveryBusy(true);
      const expectedScope = read.scopeStamp;
      try {
        const value = await readRestrictedIntakeLookup(
          binding.target,
          controller.signal,
          binding.owner,
        );
        if (
          controller.signal.aborted ||
          !live.current.read.isCurrent() ||
          live.current.read.scopeStamp !== expectedScope ||
          live.current.read.owner !== binding.owner ||
          live.current.identityKey !== identityKey
        )
          return;
        setBinding({
          ...binding,
          scopeStamp: live.current.read.scopeStamp,
          initialLookup: value,
          // Recovery is read-only. A later POST requires a fresh diagnosis.
          canEditIntake: false,
          intakeEditUnavailableReason: null,
        });
        setBlocked(false);
        setAccessError(null);
      } catch (error) {
        if (
          !controller.signal.aborted &&
          live.current.read.scopeStamp === expectedScope
        ) {
          setBlocked(true);
          setAccessError(restrictionFailure(error));
        }
      } finally {
        if (recoveryRequest.current === controller) {
          recoveryRequest.current = null;
          setRecoveryBusy(false);
        }
      }
      return;
    }
    setBlocked(true);
    setAccessError(null);
    const value = await read.read(handoff.identity);
    if (value?.canOpenIntake && value.target && read.isCurrent()) {
      if (
        binding &&
        JSON.stringify(value.target) !== JSON.stringify(binding.target)
      ) {
        setBlocked(true);
        return;
      }
      setBinding({
        owner: read.owner!,
        identityKey,
        scopeStamp: read.scopeStamp,
        target: value.target,
        initialLookup: value.intakeLookup,
        canEditIntake: value.canEditIntake,
        intakeEditUnavailableReason: value.intakeEditUnavailableReason,
      });
      setBlocked(false);
      setAccessError(null);
    }
  };
  const leaveLocked = operation.busy || operation.unknown;
  return (
    <div className="result-intake-handoff">
      <Prompt
        when={operation.busy || operation.dirty || operation.unknown}
        message={() =>
          operation.unknown || operation.busy ? false : t("contextChanged")
        }
      />
      <h1>{t("handoffTitle")}</h1>
      <Button
        kind="tertiary"
        disabled={leaveLocked}
        onClick={() => history.push(handoff?.returnPath || "/Results")}
      >
        {t("back")}
      </Button>
      {!handoff && (
        <InlineNotification
          hideCloseButton
          kind="error"
          title={t("error.invalid")}
        />
      )}
      {(read.phase === "loading" || recoveryBusy) && (
        <p role="status">{t("loading")}</p>
      )}
      {accessError && (
        <InlineNotification
          hideCloseButton
          kind="error"
          title={t(`error.${accessError}`)}
        />
      )}
      {read.error && (
        <InlineNotification
          hideCloseButton
          kind="error"
          title={t(`error.${read.error}`)}
        />
      )}
      {read.data && (
        <Tile>
          <ResultRestrictionFacts data={read.data} />
        </Tile>
      )}
      {handoff && read.phase !== "loading" && (
        <Button
          kind="ghost"
          disabled={operation.busy || recoveryBusy}
          onClick={() => void retry()}
        >
          {t("retry")}
        </Button>
      )}
      {binding && (
        <div hidden={!authorityReady}>
          <p>{t("targetHelp")}</p>
          {!binding.canEditIntake && (
            <p role="note">
              {t(
                binding.intakeEditUnavailableReason ===
                  "RECEPTION_UPDATE_PERMISSION_REQUIRED"
                  ? "intakeReadOnly"
                  : "intakeWriteUnconfirmed",
              )}
            </p>
          )}
          <p>
            {t("queryCode")} {binding.target.lookupCode}
          </p>
          <SpecimenLookupPanel
            active={authorityReady}
            initialCode={binding.target.lookupCode}
            initialLookup={binding.initialLookup}
            fixedTarget={binding.target}
            lookupReader={lookupReader}
            authorityReady={authorityReady}
            intakeWriteAllowed={authorityReady && binding.canEditIntake}
            isIntakeWriteCurrent={() =>
              isTargetCurrent() && live.current.binding?.canEditIntake === true
            }
            isTargetCurrent={isTargetCurrent}
            onOperationStateChange={setOperation}
            onOpenResults={() => {
              if (
                isTargetCurrent() &&
                !live.current.operation.busy &&
                !live.current.operation.unknown
              )
                history.push(handoff!.returnPath);
            }}
          />
        </div>
      )}
      {leaveLocked && <p role="status">{t("leaveBlocked")}</p>}
    </div>
  );
}
