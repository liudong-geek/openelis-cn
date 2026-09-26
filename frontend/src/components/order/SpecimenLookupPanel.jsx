import React, { useEffect, useRef, useState } from "react";
import {
  Button,
  InlineNotification,
  Search,
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
  active = false,
  canReturn = false,
  originalLabNo = "",
  onViewChange = () => {},
}) {
  const intl = useIntl();
  const t = (key, values) =>
    intl.formatMessage({ id: `order.specimenLookup.${key}` }, values);
  const [code, setCode] = useState("");
  const [searchedCode, setSearchedCode] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const requestRef = useRef(null);
  const sequence = useRef(0);

  useEffect(
    () => () => {
      sequence.current += 1;
      requestRef.current?.abort();
    },
    [],
  );

  const invalidate = () => {
    sequence.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    setBusy(false);
    setResult(null);
    setSelectedRequestId(null);
    setError(null);
  };

  const search = async () => {
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

  const rows = result ? resultRows(result.current) : [];
  const selected = rows.find(
    ({ request }) => String(request.id) === String(selectedRequestId),
  );
  const patient = result?.current?.patient;
  const patientName = patient
    ? [patient.lastName, patient.firstName].filter(Boolean).join("")
    : "";

  return (
    <section className="specimen-lookup" aria-label={t("title")}>
      <Tile className="specimen-lookup__search">
        <Stack gap={4}>
          <div>
            <h3>{t("title")}</h3>
            <p>{t("help")}</p>
          </div>
          <div className="specimen-lookup__input">
            <Search
              id="specimen-intake-lookup"
              labelText={t("code")}
              placeholder={t("placeholder")}
              value={code}
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
            <Button size="md" onClick={search} disabled={busy}>
              {t("search")}
            </Button>
            {active && canReturn && (
              <Button
                kind="ghost"
                size="md"
                onClick={() => {
                  invalidate();
                  onViewChange(false);
                }}
              >
                {t("returnToForm", { labNo: originalLabNo })}
              </Button>
            )}
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
                <dt>{t("order")}</dt>
                <dd>{result.current.labNo}</dd>
              </div>
            </dl>
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
                              disabled={selectedRow}
                              onClick={() => setSelectedRequestId(request.id)}
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
          </Stack>
        </Tile>
      )}
    </section>
  );
}
