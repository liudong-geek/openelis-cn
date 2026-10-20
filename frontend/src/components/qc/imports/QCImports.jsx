import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  ComposedModal,
  InlineLoading,
  InlineNotification,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Pagination,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from "@carbon/react";
import { useIntl } from "react-intl";
import { Link, useHistory, useLocation } from "react-router-dom";
import PageTitle from "../../common/PageTitle/PageTitle";
import {
  getFromOpenElisServer,
  postToOpenElisServerFullResponse,
} from "../../utils/Utils";
import "./QCImports.css";

const STATUSES = [
  "OPEN",
  "ALL",
  "PENDING",
  "NOT_PROCESSED",
  "UNKNOWN",
  "CREATED",
  "LEGACY_REVIEW",
];
const PAGE_SIZES = [20, 50, 100];
const valueText = (value) =>
  value == null || value === "" ? "—" : String(value);

const QCImports = () => {
  const intl = useIntl();
  const history = useHistory();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const status = STATUSES.includes(query.get("status"))
    ? query.get("status")
    : "OPEN";
  const limit = PAGE_SIZES.includes(Number(query.get("size")))
    ? Number(query.get("size"))
    : 20;
  const requestedPage = Number(query.get("page"));
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [notice, setNotice] = useState(null);
  const [needsReadback, setNeedsReadback] = useState(false);
  const [processing, setProcessing] = useState(new Set());
  const pendingWrites = useRef(new Set());
  const mounted = useRef(true);
  const selectionRef = useRef(null);
  const detailRequest = useRef(0);
  const t = (id, values) => intl.formatMessage({ id }, values);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setListError(false);
    getFromOpenElisServer(
      `/rest/qc/imports?status=${status}&limit=${limit}&offset=${(page - 1) * limit}`,
      (response) => {
        if (controller.signal.aborted) return;
        if (
          Array.isArray(response?.rows) &&
          Number.isInteger(response.total) &&
          response.total >= 0
        ) {
          const lastPage = Math.max(1, Math.ceil(response.total / limit));
          if (page > lastPage) {
            history.replace({
              ...history.location,
              search: `?status=${status}&page=${lastPage}&size=${limit}`,
            });
            return;
          }
          setRows(response.rows);
          setTotal(response.total);
        } else {
          setRows([]);
          setTotal(0);
          setListError(true);
        }
        setLoading(false);
      },
      controller.signal,
    );
    return () => controller.abort();
  }, [status, limit, page, reload, history]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      selectionRef.current = null;
      detailRequest.current++;
    };
  }, []);

  const loadDetail = useCallback((id, nextNotice = null) => {
    const requestId = ++detailRequest.current;
    selectionRef.current = id;
    setSelectedId(id);
    setDetail(null);
    setDetailError(false);
    setDetailLoading(true);
    setNeedsReadback(true);
    setNotice(nextNotice);
    getFromOpenElisServer(
      `/rest/qc/imports/${encodeURIComponent(id)}`,
      (response) => {
        if (requestId !== detailRequest.current || selectionRef.current !== id)
          return;
        if (
          response?.id != null &&
          String(response.id) === id &&
          response.qcProcessingStatus
        ) {
          setDetail(response);
          setNeedsReadback(false);
        } else {
          setDetailError(true);
        }
        setDetailLoading(false);
      },
    );
  }, []);

  const reprocess = () => {
    const id = selectionRef.current;
    if (
      !id ||
      !detail ||
      detail.canRetry !== true ||
      detail.qcResultId ||
      needsReadback ||
      detailLoading ||
      !["PENDING", "NOT_PROCESSED", "UNKNOWN"].includes(
        detail.qcProcessingStatus,
      ) ||
      pendingWrites.current.has(id)
    )
      return;
    pendingWrites.current.add(id);
    setProcessing(new Set(pendingWrites.current));
    setNeedsReadback(true);
    setNotice(null);
    postToOpenElisServerFullResponse(
      `/rest/qc/imports/${encodeURIComponent(id)}/reprocess`,
      "{}",
      async (response) => {
        let outcome;
        try {
          if (response?.ok) outcome = await response.json();
        } catch {
          // A lost or malformed receipt cannot prove the write failed.
        }
        pendingWrites.current.delete(id);
        if (!mounted.current) return;
        setProcessing(new Set(pendingWrites.current));
        setReload((value) => value + 1);
        if (selectionRef.current !== id) return;
        if (
          ["CREATED", "NOT_PROCESSED", "DUPLICATE_SKIPPED"].includes(
            outcome?.status,
          )
        ) {
          loadDetail(id, "qc.imports.checkedAfterProcessing");
        } else {
          detailRequest.current++;
          setDetailLoading(false);
          setNotice(
            response?.status === 403
              ? "qc.imports.forbidden"
              : "qc.imports.uncertain",
          );
          setNeedsReadback(true);
        }
      },
    );
  };

  const closeDetail = () => {
    detailRequest.current++;
    selectionRef.current = null;
    setSelectedId(null);
    setDetail(null);
  };
  const setFilter = (nextStatus, nextPage, nextSize) => {
    history.replace({
      ...location,
      search: `?status=${nextStatus}&page=${nextPage}&size=${nextSize}`,
    });
  };
  const statusText = (value) =>
    t(
      STATUSES.includes(value)
        ? `qc.imports.status.${value}`
        : "qc.imports.status.unrecognized",
    );
  const reasonText = (value) => {
    if (!value) return "—";
    const key = `qc.imports.reason.${value}`;
    return key in intl.messages
      ? t(key)
      : t("qc.imports.reason.other", { reason: value });
  };
  const levelText = (value) => {
    const key = `qc.controlLot.level.${String(value ?? "").toLowerCase()}`;
    return key in intl.messages ? `${t(key)} (${value})` : valueText(value);
  };
  const dateText = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? valueText(value)
      : intl.formatDate(date, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
  };
  const detailFields = detail
    ? [
        ["id", detail.id],
        ["analyzer", detail.analyzerId],
        ["accession", detail.accessionNumber],
        ["test", detail.testName || detail.testId],
        ["lot", detail.lotNumber],
        ["level", levelText(detail.controlLevel)],
        ["result", `${valueText(detail.result)} ${detail.units || ""}`],
        ["received", dateText(detail.completeDate)],
        ["status", statusText(detail.qcProcessingStatus)],
        ["reason", reasonText(detail.qcProcessingReason)],
        ["qcResult", detail.qcResultId],
        ["processedAt", dateText(detail.qcProcessedAt)],
        ["processedBy", detail.qcProcessedBy],
      ]
    : [];

  return (
    <div className="qc-imports">
      <PageTitle
        breadcrumbs={[
          { label: t("qc.dashboard.title"), link: "/analyzers/qc/db" },
          { label: t("qc.imports.title") },
        ]}
        subtitle={t("qc.imports.subtitle")}
      />
      <section
        className="qc-imports__workspace"
        aria-label={t("qc.imports.title")}
      >
        <div className="qc-imports__toolbar">
          <Select
            id="qc-import-status"
            labelText={t("qc.imports.field.status")}
            value={status}
            onChange={(event) => setFilter(event.target.value, 1, limit)}
          >
            {STATUSES.map((value) => (
              <SelectItem key={value} value={value} text={statusText(value)} />
            ))}
          </Select>
          <Button
            kind="tertiary"
            size="sm"
            disabled={loading}
            onClick={() => setReload((value) => value + 1)}
          >
            {t("qc.dashboard.refresh")}
          </Button>
          <Link to="/analyzers/qc/control-lots">
            {t("qc.imports.configureLots")}
          </Link>
        </div>
        {loading && <InlineLoading description={t("qc.imports.loading")} />}
        {listError && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            statusIconDescription={t("carbon.notification.error")}
            title={t("qc.imports.loadFailed")}
            subtitle={t("qc.imports.loadFailedHint")}
          />
        )}
        {!loading && !listError && rows.length === 0 && (
          <p className="qc-imports__empty">{t("qc.imports.empty")}</p>
        )}
        {rows.length > 0 && (
          <TableContainer className="qc-imports__table">
            <Table size="sm" aria-label={t("qc.imports.title")}>
              <TableHead>
                <TableRow>
                  {[
                    "accession",
                    "analyzer",
                    "test",
                    "lot",
                    "level",
                    "result",
                    "status",
                    "reason",
                    "actions",
                  ].map((key) => (
                    <TableHeader key={key}>
                      {t(`qc.imports.field.${key}`)}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{valueText(row.accessionNumber)}</TableCell>
                    <TableCell>{valueText(row.analyzerId)}</TableCell>
                    <TableCell>
                      {valueText(row.testName || row.testId)}
                    </TableCell>
                    <TableCell>{valueText(row.lotNumber)}</TableCell>
                    <TableCell>{levelText(row.controlLevel)}</TableCell>
                    <TableCell>
                      {valueText(row.result)} {row.units}
                    </TableCell>
                    <TableCell>
                      <Tag
                        type={
                          row.qcProcessingStatus === "CREATED"
                            ? "green"
                            : "gray"
                        }
                      >
                        {statusText(row.qcProcessingStatus)}
                      </Tag>
                    </TableCell>
                    <TableCell>{reasonText(row.qcProcessingReason)}</TableCell>
                    <TableCell>
                      <Button
                        kind="ghost"
                        size="sm"
                        disabled={loading}
                        onClick={() => loadDetail(String(row.id))}
                      >
                        {t("qc.imports.details")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {total > 0 && (
          <Pagination
            page={page}
            pageSize={limit}
            pageSizes={PAGE_SIZES}
            totalItems={total}
            disabled={loading}
            onChange={({ page: nextPage, pageSize }) =>
              setFilter(status, nextPage, pageSize)
            }
            itemsPerPageText={t("pagination.items-per-page")}
            backwardText={t("pagination.backward")}
            forwardText={t("pagination.forward")}
            pageNumberText={t("pagination.page-number")}
            itemRangeText={(min, max, count) =>
              t("pagination.item-range", { min, max, total: count })
            }
            pageRangeText={(_current, count) =>
              t("pagination.page-range", { total: count })
            }
          />
        )}
      </section>
      <ComposedModal open={selectedId !== null} onClose={closeDetail} size="lg">
        <ModalHeader
          title={t("qc.imports.details")}
          label={selectedId ? t("qc.imports.record", { id: selectedId }) : ""}
          iconDescription={t("button.close")}
        />
        <ModalBody>
          {detailLoading && (
            <InlineLoading description={t("qc.imports.loading")} />
          )}
          {detailError && (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              statusIconDescription={t("carbon.notification.error")}
              title={t("qc.imports.loadFailed")}
              subtitle={t("qc.imports.loadFailedHint")}
            />
          )}
          {notice && (
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              statusIconDescription={t("carbon.notification.info")}
              title={t(notice)}
            />
          )}
          {detail && (
            <>
              <p className="qc-imports__guidance">
                {t("qc.imports.originalOnly")}
              </p>
              {detail.qcProcessingStatus === "CREATED" && (
                <p className="qc-imports__guidance">
                  {t("qc.imports.createdBoundary")}
                </p>
              )}
              {detail.qcProcessingStatus === "LEGACY_REVIEW" && (
                <p className="qc-imports__guidance">
                  {t("qc.imports.reviewOnly")}
                </p>
              )}
              {detail.qcProcessingStatus === "UNKNOWN" && (
                <p className="qc-imports__guidance">
                  {t("qc.imports.unknownReview")}
                </p>
              )}
              <dl className="qc-imports__details">
                {detailFields.map(([key, value]) => (
                  <div key={key}>
                    <dt>{t(`qc.imports.field.${key}`)}</dt>
                    <dd>{valueText(value)}</dd>
                  </div>
                ))}
              </dl>
              {detail.qcRawObservation && (
                <details className="qc-imports__raw">
                  <summary>{t("qc.imports.raw")}</summary>
                  <pre>
                    {typeof detail.qcRawObservation === "string"
                      ? detail.qcRawObservation
                      : JSON.stringify(detail.qcRawObservation, null, 2)}
                  </pre>
                </details>
              )}
              <div className="qc-imports__links">
                <Link to="/analyzers/qc/control-lots">
                  {t("qc.imports.configureLots")}
                </Link>
                {detail.qcResultId && detail.analyzerId && (
                  <Link
                    to={`/analyzers/qc/instruments/${encodeURIComponent(detail.analyzerId)}`}
                  >
                    {t("qc.imports.instrumentQC")}
                  </Link>
                )}
              </div>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button kind="secondary" onClick={closeDetail}>
            {t("button.close")}
          </Button>
          <Button
            kind="tertiary"
            disabled={detailLoading || processing.has(selectedId)}
            onClick={() => loadDetail(selectedId)}
          >
            {t("qc.imports.check")}
          </Button>
          <Button
            kind="primary"
            disabled={
              detail?.canRetry !== true ||
              !!detail?.qcResultId ||
              needsReadback ||
              detailLoading ||
              processing.has(selectedId) ||
              !["PENDING", "NOT_PROCESSED", "UNKNOWN"].includes(
                detail?.qcProcessingStatus,
              )
            }
            onClick={reprocess}
          >
            {t(
              processing.has(selectedId)
                ? "qc.imports.processing"
                : detail?.qcProcessingStatus === "UNKNOWN" &&
                    detail?.canRetry &&
                    !detail?.qcResultId
                  ? "qc.imports.reprocessReviewed"
                  : "qc.imports.reprocess",
            )}
          </Button>
        </ModalFooter>
      </ComposedModal>
    </div>
  );
};

export default QCImports;
