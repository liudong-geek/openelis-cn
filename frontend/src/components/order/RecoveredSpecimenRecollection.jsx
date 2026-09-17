import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  InlineNotification,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from "@carbon/react";
import { useIntl } from "react-intl";
import { useHistory } from "react-router-dom";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import {
  recollectionCandidate,
  recoverRecollection,
  submitRecollection,
} from "./specimenRecollection";

export default function RecoveredSpecimenRecollection({ result }) {
  const intl = useIntl();
  const history = useHistory();
  const session = React.useContext(UserSessionDetailsContext);
  const current = result?.current;
  const csrf = session?.userSessionDetails?.csrf || "";
  const actor = String(session?.userSessionDetails?.userId || "");
  const [records, setRecords] = useState({});
  const [busy, setBusy] = useState("");
  const generation = useRef(0);
  const t = (key, values) =>
    intl.formatMessage({ id: `order.recollection.${key}` }, values);

  const candidates = useMemo(
    () =>
      (current?.specimenDecisions || [])
        .map((decision) => ({
          decision,
          candidate: recollectionCandidate(current, decision),
        }))
        .filter((value) => value.candidate),
    [current],
  );
  const scope = JSON.stringify([
    current?.sampleId,
    current?.lastUpdated,
    actor,
    csrf,
    candidates.map(({ candidate }) => candidate.item.id),
  ]);

  useEffect(() => {
    const ticket = ++generation.current;
    const controller = new AbortController();
    setBusy("");
    setRecords(
      Object.fromEntries(
        candidates.map(({ candidate }) => [
          candidate.item.id,
          { state: actor && csrf ? "LOADING" : "UNKNOWN" },
        ]),
      ),
    );
    if (!actor || !csrf) return () => controller.abort();
    candidates.forEach(async ({ candidate }) => {
      const id = candidate.item.id;
      try {
        const receipt = await recoverRecollection(
          String(current.sampleId),
          String(id),
          controller.signal,
        );
        if (ticket === generation.current)
          setRecords((value) => ({
            ...value,
            [id]: { state: "READY", receipt },
          }));
      } catch (error) {
        if (controller.signal.aborted || ticket !== generation.current) return;
        setRecords((value) => ({
          ...value,
          [id]: {
            state: error?.status === 404 ? "NOT_FOUND" : "UNKNOWN",
            code: error?.code,
          },
        }));
      }
    });
    return () => {
      generation.current += 1;
      controller.abort();
    };
  }, [scope]);

  if (!candidates.length) return null;

  const create = async (decision, candidate) => {
    const id = candidate.item.id;
    if (busy || records[id]?.state !== "NOT_FOUND") return;
    const ticket = generation.current;
    const controller = new AbortController();
    setBusy(id);
    setRecords((value) => ({ ...value, [id]: { state: "SAVING" } }));
    try {
      const receipt = await submitRecollection(
        current,
        decision,
        csrf,
        controller.signal,
      );
      if (ticket === generation.current)
        setRecords((value) => ({
          ...value,
          [id]: { state: "READY", receipt },
        }));
    } catch (error) {
      if (ticket !== generation.current) return;
      try {
        const receipt = await recoverRecollection(
          String(current.sampleId),
          String(id),
          controller.signal,
        );
        if (ticket === generation.current)
          setRecords((value) => ({
            ...value,
            [id]: { state: "READY", receipt },
          }));
      } catch (recovery) {
        if (ticket === generation.current)
          setRecords((value) => ({
            ...value,
            [id]: {
              state:
                recovery?.status === 404 && error?.status < 500
                  ? "NOT_FOUND"
                  : "UNKNOWN",
              code: error?.code,
            },
          }));
      }
    } finally {
      if (ticket === generation.current) setBusy("");
    }
  };

  return (
    <section className="recovered-specimen-decision" aria-label={t("title")}>
      <header>
        <div>
          <h4>{t("title")}</h4>
          <p>{t("help")}</p>
        </div>
        <Tag type="purple">{t("scope")}</Tag>
      </header>
      <Table size="md">
        <TableHead>
          <TableRow>
            {["barcode", "reason", "replacement", "action"].map((key) => (
              <TableHeader key={key}>{t(key)}</TableHeader>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {candidates.map(({ decision, candidate }) => {
            const state = records[candidate.item.id] || { state: "LOADING" };
            const receipt = state.receipt;
            return (
              <TableRow key={candidate.item.id}>
                <TableCell>
                  {current.labNo}.{candidate.item.sortOrder}
                </TableCell>
                <TableCell>{decision.reason?.label || "—"}</TableCell>
                <TableCell>
                  {receipt ? (
                    <>
                      <Tag type="green">{t("created")}</Tag>
                      <p>{t("request", { id: receipt.request.id })}</p>
                    </>
                  ) : (
                    <Tag type={state.state === "NOT_FOUND" ? "gray" : "blue"}>
                      {t(state.state)}
                    </Tag>
                  )}
                </TableCell>
                <TableCell>
                  {state.state === "NOT_FOUND" && (
                    <Button
                      size="sm"
                      disabled={Boolean(busy) || !csrf || !actor}
                      onClick={() => create(decision, candidate)}
                    >
                      {t("create")}
                    </Button>
                  )}
                  {state.state === "READY" && (
                    <Button
                      kind="ghost"
                      size="sm"
                      onClick={() =>
                        history.push(
                          `/PrintBarcode?labNumber=${encodeURIComponent(current.labNo)}`,
                        )
                      }
                    >
                      {t("labels")}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {Object.values(records).some((value) => value.state === "UNKNOWN") && (
        <InlineNotification
          kind="warning"
          hideCloseButton
          title={t("unknown")}
          subtitle={t("unknownHelp")}
        />
      )}
      <p className="recovered-specimen-decision__boundary">{t("boundary")}</p>
    </section>
  );
}
