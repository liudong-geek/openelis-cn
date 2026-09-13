import React from "react";
import {
  InlineNotification,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Tag,
} from "@carbon/react";
import { useIntl } from "react-intl";
import "./entry-current-summary.scss";

// Display current facts only. This component cannot change the active order or
// infer a writable intake stage from the existence of physical specimens.
export default function EntryCurrentSummary({ result }) {
  const intl = useIntl();
  const t = (name, values) =>
    intl.formatMessage({ id: `order.recovery.${name}` }, values);
  const current = result.current;
  const items = new Map(
    current.physicalSpecimens.map((item) => [String(item.id), item]),
  );
  const requests = [...current.requestedSpecimens].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder || String(a.id).localeCompare(String(b.id)),
  );
  const state = {
    REQUESTED: "pending",
    COLLECTED: "collected",
    CANCELLED: "cancelled",
  };
  const colors = { REQUESTED: "blue", COLLECTED: "green", CANCELLED: "gray" };
  const patientName = current.patient
    ? [current.patient.lastName, current.patient.firstName]
        .filter(Boolean)
        .join("")
        .trim() || t("missingName")
    : t("environmental");
  return (
    <section className="entry-current-summary" aria-label={t("currentTitle")}>
      <InlineNotification
        kind="info"
        hideCloseButton
        title={t("currentConfirmed")}
        subtitle={t("currentSummary", {
          labNo: current.labNo,
          count: requests.length,
        })}
      />
      <dl className="entry-current-summary__patient">
        <div>
          <dt>{t("patient")}</dt>
          <dd>{patientName}</dd>
        </div>
        <div>
          <dt>{t("birthDate")}</dt>
          <dd>{current.patient?.birthDate || "—"}</dd>
        </div>
      </dl>
      <div
        className="entry-current-summary__table"
        tabIndex={0}
        role="region"
        aria-label={t("specimens")}
      >
        <Table size="md">
          <TableHead>
            <TableRow>
              {[
                "specimen",
                "state",
                "testCount",
                "collectionDate",
                "physicalState",
              ].map((key) => (
                <TableHeader key={key}>{t(key)}</TableHeader>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {requests.map((request, index) => {
              const item = items.get(String(request.sampleItemId));
              return (
                <TableRow key={request.id}>
                  <TableCell>
                    <strong>
                      {t("specimenSequence", { number: index + 1 })}
                    </strong>
                    <div className="entry-current-summary__secondary">
                      {t("typeReference", { id: request.typeOfSampleId })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Tag type={colors[request.status]}>
                      {t(state[request.status])}
                    </Tag>
                  </TableCell>
                  <TableCell>{request.testIds.length}</TableCell>
                  <TableCell>
                    {item?.collectionDate
                      ? intl.formatDate(item.collectionDate, {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {item ? (
                      <>
                        <div>
                          {t("physicalStatusReference", { id: item.statusId })}
                        </div>
                        {item.voided && <Tag type="red">{t("voided")}</Tag>}
                        {item.rejected && <Tag type="red">{t("rejected")}</Tag>}
                      </>
                    ) : (
                      t("noPhysical")
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="entry-current-summary__notice">
        {t("currentReadOnlyNotice")}
      </p>
    </section>
  );
}
