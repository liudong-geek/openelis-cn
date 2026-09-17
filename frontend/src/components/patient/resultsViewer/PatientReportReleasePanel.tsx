import React, { useEffect, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Column,
  Grid,
  InlineLoading,
  InlineNotification,
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
  TextArea,
  TextInput,
  Tile,
} from "@carbon/react";
import { useIntl } from "react-intl";
import * as api from "./patient-report-release-api";
import type {
  FrozenReport,
  GroupRules,
  ReleaseDetail,
  ReportApplication,
  ReportDocument,
  ReportRelease,
  ReportRequest,
} from "./patient-report-release-api";
import {
  clearPendingReport,
  pendingReportKey,
  readPendingReport,
  rememberPendingReport,
  useReportSession,
} from "./reportWorkspaceState";
import type { PendingReportOperation } from "./reportWorkspaceState";

interface Props {
  patientId: string;
  canManage: boolean;
}
export default function PatientReportReleasePanel(props: Props) {
  const session = useReportSession();
  const intl = useIntl();
  if (!session.valid || !session.stamp || !api.reportId(props.patientId))
    return (
      <InlineNotification
        kind="warning"
        lowContrast
        hideCloseButton
        title={intl.formatMessage({ id: "report.release.error.session" })}
      />
    );
  return (
    <ReportWorkspace
      key={session.key + ":" + props.patientId}
      {...props}
      request={{ stamp: session.stamp, current: session.current }}
    />
  );
}
function ReportWorkspace({
  patientId,
  canManage,
  request,
}: Props & { request: ReportRequest }) {
  const intl = useIntl();
  const t = (id: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id: `report.release.${id}` }, values);
  const latest = useRef({ request, canManage });
  latest.current = { request, canManage };
  const mounted = useRef(true),
    generation = useRef(0),
    busyRef = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  const [applications, setApplications] = useState<ReportApplication[]>([]);
  const [rules, setRules] = useState<GroupRules | null>(null);
  const [application, setApplication] = useState<ReportApplication | null>(
    null,
  );
  const [groupKey, setGroupKey] = useState("");
  const [documents, setDocuments] = useState<ReportDocument[]>([]);
  const [doc, setDoc] = useState<ReportDocument | null>(null);
  const [releases, setReleases] = useState<ReportRelease[]>([]);
  const [detail, setDetail] = useState<ReleaseDetail | null>(null);
  const [frozen, setFrozen] = useState<FrozenReport | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const pendingKey = pendingReportKey(request.stamp.identity, patientId);
  const [pending, setPending] = useState(() => readPendingReport(pendingKey));
  const [pdf, setPdf] = useState<{ url: string; kind: string } | null>(null);
  const pdfUrl = useRef<string | null>(null);
  const clearPdf = () => {
    if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current);
    pdfUrl.current = null;
    setPdf(null);
  };
  const clearReview = () => {
    setDetail(null);
    setFrozen(null);
    setConfirmed(false);
    setPassword("");
    setVoidReason("");
    clearPdf();
  };
  const invalidate = () => {
    generation.current += 1;
    controllers.current.forEach((c) => c.abort());
    controllers.current.clear();
    setError("");
    setSuccess("");
    clearReview();
    return generation.current;
  };
  const freshRequest = (g = generation.current): ReportRequest => {
    const controller = new AbortController();
    controllers.current.add(controller);
    return {
      ...request,
      signal: controller.signal,
      current: () =>
        mounted.current &&
        generation.current === g &&
        latest.current.request.current(),
    };
  };
  const showError = (e: unknown) =>
    setError(
      e instanceof api.ReportApiError
        ? e.message.replace("report.release.", "")
        : "error.read",
    );
  const read = async (
    load: (c: ReportRequest) => Promise<void>,
    g = generation.current,
  ) => {
    const c = freshRequest(g);
    setLoading(true);
    try {
      await load(c);
    } catch (e) {
      if (c.current()) showError(e);
    } finally {
      if (c.current()) setLoading(false);
    }
  };
  useEffect(() => {
    mounted.current = true;
    void read(async (c) => {
      const [apps, groupRules] = await Promise.all([
        api.getReportApplications(patientId, c),
        api.getReportRules(c),
      ]);
      if (c.current()) {
        setApplications(apps);
        setRules(groupRules);
      }
    });
    return () => {
      mounted.current = false;
      generation.current++;
      controllers.current.forEach((c) => c.abort());
      if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current);
    };
    // Remount on patient/session/check-generation changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const selectApplication = (sampleId: string) => {
    if (busyRef.current) return;
    const g = invalidate();
    const app = applications.find((a) => a.sampleId === sampleId) || null;
    setApplication(app);
    setDoc(null);
    setDocuments([]);
    setReleases([]);
    setGroupKey("");
    setReason("");
    if (app)
      void read(async (c) => {
        const rows = await api.getReportDocuments(app, c);
        if (c.current()) setDocuments(rows);
      }, g);
  };
  const loadDocument = async (
    id: string,
    app: ReportApplication,
    c: ReportRequest,
    preferred?: number,
  ) => {
    const document = await api.getReportDocument(id, app, c);
    const history = await api.getReportReleases(document, c);
    if (!c.current()) return;
    setDoc(document);
    setReleases(history);
    const release = history.find((r) => r.id === preferred) || history[0];
    if (release) {
      const value = await api.getReportRelease(document, release.id, c);
      if (c.current()) setDetail(value);
    }
  };
  const selectDocument = (id: string) => {
    if (busyRef.current || !application) return;
    const g = invalidate();
    setDoc(null);
    setReleases([]);
    setReason("");
    if (id) void read((c) => loadDocument(id, application, c), g);
  };
  const selectRelease = (id: number) => {
    if (busyRef.current || !doc) return;
    const g = invalidate();
    void read(async (c) => {
      const value = await api.getReportRelease(doc, id, c);
      if (c.current()) setDetail(value);
    }, g);
  };
  const write = async (
    operation: PendingReportOperation,
    action: (c: ReportRequest) => Promise<void>,
  ) => {
    if (
      busyRef.current ||
      !latest.current.canManage ||
      !latest.current.request.current() ||
      readPendingReport(pendingKey)
    )
      return;
    const c = freshRequest();
    busyRef.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    setPassword("");
    let sent = false;
    try {
      rememberPendingReport(pendingKey, operation, c);
      setPending(operation);
      sent = true;
      await action(c);
      if (c.current()) {
        clearPendingReport(pendingKey);
        setPending(null);
        setSuccess(t("saved"));
      }
    } catch (e) {
      if (c.current()) {
        if (sent && e instanceof api.ReportApiError && e.kind === "rejected") {
          clearPendingReport(pendingKey);
          setPending(null);
          clearReview();
        }
        showError(e);
      }
    } finally {
      busyRef.current = false;
      if (c.current()) setBusy(false);
    }
  };
  const refresh = () => {
    if (busyRef.current) return;
    const g = invalidate();
    void read(async (c) => {
      const apps = await api.getReportApplications(patientId, c);
      const groupRules = await api.getReportRules(c);
      if (!c.current()) return;
      setApplications(apps);
      setRules(groupRules);
      const app = apps.find((a) => a.sampleId === application?.sampleId);
      if (!app) {
        setApplication(null);
        setDocuments([]);
        setDoc(null);
        setReleases([]);
        return;
      }
      setApplication(app);
      const docs = await api.getReportDocuments(app, c);
      if (!c.current()) return;
      setDocuments(docs);
      if (
        pending?.kind === "document" &&
        pending.sampleId === app.sampleId &&
        docs.some((d) => d.groupKey === pending.groupKey)
      ) {
        clearPendingReport(pendingKey);
        setPending(null);
      }
      const selected = docs.find(
        (d) => d.id === doc?.id || d.id === pending?.docId,
      );
      if (!selected) {
        setDoc(null);
        setReleases([]);
        return;
      }
      await loadDocument(
        selected.id,
        app,
        c,
        pending?.releaseId || detail?.release.id,
      );
      if (!c.current() || !pending || pending.docId !== selected.id) return;
      const history = await api.getReportReleases(selected, c);
      const found = history.find((r) => r.id === pending.releaseId);
      let reconciled =
        pending.kind === "draft" &&
        history.some((r) => r.reportVersion > (pending.beforeVersion || 0));
      if (found) {
        const current = await api.getReportRelease(selected, found.id, c);
        if (pending.kind === "issue")
          reconciled =
            current.release.status !== "DRAFT" &&
            !!current.release.issuedAt &&
            api.reportHash(current.release.pdfSha256);
        if (pending.kind === "void")
          reconciled =
            current.release.status === "VOIDED" &&
            current.release.pdfSha256 === pending.expectedHash;
        // A later print could belong to another user. Its counter alone cannot
        // prove this lost request completed, so unknown print stays blocked.
        if (pending.kind === "freeze") {
          const snapshot = await api.getReportSnapshot(selected, found, c);
          if (c.current()) {
            setFrozen(snapshot);
            reconciled = true;
          }
        }
      }
      if (c.current() && reconciled) {
        clearPendingReport(pendingKey);
        setPending(null);
        setSuccess(t("reconciled"));
      }
    }, g);
  };
  const openPdf = async (
    kind: "original" | "preview" | "print",
    c: ReportRequest,
  ) => {
    if (!doc || !detail) return;
    const current = await api.getReportRelease(doc, detail.release.id, c);
    if (
      current.release.reportVersion !== detail.release.reportVersion ||
      (kind === "print" && !current.canPrintCurrent) ||
      (kind === "original" && !current.canReviewOriginal) ||
      (kind === "preview" && (!frozen || current.release.status !== "DRAFT"))
    )
      throw new api.ReportApiError("rejected", 409);
    const blob = await api.getReportPdf(doc, current.release, kind, c);
    if (c.current()) {
      clearPdf();
      pdfUrl.current = URL.createObjectURL(blob);
      setPdf({ url: pdfUrl.current, kind });
      setDetail(current);
    }
  };
  const draft = detail?.release.status === "DRAFT";
  const currentIssued =
    detail?.release.status === "ISSUED" && detail.canPrintCurrent;
  const locked = busy || loading || !!pending || !canManage;
  const hasPrevious = releases.some((r) => r.status !== "DRAFT");
  return (
    <Grid fullWidth className="orderLegendBody">
      <Column lg={16} md={8} sm={4}>
        <Tile>
          <Stack gap={5}>
            <h3>{t("title")}</h3>
            <p>{t("help")}</p>
            {error && (
              <InlineNotification
                kind="error"
                lowContrast
                hideCloseButton
                title={t(error)}
              />
            )}
            {success && (
              <InlineNotification
                kind="success"
                lowContrast
                hideCloseButton
                title={success}
              />
            )}
            {pending && (
              <InlineNotification
                kind="warning"
                lowContrast
                hideCloseButton
                title={t("pending")}
                subtitle={t("pending.help")}
              />
            )}
            {loading && <InlineLoading description={t("loading")} />}
            <Button kind="tertiary" disabled={busy} onClick={refresh}>
              {t("refresh")}
            </Button>
            <Select
              id="report-application"
              labelText={t("application")}
              value={application?.sampleId || ""}
              disabled={busy || loading}
              onChange={(e) => selectApplication(e.target.value)}
            >
              <SelectItem value="" text={t("chooseApplication")} />
              {applications.map((a) => (
                <SelectItem
                  key={a.sampleId}
                  value={a.sampleId}
                  text={a.accessionNumber}
                />
              ))}
            </Select>
            {!loading && !applications.length && <p>{t("noApplications")}</p>}
            {application && (
              <>
                <Grid condensed>
                  <Column lg={8} md={4} sm={4}>
                    <Select
                      id="report-group"
                      labelText={t("group")}
                      value={groupKey}
                      disabled={locked}
                      onChange={(e) => setGroupKey(e.target.value)}
                    >
                      <SelectItem value="" text={t("chooseGroup")} />
                      {rules?.groups.map((g) => (
                        <SelectItem key={g.key} value={g.key} text={g.label} />
                      ))}
                    </Select>
                  </Column>
                  <Column lg={8} md={4} sm={4}>
                    <Button
                      disabled={locked || !groupKey}
                      onClick={() =>
                        void write(
                          {
                            kind: "document",
                            sampleId: application.sampleId,
                            groupKey,
                          },
                          async (c) => {
                            const value = await api.prepareReportDocument(
                              application,
                              groupKey,
                              c,
                            );
                            const docs = await api.getReportDocuments(
                              application,
                              c,
                            );
                            if (c.current()) {
                              setDocuments(docs);
                              clearReview();
                            }
                            await loadDocument(value.id, application, c);
                          },
                        )
                      }
                    >
                      {t("prepareDocument")}
                    </Button>
                  </Column>
                </Grid>
                <Select
                  id="report-document"
                  labelText={t("document")}
                  value={doc?.id || ""}
                  disabled={busy || loading}
                  onChange={(e) => selectDocument(e.target.value)}
                >
                  <SelectItem value="" text={t("chooseDocument")} />
                  {documents.map((d) => (
                    <SelectItem
                      key={d.id}
                      value={d.id}
                      text={`${d.reportNumber} · ${rules?.groups.find((g) => g.key === d.groupKey)?.label || d.groupKey} (${d.ruleVersion})`}
                    />
                  ))}
                </Select>
              </>
            )}
            {doc && (
              <>
                <p>
                  {t("documentScope", {
                    number: doc.reportNumber,
                    count: doc.analysisIds.length,
                    rule: doc.ruleVersion,
                  })}
                </p>
                <Select
                  id="report-version"
                  labelText={t("version")}
                  value={detail?.release.id || ""}
                  disabled={busy || loading}
                  onChange={(e) => selectRelease(Number(e.target.value))}
                >
                  <SelectItem value="" text={t("chooseVersion")} />
                  {releases.map((r) => (
                    <SelectItem
                      key={r.id}
                      value={r.id}
                      text={t("versionLabel", {
                        version: r.reportVersion,
                        status: t(`status.${r.status}`),
                      })}
                    />
                  ))}
                </Select>
                {!releases.some((r) => r.status === "DRAFT") && (
                  <>
                    <TextArea
                      id="report-amendment"
                      labelText={t(
                        hasPrevious ? "amendmentRequired" : "amendment",
                      )}
                      value={reason}
                      disabled={locked}
                      maxLength={2000}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <Button
                      disabled={locked || (hasPrevious && !reason.trim())}
                      onClick={() =>
                        void write(
                          {
                            kind: "draft",
                            docId: doc.id,
                            beforeVersion: Math.max(
                              0,
                              ...releases.map((r) => r.reportVersion),
                            ),
                          },
                          async (c) => {
                            const value = await api.createReportDraft(
                              doc,
                              reason,
                              c,
                            );
                            if (c.current()) {
                              clearReview();
                              setReason("");
                            }
                            await loadDocument(
                              doc.id,
                              application!,
                              c,
                              value.id,
                            );
                          },
                        )
                      }
                    >
                      {t(hasPrevious ? "createAmendment" : "createDraft")}
                    </Button>
                  </>
                )}
              </>
            )}
            {detail && doc && (
              <>
                <Tag
                  type={draft ? "gray" : currentIssued ? "green" : "warm-gray"}
                >
                  {t(`status.${detail.release.status}`)}
                </Tag>
                <p>
                  {t("releaseIdentity", {
                    number: detail.release.reportNumber,
                    version: detail.release.reportVersion,
                  })}
                </p>
                {detail.release.issuedByName && (
                  <p>
                    {t("issuer", {
                      name: detail.release.issuedByName,
                      date: detail.release.issuedAt
                        ? intl.formatDate(new Date(detail.release.issuedAt), {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—",
                    })}
                  </p>
                )}
                {detail.release.amendmentReason && (
                  <p>
                    {t("amendment")}: {detail.release.amendmentReason}
                  </p>
                )}
                {detail.release.voidReason && (
                  <p>
                    {t("voidReason")}: {detail.release.voidReason}
                  </p>
                )}
                {detail.canReviewOriginal && (
                  <Button
                    kind="tertiary"
                    disabled={busy || loading}
                    onClick={() => void read((c) => openPdf("original", c))}
                  >
                    {t("original")}
                  </Button>
                )}
                {currentIssued && (
                  <>
                    <p>
                      {t("printCount", {
                        count: detail.release.printCount || 0,
                      })}
                    </p>
                    <Button
                      disabled={locked}
                      onClick={() =>
                        void write(
                          {
                            kind: "print",
                            docId: doc.id,
                            releaseId: detail.release.id,
                            beforePrintCount: detail.release.printCount || 0,
                          },
                          (c) => openPdf("print", c),
                        )
                      }
                    >
                      {t("print")}
                    </Button>
                    <TextArea
                      id="report-void-reason"
                      labelText={t("voidReason")}
                      value={voidReason}
                      disabled={locked}
                      maxLength={2000}
                      onChange={(e) => setVoidReason(e.target.value)}
                    />
                  </>
                )}
                {draft && (
                  <>
                    <Button
                      disabled={locked}
                      onClick={() =>
                        void write(
                          {
                            kind: "freeze",
                            docId: doc.id,
                            releaseId: detail.release.id,
                          },
                          async (c) => {
                            await api.freezeReport(doc, detail.release, c);
                            const value = await api.getReportSnapshot(
                              doc,
                              detail.release,
                              c,
                            );
                            if (c.current()) {
                              setFrozen(value);
                              setConfirmed(false);
                              clearPdf();
                            }
                          },
                        )
                      }
                    >
                      {t("freeze")}
                    </Button>
                    <Button
                      kind="tertiary"
                      disabled={busy || loading}
                      onClick={() => {
                        setFrozen(null);
                        setConfirmed(false);
                        setPassword("");
                        void read(async (c) => {
                          const value = await api.getReportSnapshot(
                            doc,
                            detail.release,
                            c,
                          );
                          if (c.current()) setFrozen(value);
                        });
                      }}
                    >
                      {t("readSnapshot")}
                    </Button>
                  </>
                )}
                {frozen && draft && (
                  <>
                    <InlineNotification
                      kind="info"
                      lowContrast
                      hideCloseButton
                      title={t("frozen")}
                      subtitle={t("frozen.help")}
                    />
                    <h4>{frozen.snapshot.template.title}</h4>
                    <p>{frozen.snapshot.template.laboratoryName}</p>
                    <p>
                      {t("templateVersion", {
                        version: frozen.snapshot.template.version,
                      })}
                    </p>
                    <div style={{ overflowX: "auto" }}>
                      <Table aria-label={t("frozen")}>
                        <TableHead>
                          <TableRow>
                            {frozen.snapshot.report.columns.map((col) => (
                              <TableHeader key={col.key}>
                                {col.header}
                              </TableHeader>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {frozen.snapshot.report.rows.map((row, i) => (
                            <TableRow key={i}>
                              {row.cells.map((cell, j) => (
                                <TableCell key={j}>
                                  {cell == null ? "—" : String(cell)}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {frozen.snapshot.report.message && (
                      <p>{frozen.snapshot.report.message}</p>
                    )}
                    <p>{frozen.snapshot.template.footerText}</p>
                    <Button
                      kind="tertiary"
                      disabled={busy || loading}
                      onClick={() => void read((c) => openPdf("preview", c))}
                    >
                      {t("preview")}
                    </Button>
                    <Checkbox
                      id="report-confirm-frozen"
                      labelText={t("confirmFrozen")}
                      checked={confirmed}
                      disabled={locked}
                      onChange={(_, data) => setConfirmed(data.checked)}
                    />
                  </>
                )}
                {(currentIssued || (draft && frozen)) && (
                  <TextInput
                    id="report-password"
                    type="password"
                    autoComplete="off"
                    labelText={t("password")}
                    value={password}
                    disabled={locked}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                )}
                {draft && frozen && (
                  <Button
                    disabled={locked || !confirmed || !password}
                    onClick={() => {
                      if (
                        !confirmed ||
                        !password ||
                        !frozen ||
                        frozen.releaseId !== detail.release.id ||
                        frozen.snapshot.reportVersion !==
                          detail.release.reportVersion
                      )
                        return;
                      const credential = password;
                      void write(
                        {
                          kind: "issue",
                          docId: doc.id,
                          releaseId: detail.release.id,
                          expectedHash: frozen.snapshotSha256,
                        },
                        async (c) => {
                          await api.issueReport(
                            doc,
                            detail.release,
                            frozen.snapshotSha256,
                            credential,
                            c,
                          );
                          if (c.current()) clearReview();
                          await loadDocument(
                            doc.id,
                            application!,
                            c,
                            detail.release.id,
                          );
                        },
                      );
                    }}
                  >
                    {t("issue")}
                  </Button>
                )}
                {currentIssued && (
                  <Button
                    kind="danger--tertiary"
                    disabled={
                      locked ||
                      !password ||
                      !voidReason.trim() ||
                      !api.reportHash(detail.release.pdfSha256)
                    }
                    onClick={() => {
                      const credential = password;
                      void write(
                        {
                          kind: "void",
                          docId: doc.id,
                          releaseId: detail.release.id,
                          expectedHash: detail.release.pdfSha256,
                        },
                        async (c) => {
                          await api.voidReport(
                            doc,
                            detail.release,
                            credential,
                            voidReason,
                            c,
                          );
                          if (c.current()) clearReview();
                          await loadDocument(
                            doc.id,
                            application!,
                            c,
                            detail.release.id,
                          );
                        },
                      );
                    }}
                  >
                    {t("void")}
                  </Button>
                )}
              </>
            )}
            {pdf && (
              <>
                <InlineNotification
                  kind="info"
                  hideCloseButton
                  title={t(`pdf.${pdf.kind}`)}
                />
                <iframe
                  title={t(`pdf.${pdf.kind}`)}
                  src={pdf.url}
                  width="100%"
                  height="600"
                />
              </>
            )}
          </Stack>
        </Tile>
      </Column>
    </Grid>
  );
}
