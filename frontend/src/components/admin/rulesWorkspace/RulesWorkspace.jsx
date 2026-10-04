import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  InlineNotification,
  Loading,
  Modal,
  Pagination,
  Search,
  Select,
  SelectItem,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
  Tag,
  Grid,
  Column,
} from "@carbon/react";
import { Add, ArrowRight } from "@carbon/icons-react";
import { FormattedMessage, useIntl } from "react-intl";
import { Link, useHistory, useLocation } from "react-router-dom";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import RuleEditor, { ruleFailureKey } from "./RuleEditor";
import { RULE_ENDPOINTS, ruleRequest as transport } from "./ruleApi";
import { useReportSession } from "../../patient/resultsViewer/reportWorkspaceState";
import {
  isRuleDetail,
  ruleName,
  readRuleContext,
  ruleContextSearch,
  cloneRule,
} from "./ruleModel";
import { readCreationPending } from "./rulePending";
import "../AdminModal.css";
import "./RulesWorkspace.css";

// i18n-keys: rules.type.* rules.state.* rules.column.*
const PAGE_SIZE = 20;
export default function RulesWorkspace(props) {
  const session = useReportSession(true);
  if (!session.valid || !session.stamp)
    return (
      <InlineNotification
        kind="error"
        title=""
        hideCloseButton
        subtitle={<FormattedMessage id="rules.error.permission" />}
      />
    );
  return (
    <RulesWorkspaceContent
      key={session.key}
      {...props}
      requestContext={{ stamp: session.stamp, current: session.current }}
    />
  );
}
function RulesWorkspaceContent({ defaultType = "all", requestContext }) {
  const requestRef = useRef(requestContext);
  requestRef.current = requestContext;
  const ruleRequest = useCallback(
    (path, options = {}) =>
      transport(path, { ...options, session: requestRef.current }),
    [],
  );
  const intl = useIntl();
  const msg = (id, values) => intl.formatMessage({ id }, values);
  const location = useLocation();
  const history = useHistory();
  const context = readRuleContext(location.search, defaultType);
  const base = location.pathname.startsWith("/admin")
    ? "/admin"
    : "/MasterListsPage";
  const [records, setRecords] = useState([]);
  const [testMap, setTestMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [referencesFailed, setReferencesFailed] = useState(false);
  const [editor, setEditor] = useState(null);
  const [action, setAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [notice, setNotice] = useState("");
  const pendingCreation = {
    reflex: Boolean(readCreationPending("reflex", requestContext)),
    calculation: Boolean(readCreationPending("calculation", requestContext)),
  };
  const loadSequence = useRef(0);
  const editSequence = useRef(0);
  const live = useRef(true);
  const actionLock = useRef(false);
  const actionCloseRef = useRef(() => false);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError(false);
    const [reflex, calculation] = await Promise.all([
      ruleRequest(RULE_ENDPOINTS.reflex.list),
      ruleRequest(RULE_ENDPOINTS.calculation.list),
    ]);
    if (!live.current || sequence !== loadSequence.current) return;
    if (
      ![reflex, calculation].every(
        (response) => response.ok && Array.isArray(response.data),
      ) ||
      !reflex.data.every((record) => isRuleDetail("reflex", record)) ||
      !calculation.data.every((record) => isRuleDetail("calculation", record))
    ) {
      setLoadError(true);
      setLoading(false);
      return;
    }
    const all = [
      ...reflex.data.map((record) => ({ type: "reflex", record })),
      ...calculation.data.map((record) => ({ type: "calculation", record })),
    ].sort(
      (a, b) =>
        a.type.localeCompare(b.type) ||
        Number(a.record.id) - Number(b.record.id),
    );
    setRecords(all);
    setLoading(false);
    const sampleIds = [
      ...new Set(
        all
          .flatMap(({ type, record }) =>
            type === "reflex"
              ? [...record.conditions, ...record.actions].map(
                  (item) => item.sampleId,
                )
              : [
                  record.sampleId,
                  ...record.operations
                    .filter((op) => op.type === "TEST_RESULT")
                    .map((op) => op.sampleId),
                ],
          )
          .filter(Boolean)
          .map(String),
      ),
    ];
    if (!sampleIds.length) {
      setTestMap({});
      setReferencesFailed(false);
      return;
    }
    const response = await ruleRequest(
      `/rest/test-display-beans-map?samplesTypes=${sampleIds.map(encodeURIComponent).join(",")}`,
    );
    if (!live.current || sequence !== loadSequence.current) return;
    const validMap =
      response.data &&
      typeof response.data === "object" &&
      !Array.isArray(response.data) &&
      Object.values(response.data).every(
        (items) =>
          Array.isArray(items) &&
          items.every(
            (test) => test && test.id != null && typeof test.value === "string",
          ),
      );
    if (response.ok && validMap) {
      setTestMap(response.data);
      setReferencesFailed(false);
    } else {
      setTestMap({});
      setReferencesFailed(true);
    }
  }, [ruleRequest]);
  useEffect(() => {
    live.current = true;
    load();
    return () => {
      live.current = false;
      loadSequence.current += 1;
    };
  }, [load]);
  const updateContext = (patch) =>
    history.replace({
      pathname: location.pathname,
      search: ruleContextSearch({ ...context, ...patch }),
    });
  const testName = (sampleId, testId, fallback) =>
    testMap[String(sampleId)]?.find(
      (test) => String(test.id) === String(testId),
    )?.value ||
    fallback ||
    msg("rules.reference.missingId", { id: testId });
  const searchable = ({ type, record }) =>
    [
      ruleName(type, record),
      String(record.id),
      ...(type === "reflex"
        ? [
            ...record.conditions.map((condition) =>
              testName(
                condition.sampleId,
                condition.testId,
                condition.testName,
              ),
            ),
            ...record.actions.map((item) =>
              testName(item.sampleId, item.reflexTestId, item.reflexTestName),
            ),
          ]
        : [
            testName(record.sampleId, record.testId),
            ...record.operations
              .filter((op) => op.type === "TEST_RESULT")
              .map((op) => testName(op.sampleId, op.value)),
          ]),
    ]
      .join(" ")
      .toLocaleLowerCase();
  const filtered = records.filter(
    (row) =>
      (context.type === "all" || context.type === row.type) &&
      (context.state === "all" ||
        row.record.active === (context.state === "active")) &&
      searchable(row).includes(context.q.toLocaleLowerCase()),
  );
  const page = Math.min(
    context.page,
    Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
  );
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const openEditor = (type, id = null) => {
    setNotice("");
    setEditor({ type, id, session: ++editSequence.current });
  };
  const saved = async () => {
    setEditor(null);
    setNotice("rules.saved");
    await load();
  };
  const closeAction = () => {
    if (actionLock.current) return false;
    setAction(null);
    setActionError("");
    setActionPending(false);
    return false;
  };
  actionCloseRef.current = closeAction;
  const verifyAction = async (target) => {
    const response = await ruleRequest(
      RULE_ENDPOINTS[target.type].detail + target.record.id,
    );
    if (!live.current) return;
    if (
      response.ok &&
      isRuleDetail(target.type, response.data, target.record.id) &&
      response.data.active === !target.record.active
    ) {
      setAction(null);
      setActionPending(false);
      setNotice("rules.status.saved");
      await load();
    } else {
      setActionPending(true);
      setActionError("rules.error.statusUnconfirmed");
    }
  };
  const submitAction = async () => {
    if (actionLock.current || !action) return;
    actionLock.current = true;
    setActionBusy(true);
    setActionError("");
    const target = cloneRule(action);
    if (actionPending) await verifyAction(target);
    else {
      const response = await ruleRequest(
        RULE_ENDPOINTS[target.type][
          target.record.active ? "deactivate" : "activate"
        ] + target.record.id,
        {
          method: "POST",
          body: { configurationVersion: target.record.configurationVersion },
        },
      );
      if (live.current) {
        if (
          response.ok ||
          ![400, 401, 403, 404, 409, 422].includes(response.status)
        )
          await verifyAction(target);
        else setActionError(ruleFailureKey(response.status));
      }
    }
    actionLock.current = false;
    if (live.current) setActionBusy(false);
  };

  return (
    <div className="adminPageContent admin-list-workspace rules-workspace">
      <PageBreadCrumb
        breadcrumbs={[
          { label: "home.label", link: "/" },
          { label: "breadcrums.admin.managment", link: base },
          { label: "workspace.rules.title", link: `${base}/rulesWorkspace` },
        ]}
      />
      <ProductPageHeader
        title={<FormattedMessage id="workspace.rules.title" />}
        subtitle={<FormattedMessage id="rules.workspace.subtitle" />}
        actions={
          <div className="rules-workspace__toolbar">
            {context.type !== "calculation" && (
              <Button
                renderIcon={Add}
                disabled={loading || loadError || pendingCreation.reflex}
                onClick={() => openEditor("reflex")}
              >
                {msg("rules.create.reflex")}
              </Button>
            )}
            {context.type !== "reflex" && (
              <Button
                renderIcon={Add}
                kind={context.type === "all" ? "tertiary" : "primary"}
                disabled={loading || loadError || pendingCreation.calculation}
                onClick={() => openEditor("calculation")}
              >
                {msg("rules.create.calculation")}
              </Button>
            )}
          </div>
        }
      />
      <section className="rules-workspace__surface">
        <Grid
          fullWidth
          className="rules-workspace__grid rules-workspace__filters"
        >
          <Column lg={8} md={4} sm={4}>
            <Search
              id="rules-search"
              size="lg"
              labelText={msg("rules.search.label")}
              placeholder={msg("rules.search.placeholder")}
              value={context.q}
              onChange={(event) =>
                updateContext({ q: event.target.value, page: 1 })
              }
            />
          </Column>
          <Column lg={4} md={2} sm={4}>
            <Select
              id="rules-type"
              labelText={msg("rules.column.type")}
              value={context.type}
              onChange={(event) =>
                updateContext({ type: event.target.value, page: 1 })
              }
            >
              {["all", "reflex", "calculation"].map((type) => (
                <SelectItem
                  key={type}
                  value={type}
                  text={msg(`rules.type.${type}`)}
                />
              ))}
            </Select>
          </Column>
          <Column lg={4} md={2} sm={4}>
            <Select
              id="rules-state"
              labelText={msg("rules.column.status")}
              value={context.state}
              onChange={(event) =>
                updateContext({ state: event.target.value, page: 1 })
              }
            >
              {["all", "active", "inactive"].map((state) => (
                <SelectItem
                  key={state}
                  value={state}
                  text={msg(`rules.state.${state}`)}
                />
              ))}
            </Select>
          </Column>
        </Grid>
        {(pendingCreation.reflex || pendingCreation.calculation) && (
          <InlineNotification
            kind="warning"
            title=""
            hideCloseButton
            subtitle={msg("rules.create.pending")}
          />
        )}
        {notice && (
          <InlineNotification
            kind="success"
            title=""
            subtitle={msg(notice)}
            onCloseButtonClick={() => setNotice("")}
            lowContrast
          />
        )}
        {referencesFailed && (
          <InlineNotification
            kind="warning"
            title=""
            subtitle={msg("rules.list.referencesFailed")}
            hideCloseButton
            lowContrast
          />
        )}
        {loading ? (
          <Loading
            small
            withOverlay={false}
            description={msg("rules.loading")}
          />
        ) : loadError ? (
          <>
            <InlineNotification
              kind="error"
              title=""
              subtitle={msg("rules.error.load")}
              hideCloseButton
            />
            <Button kind="tertiary" onClick={load}>
              {msg("button.retry")}
            </Button>
          </>
        ) : (
          <>
            <p className="rules-workspace__count">
              {msg("rules.list.count", { count: filtered.length })}
            </p>
            <div className="rules-workspace__table-scroll">
              <Table aria-label={msg("rules.list.title")}>
                <TableHead>
                  <TableRow>
                    {["name", "type", "definition", "status", "actions"].map(
                      (column) => (
                        <TableHeader key={column}>
                          {msg(`rules.column.${column}`)}
                        </TableHeader>
                      ),
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {shown.map(({ type, record }) => (
                    <TableRow key={`${type}:${record.id}`}>
                      <TableCell>
                        <strong>{ruleName(type, record)}</strong>
                        <p className="rules-workspace__helper">
                          {msg("rules.id", { id: record.id })}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Tag type={type === "reflex" ? "teal" : "blue"}>
                          {msg(`rules.type.${type}`)}
                        </Tag>
                      </TableCell>
                      <TableCell>
                        {type === "reflex" ? (
                          <>
                            {msg("rules.summary.reflex", {
                              conditions: record.conditions.length,
                              actions: record.actions.length,
                            })}
                            <p className="rules-workspace__helper">
                              {record.actions
                                .map((item) =>
                                  testName(
                                    item.sampleId,
                                    item.reflexTestId,
                                    item.reflexTestName,
                                  ),
                                )
                                .join("、")}
                            </p>
                          </>
                        ) : (
                          <>
                            {msg("rules.summary.calculation", {
                              count: record.operations.length,
                            })}
                            <p className="rules-workspace__helper">
                              {testName(record.sampleId, record.testId)}
                            </p>
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        <Tag type={record.active ? "green" : "cool-gray"}>
                          {msg(
                            record.active
                              ? "rules.state.active"
                              : "rules.state.inactive",
                          )}
                        </Tag>
                      </TableCell>
                      <TableCell>
                        <div className="rules-workspace__row-actions">
                          <Button
                            kind="ghost"
                            size="sm"
                            onClick={() => openEditor(type, record.id)}
                          >
                            {msg("button.edit")}
                          </Button>
                          <Button
                            kind="ghost"
                            size="sm"
                            onClick={() => {
                              setAction({ type, record: cloneRule(record) });
                              setActionError("");
                              setActionPending(false);
                            }}
                          >
                            {msg(
                              record.active
                                ? "rules.deactivate"
                                : "rules.activate",
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {!shown.length && (
              <p className="rules-workspace__empty">
                {msg(
                  records.length ? "rules.list.noResults" : "rules.list.empty",
                )}
              </p>
            )}
            {filtered.length > PAGE_SIZE && (
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                pageSizes={[PAGE_SIZE]}
                totalItems={filtered.length}
                itemsPerPageText={msg("rules.pagination.perPage")}
                itemRangeText={(min, max, total) =>
                  msg("rules.pagination.range", { min, max, total })
                }
                pageRangeText={(_current, total) =>
                  msg("rules.pagination.pages", { total })
                }
                backwardText={msg("rules.pagination.previous")}
                forwardText={msg("rules.pagination.next")}
                onChange={({ page: nextPage }) =>
                  updateContext({ page: nextPage })
                }
              />
            )}
          </>
        )}
      </section>
      <section className="rules-workspace__tool">
        <div>
          <strong>{msg("configuration.batch.test.reassignment")}</strong>
          <p className="rules-workspace__helper">
            {msg("workspace.rules.batch.help")}
          </p>
        </div>
        <Button
          as={Link}
          to={`${base}/batchTestReassignment`}
          kind="ghost"
          renderIcon={ArrowRight}
        >
          {msg("common.openManagement")}
        </Button>
      </section>
      {editor && (
        <RuleEditor
          key={editor.session}
          requestContext={requestContext}
          type={editor.type}
          id={editor.id}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      )}
      {action && (
        <Modal
          open
          className="oe-admin-modal"
          modalHeading={msg(
            action.record.active
              ? "rules.deactivate.confirm"
              : "rules.activate.confirm",
          )}
          closeButtonLabel={msg("button.close")}
          primaryButtonText={msg(
            actionPending
              ? "rules.verify"
              : action.record.active
                ? "rules.deactivate"
                : "rules.activate",
          )}
          secondaryButtonText={msg("button.cancel")}
          primaryButtonDisabled={actionBusy}
          secondaryButtonDisabled={actionBusy}
          onRequestClose={() => actionCloseRef.current()}
          onSecondarySubmit={closeAction}
          onRequestSubmit={submitAction}
        >
          <p>
            <strong>{ruleName(action.type, action.record)}</strong>
          </p>
          <p>
            {msg(
              action.record.active
                ? "rules.deactivate.help"
                : "rules.activate.help",
            )}
          </p>
          {actionError && (
            <InlineNotification
              kind={actionPending ? "warning" : "error"}
              title=""
              subtitle={msg(actionError)}
              hideCloseButton
            />
          )}
        </Modal>
      )}
    </div>
  );
}
