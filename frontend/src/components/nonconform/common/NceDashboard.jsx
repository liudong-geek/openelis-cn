import React, { useEffect, useRef, useState } from "react";
import {
  Button,
  InlineNotification,
  Pagination,
  Search,
  Select,
  SelectItem,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
} from "@carbon/react";
import {
  Add,
  ChevronDown,
  ChevronUp,
  Download,
  View,
} from "@carbon/react/icons";
import { useIntl } from "react-intl";
import { useHistory, useLocation } from "react-router-dom";
import {
  nceOptionLabel,
  nceStatusLabel,
  NCE_STATUS_KEYS,
  nceHistoryActivity,
  nceHistoryDescription,
} from "./ncePresentation";
import {
  clearNceOperation,
  NCE_PAGE_SIZES,
  pendingNceOperation,
  readNceAttachment,
  readNceReceipt,
  readNceWorkspace,
} from "./nceWorkspaceRequest";
import { useNceScope } from "./useNceScope";
import NceRegistrationModal from "./NceRegistrationModal";
import NceEventActionModal from "./NceEventActionModal";
import "./NceDashboard.css";

const emptyQuery = { keyword: "", status: "", categoryId: "", severity: "" };
const restore = (search) => {
  const p = new URLSearchParams(search),
    page = Number(p.get("page")),
    size = Number(p.get("pageSize"));
  return {
    query: Object.fromEntries(
      Object.keys(emptyQuery).map((k) => [k, p.get(k) || ""]),
    ),
    page: Number.isSafeInteger(page) && page >= 1 ? page : 1,
    pageSize: NCE_PAGE_SIZES.includes(size) ? size : 25,
  };
};
export const NceDashboard = ({ registrationOpen = false }) => {
  const intl = useIntl(),
    history = useHistory(),
    location = useLocation(),
    scope = useNceScope(),
    t = (id) => intl.formatMessage({ id });
  const initial = useRef(restore(location.search));
  const [criteria, setCriteria] = useState(initial.current),
    [draftQuery, setDraftQuery] = useState(initial.current.query),
    [refresh, setRefresh] = useState(0),
    [state, setState] = useState({ phase: "loading", owner: null, epoch: -1 }),
    [expanded, setExpanded] = useState({}),
    [registration, setRegistration] = useState(registrationOpen),
    [action, setAction] = useState(null),
    [feedback, setFeedback] = useState(null),
    [pending, setPending] = useState(null),
    [receiptBusy, setReceiptBusy] = useState(false),
    [attachmentBusy, setAttachmentBusy] = useState(null);
  const receiptLock = useRef(false),
    downloadLock = useRef(false),
    urls = useRef(new Map()),
    queryEpoch = useRef(0),
    criteriaRef = useRef(criteria),
    lastScope = useRef({ owner: scope.owner, epoch: scope.epoch });
  criteriaRef.current = criteria;
  const active =
    scope.owner &&
    state.phase === "success" &&
    state.owner === scope.owner &&
    state.epoch === scope.epoch &&
    state.criteria === criteria;
  const value = active ? state.value : null;
  const cleanupUrls = () => {
    for (const [url, timer] of urls.current) {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    }
    urls.current.clear();
  };
  useEffect(() => {
    cleanupUrls();
    setExpanded({});
    setAction(null);
    if (
      lastScope.current.owner !== scope.owner ||
      lastScope.current.epoch !== scope.epoch
    ) {
      setFeedback(null);
      lastScope.current = { owner: scope.owner, epoch: scope.epoch };
    }
    setPending(scope.owner ? pendingNceOperation(scope.owner) : null);
    setAttachmentBusy(null);
    downloadLock.current = false;
    setReceiptBusy(false);
    receiptLock.current = false;
    const atOwner = scope.owner,
      atEpoch = scope.epoch,
      seq = ++queryEpoch.current;
    setState({
      phase: atOwner ? "loading" : "error",
      owner: atOwner,
      epoch: atEpoch,
      criteria,
    });
    if (!atOwner) return;
    let alive = true;
    const params = new URLSearchParams({
      ...criteria.query,
      page: String(criteria.page),
      pageSize: String(criteria.pageSize),
    });
    history.replace({ pathname: location.pathname, search: `?${params}` });
    scope
      .run((signal, owner) =>
        readNceWorkspace(
          criteria.query,
          criteria.page,
          criteria.pageSize,
          signal,
          owner,
        ),
      )
      .then((v) => {
        if (
          !alive ||
          seq !== queryEpoch.current ||
          !scope.isCurrent(atOwner, atEpoch)
        )
          return;
        setState({
          phase: "success",
          owner: atOwner,
          epoch: atEpoch,
          criteria,
          value: v,
        });
      })
      .catch((error) => {
        if (
          alive &&
          seq === queryEpoch.current &&
          scope.isCurrent(atOwner, atEpoch)
        )
          setState({
            phase: "error",
            owner: atOwner,
            epoch: atEpoch,
            criteria,
            errorKind: error.kind,
          });
      });
    return () => {
      alive = false;
      cleanupUrls();
    };
  }, [criteria, refresh, scope.owner, scope.epoch]);
  useEffect(() => () => cleanupUrls(), []);
  const changeFilter = (key, v) => {
    setDraftQuery((q) => ({ ...q, [key]: v }));
    setCriteria((c) => ({ ...c, query: { ...c.query, [key]: v }, page: 1 }));
    setFeedback(null);
  };
  const search = () => {
    setCriteria((c) => ({ ...c, query: { ...draftQuery }, page: 1 }));
    setFeedback(null);
  };
  const closeRegistration = () => {
    setRegistration(false);
    if (registrationOpen)
      history.replace({ pathname: "/NceDashboard", search: location.search });
  };
  const scopeUnavailable = (errorKind) => {
    queryEpoch.current += 1;
    cleanupUrls();
    setExpanded({});
    setPending(pendingNceOperation(scope.owner));
    setState({
      phase: "error",
      owner: scope.owner,
      epoch: scope.epoch,
      criteria,
      errorKind,
    });
  };
  const saved = (receipt, errorKind) => {
    closeRegistration();
    setAction(null);
    setPending(null);
    setFeedback(
      receipt
        ? {
            kind: "success",
            id: "nce.workspace.applied",
            number: receipt.nceNumber,
          }
        : {
            kind: "warning",
            id: ["forbidden", "scope", "unauthenticated"].includes(errorKind)
              ? "nce.workspace.error.forbidden"
              : "nce.workspace.eventChanged",
          },
    );
    setRefresh((n) => n + 1);
  };
  const checkReceipt = async () => {
    if (!scope.owner || !pending || receiptLock.current) return;
    const atOwner = scope.owner,
      atEpoch = scope.epoch;
    receiptLock.current = true;
    setReceiptBusy(true);
    try {
      const receipt = await scope.run((signal, owner) =>
        readNceReceipt(
          pending.requestId,
          pending.operation,
          pending.eventId,
          signal,
          owner,
        ),
      );
      if (!scope.isCurrent(atOwner, atEpoch)) return;
      if (receipt.outcome === "APPLIED") {
        clearNceOperation(atOwner, receipt.requestId);
        saved(receipt);
      } else
        setFeedback({ kind: "warning", id: "nce.workspace.notFoundReceipt" });
    } catch (error) {
      if (scope.isCurrent(atOwner, atEpoch)) {
        setFeedback({ kind: "warning", id: "nce.workspace.unknown" });
        if (["scope", "unauthenticated", "forbidden"].includes(error.kind))
          setState({
            phase: "error",
            owner: atOwner,
            epoch: atEpoch,
            criteria,
            errorKind: error.kind,
          });
      }
    } finally {
      if (scope.isCurrent(atOwner, atEpoch)) {
        receiptLock.current = false;
        setReceiptBusy(false);
      }
    }
  };
  const download = async (row, attachment, preview = false) => {
    if (!active || downloadLock.current) return;
    const atOwner = scope.owner,
      atEpoch = scope.epoch,
      atCriteria = criteria;
    downloadLock.current = true;
    setAttachmentBusy(attachment.id);
    try {
      const blob = await scope.run((signal, owner) =>
        readNceAttachment(attachment, row.id, signal, owner),
      );
      if (
        !scope.isCurrent(atOwner, atEpoch) ||
        atCriteria !== criteriaRef.current
      )
        return;
      if (
        preview &&
        ![
          "application/pdf",
          "image/png",
          "image/jpeg",
          "image/gif",
          "text/plain",
        ].includes(blob.type)
      )
        throw new Error("previewUnavailable");
      const url = URL.createObjectURL(blob);
      if (preview) {
        const opened = window.open(url, "_blank");
        if (!opened) {
          URL.revokeObjectURL(url);
          throw new Error("previewBlocked");
        }
        opened.opener = null;
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = (attachment.fileName || "attachment").replace(
          /[\u0000-\u001f\u007f/\\]/g,
          "_",
        );
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.current.delete(url);
      }, 60000);
      urls.current.set(url, timer);
    } catch (error) {
      if (
        scope.isCurrent(atOwner, atEpoch) &&
        atCriteria === criteriaRef.current
      ) {
        setFeedback({
          kind: "error",
          id: preview
            ? "nce.attachment.viewError"
            : "nce.attachment.downloadError",
        });
        if (["scope", "unauthenticated", "forbidden"].includes(error.kind))
          setState({
            phase: "error",
            owner: atOwner,
            epoch: atEpoch,
            criteria,
            errorKind: error.kind,
          });
      }
    } finally {
      if (
        scope.isCurrent(atOwner, atEpoch) &&
        atCriteria === criteriaRef.current
      ) {
        downloadLock.current = false;
        setAttachmentBusy(null);
      }
    }
  };
  const categories = value?.categories || [];
  return (
    <div className="nce-dashboard">
      <div className="nce-dashboard-header">
        <div>
          <h1>{t("nce.dashboard.title")}</h1>
          <p>{t("nce.dashboard.subtitle")}</p>
        </div>
        <Button
          renderIcon={Add}
          disabled={!active || !value.canCreate || !!pending}
          onClick={() => setRegistration(true)}
        >
          {t("nce.button.reportNce")}
        </Button>
      </div>
      {active && !value.canCreate && (
        <p className="nce-helper-text">{t("nce.workspace.createDenied")}</p>
      )}
      <div className="nce-filter-bar">
        <Search
          id="nce-workspace-keyword"
          labelText={t("nce.search.placeholder")}
          placeholder={t("nce.search.placeholder")}
          value={draftQuery.keyword}
          onChange={(e) => {
            queryEpoch.current += 1;
            setDraftQuery((q) => ({ ...q, keyword: e.target.value }));
            setState({ phase: "idle", owner: scope.owner, epoch: scope.epoch });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") search();
          }}
        />
        <Button kind="tertiary" onClick={search}>
          {t("label.button.search")}
        </Button>
        <Select
          id="nce-filter-status"
          labelText={t("nce.filter.allStatus")}
          value={draftQuery.status}
          onChange={(e) => changeFilter("status", e.target.value)}
        >
          <SelectItem value="" text={t("nce.filter.allStatus")} />
          {Object.keys(NCE_STATUS_KEYS).map((s) => (
            <SelectItem key={s} value={s} text={nceStatusLabel(s, intl)} />
          ))}
        </Select>
        <Select
          id="nce-filter-category"
          labelText={t("nce.filter.allCategories")}
          value={draftQuery.categoryId}
          onChange={(e) => changeFilter("categoryId", e.target.value)}
        >
          <SelectItem value="" text={t("nce.filter.allCategories")} />
          {categories.map((c) => (
            <SelectItem
              key={c.id}
              value={c.id}
              text={nceOptionLabel(c, intl)}
            />
          ))}
        </Select>
        <Select
          id="nce-filter-severity"
          labelText={t("nce.filter.allSeverities")}
          value={draftQuery.severity}
          onChange={(e) => changeFilter("severity", e.target.value)}
        >
          <SelectItem value="" text={t("nce.filter.allSeverities")} />
          {["CRITICAL", "MAJOR", "MINOR"].map((s) => (
            <SelectItem
              key={s}
              value={s}
              text={t(`nce.severity.${s.toLowerCase()}`)}
            />
          ))}
        </Select>
        <Button
          kind="ghost"
          onClick={() => {
            setDraftQuery(emptyQuery);
            setCriteria((c) => ({ ...c, query: emptyQuery, page: 1 }));
          }}
        >
          {t("nce.filter.clearAll")}
        </Button>
      </div>
      {feedback &&
        scope.owner &&
        state.owner === scope.owner &&
        state.epoch === scope.epoch && (
          <InlineNotification
            lowContrast
            kind={feedback.kind}
            hideCloseButton
            title={intl.formatMessage(
              { id: feedback.id },
              { number: feedback.number },
            )}
          />
        )}
      {pending && (
        <div className="nce-receipt-check">
          <p>{t("nce.workspace.unknown")}</p>
          <Button kind="tertiary" disabled={receiptBusy} onClick={checkReceipt}>
            {t("nce.workspace.checkReceipt")}
          </Button>
        </div>
      )}
      {state.phase === "loading" && (
        <p role="status">{t("nce.dashboard.loading")}</p>
      )}
      {!scope.owner && (
        <p role="alert">{t("nce.workspace.error.unauthenticated")}</p>
      )}
      {state.phase === "error" && scope.owner && (
        <div role="alert">
          <p>
            {t(
              state.errorKind === "forbidden"
                ? "nce.workspace.error.forbidden"
                : "nce.workspace.error.unavailable",
            )}
          </p>
          <Button kind="tertiary" onClick={() => setRefresh((n) => n + 1)}>
            {t("nce.workspace.retry")}
          </Button>
          {criteria.page > 1 && (
            <Button
              kind="tertiary"
              onClick={() => setCriteria((q) => ({ ...q, page: 1 }))}
            >
              {t("nce.workspace.firstPage")}
            </Button>
          )}
        </div>
      )}
      {state.phase === "idle" && <p>{t("nce.workspace.searchNeeded")}</p>}
      {active && !value.nceList.length && (
        <p className="nce-empty-state">{t("nce.list.empty")}</p>
      )}
      {active && (
        <div className="nce-list">
          {value.nceList.map((row) => {
            const category = categories.find((c) => c.id === row.nceCategoryId),
              type = category?.types.find((c) => c.id === row.nceTypeId);
            return (
              <article key={row.id} className="nce-list-item">
                <Button
                  kind="ghost"
                  className="nce-list-item-header"
                  aria-expanded={!!expanded[row.id]}
                  aria-controls={`nce-details-${row.id}`}
                  renderIcon={expanded[row.id] ? ChevronUp : ChevronDown}
                  onClick={() =>
                    setExpanded((p) => ({ ...p, [row.id]: !p[row.id] }))
                  }
                >
                  <span className="nce-item-info">
                    <span className="nce-item-top">
                      <strong className="nce-number">
                        {row.nceNumber || "—"}
                      </strong>
                      <Tag
                        type={
                          row.statusCode === "CAPA"
                            ? "purple"
                            : row.statusCode === "Completed" ||
                                row.statusCode === "Closed"
                              ? "gray"
                              : "blue"
                        }
                      >
                        {nceStatusLabel(row.statusCode, intl)}
                        {!NCE_STATUS_KEYS[row.statusCode] && row.statusCode
                          ? ` · ${row.statusCode}`
                          : ""}
                      </Tag>
                      <span>
                        {row.severity
                          ? intl.messages[
                              `nce.severity.${row.severity.toLowerCase()}`
                            ]
                            ? t(`nce.severity.${row.severity.toLowerCase()}`)
                            : row.severity
                          : "—"}
                      </span>
                    </span>
                    <span className="nce-item-title">
                      {row.title || row.description || "—"}
                    </span>
                    <span className="nce-item-meta">
                      {category ? nceOptionLabel(category, intl) : "—"}
                      {type ? ` · ${nceOptionLabel(type, intl)}` : ""}
                      {row.assignedToName
                        ? ` · ${t("nce.assignedToLabel")}: ${row.assignedToName}`
                        : ""}
                    </span>
                  </span>
                </Button>
                {expanded[row.id] && (
                  <div
                    id={`nce-details-${row.id}`}
                    className="nce-list-item-details"
                  >
                    <Tabs>
                      <TabList aria-label={t("nce.tabs.ariaLabel")}>
                        {[
                          "nce.tab.eventDetails",
                          "nce.tab.investigation",
                          "nce.tab.capa",
                          "nce.tab.history",
                        ].map((id) => (
                          <Tab key={id}>{t(id)}</Tab>
                        ))}
                      </TabList>
                      <TabPanels>
                        <TabPanel>
                          <dl className="nce-detail-grid">
                            {["description", "immediateAction"].map((k) => (
                              <div key={k}>
                                <dt>{t(`nce.field.${k}`)}</dt>
                                <dd>{row[k] || "—"}</dd>
                              </div>
                            ))}
                            <div>
                              <dt>{t("nce.field.dateOfEvent")}</dt>
                              <dd>{row.dateOfEvent || "—"}</dd>
                            </div>
                            <div>
                              <dt>{t("nce.field.reporterName")}</dt>
                              <dd>{row.nameOfReporter || "—"}</dd>
                            </div>
                          </dl>
                          <h4>{t("nce.field.linkedItems")}</h4>
                          <ul>
                            {row.linkedSpecimens.map((s) => (
                              <li
                                key={`${s.sampleItemId}:${s.analysisId || ""}`}
                              >
                                {s.labNumber} · {s.typeName || "—"} ·{" "}
                                {t("nce.workspace.specimenRecord")}{" "}
                                {s.sampleItemId}
                                {s.testName ? ` · ${s.testName}` : ""}
                              </li>
                            ))}
                          </ul>
                          <h4>{t("nce.field.attachments")}</h4>
                          <ul>
                            {row.attachments.map((a) => (
                              <li key={a.id}>
                                <Button
                                  kind="ghost"
                                  size="sm"
                                  renderIcon={Download}
                                  disabled={attachmentBusy !== null}
                                  onClick={() => download(row, a)}
                                >
                                  {a.fileName ||
                                    `${t("nce.field.attachments")} ${a.id}`}
                                </Button>
                                {[
                                  "application/pdf",
                                  "image/png",
                                  "image/jpeg",
                                  "image/gif",
                                  "text/plain",
                                ].includes(a.fileType) && (
                                  <Button
                                    kind="ghost"
                                    size="sm"
                                    renderIcon={View}
                                    disabled={attachmentBusy !== null}
                                    aria-label={`${t("nce.attachment.view")} ${a.fileName || a.id}`}
                                    onClick={() => download(row, a, true)}
                                  >
                                    {t("nce.attachment.view")}
                                  </Button>
                                )}
                              </li>
                            ))}
                          </ul>
                        </TabPanel>
                        <TabPanel>
                          <dl className="nce-detail-grid">
                            {["suspectedCauses", "proposedAction"].map((k) => (
                              <div key={k}>
                                <dt>{t(`nce.field.${k}`)}</dt>
                                <dd>{row[k] || "—"}</dd>
                              </div>
                            ))}
                          </dl>
                          <h4>{t("nce.field.notes")}</h4>
                          <ul>
                            {row.notes.map((n, i) => (
                              <li key={n.id || i}>{n.text || "—"}</li>
                            ))}
                          </ul>
                        </TabPanel>
                        <TabPanel>
                          <p>{t("nce.capa.notLoaded")}</p>
                          <Button
                            kind="tertiary"
                            onClick={() => history.push("/NCECorrectiveAction")}
                          >
                            {t("nce.workspace.openCapa")}
                          </Button>
                        </TabPanel>
                        <TabPanel>
                          {row.history.length ? (
                            <ul>
                              {row.history.map((h, i) => (
                                <li key={h.id || i}>
                                  {nceHistoryActivity(h, intl)} ·{" "}
                                  {nceHistoryDescription(h, intl)} ·{" "}
                                  {h.userName || t("nce.history.system")} ·{" "}
                                  {h.timestamp || "—"}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p>{t("nce.history.noItems")}</p>
                          )}
                        </TabPanel>
                      </TabPanels>
                    </Tabs>
                    <div className="nce-detail-actions">
                      {[
                        [
                          "ACKNOWLEDGE",
                          "canAcknowledge",
                          "nce.action.acknowledge",
                        ],
                        ["ASSIGN", "canAssign", "nce.action.assignTo"],
                        ["ADD_NOTE", "canAddNote", "nce.action.addNote"],
                      ].map(([op, cap, id]) => (
                        <Button
                          key={op}
                          kind="tertiary"
                          size="sm"
                          disabled={!row[cap] || !!pending}
                          title={
                            !row[cap]
                              ? t(
                                  op === "ACKNOWLEDGE" &&
                                    row.statusCode !== "Pending"
                                    ? "nce.workspace.acknowledgeNotPending"
                                    : "nce.workspace.updateDenied",
                                )
                              : undefined
                          }
                          onClick={() => setAction({ row, type: op })}
                        >
                          {t(id)}
                        </Button>
                      ))}
                    </div>
                    {row.actionUnavailableReason && (
                      <p className="nce-helper-text">
                        {t("nce.workspace.updateDenied")}
                      </p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {active && (
        <Pagination
          page={value.paging.currentPage}
          pageSize={value.paging.pageSize}
          pageSizes={NCE_PAGE_SIZES}
          totalItems={value.paging.totalResults}
          onChange={({ page, pageSize }) =>
            setCriteria((c) =>
              page === c.page && pageSize === c.pageSize
                ? c
                : { ...c, page: pageSize !== c.pageSize ? 1 : page, pageSize },
            )
          }
          itemsPerPageText={t("pagination.items-per-page")}
          backwardText={t("pagination.backward")}
          forwardText={t("pagination.forward")}
          pageSelectLabelText={(total) =>
            intl.formatMessage({ id: "pagination.page-select" }, { total })
          }
          pageRangeText={(_, total) =>
            intl.formatMessage({ id: "pagination.page-range" }, { total })
          }
          itemRangeText={(min, max, total) =>
            intl.formatMessage(
              { id: "pagination.item-range" },
              { min, max, total },
            )
          }
        />
      )}
      {registration && scope.owner && (
        <NceRegistrationModal
          key={`${scope.owner}:${scope.epoch}`}
          onClose={closeRegistration}
          onSaved={saved}
          onScopeUnavailable={scopeUnavailable}
        />
      )}
      {action &&
        scope.owner &&
        state.owner === scope.owner &&
        state.epoch === scope.epoch && (
          <NceEventActionModal
            key={`${action.row.id}:${scope.owner}:${scope.epoch}`}
            {...action}
            onClose={() => setAction(null)}
            onSaved={saved}
            onScopeUnavailable={scopeUnavailable}
          />
        )}
    </div>
  );
};
export default NceDashboard;
