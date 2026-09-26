import React, { useContext, useEffect, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  InlineNotification,
  Search,
  Select,
  SelectItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Tile,
} from "@carbon/react";
import { useIntl } from "react-intl";
import { localizeSampleType } from "./sampleTypeIntl";
import { lookupSpecimen } from "./api/specimenLookupApi";
import { getVerifiedServerClock } from "./api/serverClockApi";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { postSpecimenReceipt } from "./receiptTransport";
import { postIntakeDecision } from "./intakeTransport";
import { verifyReceiptResponse } from "./specimenReceipt";
import { verifyIntakeAck } from "./intakeDecision";
import RecoveredSpecimenRecollection from "./RecoveredSpecimenRecollection";
import {
  buildLookupAccept,
  buildLookupReject,
  buildLookupReceipt,
  lookupActionKind,
  lookupRecollectionResult,
  lookupWriteRecorded,
  sameLookupAction,
} from "./specimenLookupAction";

const STAGE_TAG = {
  requested: "blue",
  collected: "cyan",
  received: "purple",
  accepted: "green",
  rejected: "red",
  cancelled: "gray",
  review: "magenta",
};

const stageFor = (request, item) => {
  if (request.status === "CANCELLED") return "cancelled";
  if (!item) return request.status === "REQUESTED" ? "requested" : "review";
  if (request.status !== "COLLECTED") return "review";
  if (item.voided) return "review";
  if (
    item.rejected &&
    !(item.decisionState === "RECORDED" && item.recordedDecision === "REJECTED")
  )
    return "review";
  if (item.decisionState === "RECORDED") {
    if (item.recordedDecision === "ACCEPTED") return "accepted";
    if (item.recordedDecision === "REJECTED")
      return item.rejected ? "rejected" : "review";
    return "review";
  }
  if (item.decisionState === "LEGACY_REJECTION") return "review";
  if (item.decisionState !== "NOT_RECORDED") return "review";
  return item.receivedDate ? "received" : "collected";
};

const resultRows = (current) => {
  const items = new Map(
    current.physicalSpecimens.map((item) => [String(item.id), item]),
  );
  return current.requestedSpecimens.map((request) => {
    const candidate = items.get(String(request.sampleItemId));
    const item =
      candidate && String(candidate.requestId) === String(request.id)
        ? candidate
        : null;
    return {
      request,
      item,
      stage: stageFor(request, item),
    };
  });
};

export default function SpecimenLookupPanel({
  initialCode = "",
  onOpenResults,
  active = false,
  canReturn = false,
  originalLabNo = "",
  onViewChange = () => {},
}) {
  const intl = useIntl();
  const session = useContext(UserSessionDetailsContext);
  const latestSession = useRef(session);
  const t = (key, values) =>
    intl.formatMessage({ id: `order.specimenLookup.${key}` }, values);
  const [code, setCode] = useState(initialCode);
  const [searchedCode, setSearchedCode] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [decisionChoice, setDecisionChoice] = useState("ACCEPTED");
  const [reasonId, setReasonId] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);
  const [writeLocked, setWriteLocked] = useState(false);
  const pendingWrite = useRef(null);
  const activeWrite = useRef(false);
  const requestRef = useRef(null);
  const sequence = useRef(0);

  const sessionKey = JSON.stringify([
    session?.userSessionDetails?.userId,
    session?.userSessionDetails?.csrf,
    session?.userSessionDetails?.sessionId,
    session?.sessionPhase,
    session?.errorLoadingSessionDetails,
  ]);

  useEffect(
    () => () => {
      sequence.current += 1;
      requestRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    latestSession.current = session;
  }, [session]);

  const invalidate = () => {
    sequence.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    setBusy(false);
    setResult(null);
    setSelectedRequestId(null);
    setError(null);
    setIdentityConfirmed(false);
    setDecisionChoice("ACCEPTED");
    setReasonId("");
    setActionNotice(null);
  };

  useEffect(() => {
    const timer = setTimeout(invalidate, 0);
    return () => clearTimeout(timer);
  }, [sessionKey]);

  const readCredential = (context) => {
    try {
      const details = context?.userSessionDetails;
      const identity = context?.getSessionIdentity?.();
      const generation = context?.getSessionCheckGeneration?.();
      if (
        details?.authenticated !== true ||
        !details?.csrf ||
        !details?.userId ||
        context?.errorLoadingSessionDetails ||
        (context?.sessionPhase && context.sessionPhase !== "authenticated") ||
        (typeof context?.isSessionWriteAllowed === "function" &&
          context.isSessionWriteAllowed(identity, generation) !== true)
      )
        return null;
      return {
        token: details.csrf,
        actor: String(details.userId),
        identity,
        generation,
      };
    } catch {
      return null;
    }
  };

  const credential = () => readCredential(latestSession.current);

  const sameCredential = (expected) => {
    const current = credential();
    return (
      current &&
      current.token === expected.token &&
      current.actor === expected.actor &&
      current.identity === expected.identity &&
      current.generation === expected.generation
    );
  };

  const search = async () => {
    if (activeWrite.current) return;
    const query = code.trim();
    invalidate();
    onViewChange(true);
    setSearchedCode(query);
    if (!query || query.length > 30) {
      setError("invalid");
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    const currentSequence = sequence.current;
    setBusy(true);
    try {
      const found = await lookupSpecimen(query, { signal: controller.signal });
      if (currentSequence !== sequence.current || controller.signal.aborted)
        return;
      setResult(found);
      setSelectedRequestId(found.selection.requestId || null);
      if (pendingWrite.current) {
        if (
          pendingWrite.current.code === query &&
          lookupWriteRecorded(
            found,
            query,
            pendingWrite.current.kind,
            pendingWrite.current.command,
          )
        ) {
          setActionNotice(`${pendingWrite.current.kind}Saved`);
          pendingWrite.current = null;
          setWriteLocked(false);
        } else {
          setActionNotice("unknown");
          setWriteLocked(true);
        }
      }
    } catch (failure) {
      if (currentSequence !== sequence.current || controller.signal.aborted)
        return;
      setError(failure.kind || "unavailable");
    } finally {
      if (currentSequence === sequence.current) {
        requestRef.current = null;
        setBusy(false);
      }
    }
  };

  const performAction = async (kind) => {
    const initial = result;
    const barcode = searchedCode;
    const expected = credential();
    const selectedReasonId = reasonId;
    if (
      activeWrite.current ||
      writeLocked ||
      !identityConfirmed ||
      !expected ||
      String(selectedRequestId) !== String(initial?.selection?.requestId) ||
      lookupActionKind(initial, barcode) !==
        (kind === "reject" ? "accept" : kind)
    )
      return;
    activeWrite.current = true;
    setActionBusy(true);
    setActionNotice(null);
    let dispatched = false;
    try {
      // One fresh, exact tube read before dispatch. A changed identity or
      // specimen state invalidates the operator's earlier confirmation.
      const fresh = await lookupSpecimen(barcode);
      if (!sameCredential(expected)) throw new Error("session");
      if (!sameLookupAction(initial, fresh, barcode, kind, selectedReasonId)) {
        setResult(fresh);
        setSelectedRequestId(fresh.selection.requestId || null);
        setIdentityConfirmed(false);
        setActionNotice("changed");
        return;
      }
      let command;
      if (kind === "receipt") {
        const clock = await getVerifiedServerClock();
        command = clock?.instant
          ? buildLookupReceipt(fresh, barcode, clock.instant)
          : null;
      } else if (kind === "reject") {
        command = buildLookupReject(
          fresh,
          barcode,
          crypto.randomUUID(),
          selectedReasonId,
        );
      } else {
        command = buildLookupAccept(fresh, barcode, crypto.randomUUID());
      }
      if (!command || !sameCredential(expected)) throw new Error("preflight");
      pendingWrite.current = { code: barcode, kind, command };
      setWriteLocked(true);
      dispatched = true;
      try {
        const ack =
          kind === "receipt"
            ? await postSpecimenReceipt(
                JSON.stringify(command),
                new AbortController().signal,
                expected.token,
              )
            : await postIntakeDecision(
                JSON.stringify(command),
                new AbortController().signal,
                expected.token,
              );
        if (kind === "receipt") verifyReceiptResponse(ack, command);
        else verifyIntakeAck(ack, command, expected.actor);
      } catch {
        // A failed HTTP exchange is not proof that a write was rolled back.
      }
    } catch {
      // Even a pre-dispatch failure gets a fresh read; it never triggers POST.
    } finally {
      try {
        const latest = await lookupSpecimen(barcode);
        if (sameCredential(expected)) {
          setResult(latest);
          setSelectedRequestId(latest.selection.requestId || null);
          setIdentityConfirmed(false);
          if (
            pendingWrite.current &&
            lookupWriteRecorded(
              latest,
              barcode,
              kind,
              pendingWrite.current.command,
            )
          ) {
            pendingWrite.current = null;
            setWriteLocked(false);
            setActionNotice(`${kind}Saved`);
          } else if (dispatched) {
            setWriteLocked(true);
            setActionNotice("unknown");
          } else {
            setActionNotice("changed");
          }
        } else {
          invalidate();
          if (dispatched) setActionNotice("unknown");
        }
      } catch (failure) {
        invalidate();
        setError(failure.kind || "unavailable");
        setActionNotice(dispatched ? "unknown" : "changed");
      } finally {
        activeWrite.current = false;
        setActionBusy(false);
      }
    }
  };

  const rows = result ? resultRows(result.current) : [];
  const selected = rows.find(
    ({ request }) => String(request.id) === String(selectedRequestId),
  );
  const patient = result?.current?.patient;
  const patientName = patient
    ? [patient.lastName, patient.firstName].filter(Boolean).join("")
    : "";
  const scannedRequestSelected =
    result && String(selectedRequestId) === String(result.selection?.requestId);
  const actionKind =
    scannedRequestSelected && result
      ? lookupActionKind(result, searchedCode)
      : null;
  const intendedAction =
    actionKind === "accept" && decisionChoice === "REJECTED"
      ? "reject"
      : actionKind;
  const rejectionReasons =
    result?.current?.intakeReasons?.state === "READY"
      ? result.current.intakeReasons.items
      : [];
  const recollectionResult = result
    ? lookupRecollectionResult(result, searchedCode)
    : null;
  const writeReady = Boolean(readCredential(session));

  return (
    <section className="specimen-lookup" aria-label={t("title")}>
      <Tile className="specimen-lookup__search">
        <Stack gap={4}>
          <div className="specimen-lookup__intro">
            <h3>{t("title")}</h3>
            <p>{t("help")}</p>
          </div>
          <div className="specimen-lookup__controls">
            <div className="specimen-lookup__input">
              <Search
                id="specimen-intake-lookup"
                labelText={t("code")}
                placeholder={t("placeholder")}
                value={code}
                disabled={actionBusy}
                onChange={(event) => {
                  invalidate();
                  setCode(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    search();
                  }
                }}
                size="lg"
              />
            </div>
            <div className="specimen-lookup__actions">
              <Button size="md" onClick={search} disabled={busy || actionBusy}>
                {t("search")}
              </Button>
              {active && canReturn && (
                <Button
                  kind="ghost"
                  size="md"
                  disabled={actionBusy}
                  onClick={() => {
                    invalidate();
                    onViewChange(false);
                  }}
                >
                  {t("returnToForm", { labNo: originalLabNo })}
                </Button>
              )}
            </div>
          </div>
          {busy && <p role="status">{t("loading")}</p>}
          {error && (
            <InlineNotification
              kind={error === "notFound" ? "info" : "error"}
              hideCloseButton
              title={t(`error.${error}`)}
              subtitle={t("failedCode", { code: searchedCode })}
            />
          )}
          {actionNotice && (
            <InlineNotification
              kind={actionNotice.endsWith("Saved") ? "success" : "warning"}
              hideCloseButton
              title={t(`action.${actionNotice}`, { code: searchedCode })}
            />
          )}
          {active && !busy && !error && !result && (
            <p role="status">{t("empty")}</p>
          )}
        </Stack>
      </Tile>

      {active && result && (
        <Tile className="specimen-lookup__result">
          <Stack gap={4}>
            <div className="specimen-lookup__notice" role="note">
              <Tag type="blue">{t("readOnly")}</Tag>
              <span>{t("readOnlyHelp")}</span>
            </div>
            {canReturn && result.current.labNo !== originalLabNo && (
              <p role="note">{t("otherForm", { labNo: originalLabNo })}</p>
            )}
            <dl className="specimen-lookup__identity">
              <div>
                <dt>{t("patient")}</dt>
                <dd>
                  {result.current.patientMasked
                    ? t("maskedPatient")
                    : patientName || t("missingPatient")}
                </dd>
              </div>
              <div>
                <dt>{t("birthDate")}</dt>
                <dd>
                  {result.current.patientMasked
                    ? "—"
                    : patient?.birthDate || "—"}
                </dd>
              </div>
              <div>
                <dt>{t("nationalId")}</dt>
                <dd>
                  {result.current.patientMasked
                    ? "—"
                    : patient?.nationalId || "—"}
                </dd>
              </div>
              <div>
                <dt>{t("order")}</dt>
                <dd>{result.current.labNo}</dd>
              </div>
            </dl>
            {!result.current.patientMasked &&
              (![patient?.firstName, patient?.lastName].some(Boolean) ||
                ![patient?.birthDate, patient?.nationalId].some(Boolean)) && (
                <p role="alert">{t("action.identityIncomplete")}</p>
              )}
            <div className="specimen-lookup__specimens">
              <h4>{t("specimens")}</h4>
              <div role="region" aria-label={t("specimens")} tabIndex={0}>
                <Table size="md">
                  <TableHead>
                    <TableRow>
                      {["tube", "type", "state", "next", "select"].map(
                        (key) => (
                          <TableHeader key={key}>{t(key)}</TableHeader>
                        ),
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map(({ request, item, stage }) => {
                      const selectedRow =
                        String(request.id) === String(selectedRequestId);
                      return (
                        <TableRow key={request.id}>
                          <TableCell>
                            {item
                              ? `${result.current.labNo}.${item.sortOrder}`
                              : t("noPhysical")}
                          </TableCell>
                          <TableCell>
                            {localizeSampleType(intl, request.sampleTypeName) ||
                              t("typeId", { id: request.typeOfSampleId })}
                          </TableCell>
                          <TableCell>
                            <Tag type={STAGE_TAG[stage]}>
                              {t(`stage.${stage}`)}
                            </Tag>
                          </TableCell>
                          <TableCell>{t(`next.${stage}`)}</TableCell>
                          <TableCell>
                            <Button
                              kind="ghost"
                              size="sm"
                              disabled={selectedRow || actionBusy}
                              onClick={() => {
                                if (activeWrite.current) return;
                                setSelectedRequestId(request.id);
                                setIdentityConfirmed(false);
                              }}
                            >
                              {selectedRow ? t("selected") : t("select")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
            {selected ? (
              <p className="specimen-lookup__next" role="status">
                {t("selectedAction", {
                  code: selected.item
                    ? `${result.current.labNo}.${selected.item.sortOrder}`
                    : t("requestId", { id: selected.request.id }),
                  action: t(`next.${selected.stage}`),
                })}
              </p>
            ) : (
              <p className="specimen-lookup__next" role="status">
                {t("selectFirst")}
              </p>
            )}
            {selected?.stage === "accepted" &&
              scannedRequestSelected &&
              onOpenResults && (
                <Button
                  size="md"
                  onClick={() => onOpenResults(result.current.labNo)}
                >
                  {intl.formatMessage({ id: "result.entry.label" })}
                </Button>
              )}
            {!scannedRequestSelected && result.matchedKind === "specimen" && (
              <p role="note">{t("action.scanSelectedToAct")}</p>
            )}
            {actionKind && !writeLocked && (
              <div
                className="specimen-lookup__tube-action"
                role="group"
                aria-label={t("action.title")}
              >
                <h4>{t("action.title")}</h4>
                <p>{t("action.scope", { code: searchedCode })}</p>
                <Checkbox
                  id="specimen-lookup-confirm-identity"
                  labelText={t("action.confirmIdentity")}
                  checked={identityConfirmed}
                  onChange={(_, { checked }) => setIdentityConfirmed(checked)}
                  disabled={actionBusy || !writeReady}
                />
                {actionKind === "accept" && (
                  <>
                    <Select
                      id="specimen-lookup-decision"
                      labelText={t("action.decision")}
                      value={decisionChoice}
                      disabled={actionBusy || !writeReady}
                      onChange={(event) => {
                        setDecisionChoice(event.target.value);
                        setReasonId("");
                        setIdentityConfirmed(false);
                      }}
                    >
                      <SelectItem
                        value="ACCEPTED"
                        text={t("action.acceptChoice")}
                      />
                      <SelectItem
                        value="REJECTED"
                        text={t("action.rejectChoice")}
                      />
                    </Select>
                    {decisionChoice === "REJECTED" && (
                      <Select
                        id="specimen-lookup-rejection-reason"
                        labelText={t("action.rejectionReason")}
                        value={reasonId}
                        disabled={
                          actionBusy || !writeReady || !rejectionReasons.length
                        }
                        onChange={(event) => {
                          setReasonId(event.target.value);
                          setIdentityConfirmed(false);
                        }}
                      >
                        <SelectItem value="" text={t("action.chooseReason")} />
                        {rejectionReasons.map((reason) => (
                          <SelectItem
                            key={reason.id}
                            value={reason.id}
                            text={reason.label}
                          />
                        ))}
                      </Select>
                    )}
                    {decisionChoice === "REJECTED" &&
                      !rejectionReasons.length && (
                        <p role="alert">{t("action.noReasons")}</p>
                      )}
                  </>
                )}
                <Button
                  size="md"
                  disabled={
                    !identityConfirmed ||
                    actionBusy ||
                    !writeReady ||
                    (intendedAction === "reject" && !reasonId)
                  }
                  onClick={() => performAction(intendedAction)}
                >
                  {t(`action.${intendedAction}`)}
                </Button>
                {actionKind === "accept" && <p>{t("action.acceptBoundary")}</p>}
              </div>
            )}
          </Stack>
        </Tile>
      )}
      {active && recollectionResult && (
        <RecoveredSpecimenRecollection result={recollectionResult} />
      )}
    </section>
  );
}
