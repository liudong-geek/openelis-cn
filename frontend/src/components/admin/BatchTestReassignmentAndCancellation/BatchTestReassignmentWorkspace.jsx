import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  ComposedModal,
  InlineLoading,
  InlineNotification,
  ModalBody,
  ModalFooter,
  ModalHeader,
  MultiSelect,
  Select,
  SelectItem,
  Tag,
  TextInput,
} from "@carbon/react";
import { ArrowRight, Reset, Save } from "@carbon/icons-react";
import { FormattedMessage, useIntl } from "react-intl";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import { NotificationContext } from "../../layout/Layout";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
import {
  getFromOpenElisServer,
  postToOpenElisServerJsonResponse,
} from "../../utils/Utils";
import "./BatchTestReassignmentWorkspace.css";

const groups = [
  [
    "notStarted",
    "changeNotStarted",
    "noChangeNotStarted",
    "label.analysisNotStarted",
  ],
  [
    "technicianRejection",
    "changeTechReject",
    "noChangeTechReject",
    "label.rejectedByTechnician",
  ],
  [
    "biologistRejection",
    "changeBioReject",
    "noChangeBioReject",
    "label.rejectedByBiologist",
  ],
  [
    "notValidated",
    "changeNotValidated",
    "noChangeNotValidated",
    "label.notValidated",
  ],
];

const emptySelection = () =>
  groups.reduce(
    (value, [, changed, unchanged]) => ({
      ...value,
      [changed]: [],
      [unchanged]: [],
    }),
    { current: "", sampleType: "", replace: [] },
  );

const breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
  {
    label: "configuration.batch.test.reassignment",
    link: "/MasterListsPage/batchTestReassignment",
  },
];

const safeList = (value) => (Array.isArray(value) ? value : []);

export default function BatchTestReassignmentWorkspace() {
  const intl = useIntl();
  const notification = useContext(NotificationContext);
  const [configuration, setConfiguration] = useState(null);
  const [sampleTypeId, setSampleTypeId] = useState("");
  const [tests, setTests] = useState([]);
  const [currentTestId, setCurrentTestId] = useState("");
  const [pending, setPending] = useState(null);
  const [selection, setSelection] = useState(emptySelection);
  const [replacementTests, setReplacementTests] = useState([]);
  const [mode, setMode] = useState("cancel");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingTests, setLoadingTests] = useState(false);
  const [loadingPending, setLoadingPending] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadConfiguration = () => {
    setLoading(true);
    setLoadError(false);
    getFromOpenElisServer("/rest/BatchTestReassignment", (response) => {
      setConfiguration(response || null);
      setLoadError(!response);
      setLoading(false);
    });
  };

  useEffect(loadConfiguration, []);

  useEffect(() => {
    if (!sampleTypeId) {
      setTests([]);
      setCurrentTestId("");
      setPending(null);
      return;
    }
    setLoadingTests(true);
    getFromOpenElisServer(
      `/rest/AllTestsForSampleTypeProvider?sampleTypeId=${sampleTypeId}`,
      (response) => {
        setTests(safeList(response?.tests));
        setCurrentTestId("");
        setPending(null);
        setReplacementTests([]);
        setLoadingTests(false);
      },
    );
  }, [sampleTypeId]);

  useEffect(() => {
    if (!currentTestId) {
      setPending(null);
      setSelection(emptySelection());
      return;
    }
    setLoadingPending(true);
    getFromOpenElisServer(
      `/rest/getPendingAnalysisForTestProvider?testId=${currentTestId}`,
      (response) => {
        const normalized = response || {};
        const next = emptySelection();
        groups.forEach(([source, changed]) => {
          next[changed] = safeList(normalized[source]).map((item) => item.id);
        });
        next.sampleType =
          safeList(configuration?.sampleList).find(
            (item) => String(item.id) === String(sampleTypeId),
          )?.value || "";
        next.current =
          tests.find((item) => String(item.id) === String(currentTestId))
            ?.name || "";
        setSelection(next);
        setPending(normalized);
        setLoadingPending(false);
      },
    );
  }, [configuration, currentTestId, sampleTypeId, tests]);

  const totalCount = useMemo(
    () =>
      groups.reduce(
        (sum, [source]) => sum + safeList(pending?.[source]).length,
        0,
      ),
    [pending],
  );
  const selectedCount = useMemo(
    () =>
      groups.reduce((sum, [, changed]) => sum + selection[changed].length, 0),
    [selection],
  );
  const availableReplacementTests = useMemo(
    () => tests.filter((test) => String(test.id) !== String(currentTestId)),
    [currentTestId, tests],
  );
  const canReview =
    selectedCount > 0 &&
    !submitting &&
    (mode === "cancel" || replacementTests.length > 0);

  const toggleGroup = (source, changed, unchanged) => {
    const allIds = safeList(pending?.[source]).map((item) => item.id);
    const selectAll = selection[changed].length !== allIds.length;
    setSelection((value) => ({
      ...value,
      [changed]: selectAll ? allIds : [],
      [unchanged]: selectAll ? [] : allIds,
    }));
  };

  const toggleItem = (id, changed, unchanged) => {
    setSelection((value) => {
      const selected = value[changed].includes(id);
      return {
        ...value,
        [changed]: selected
          ? value[changed].filter((valueId) => valueId !== id)
          : [...value[changed], id],
        [unchanged]: selected
          ? [...value[unchanged], id]
          : value[unchanged].filter((valueId) => valueId !== id),
      };
    });
  };

  const reset = () => {
    setSampleTypeId("");
    setTests([]);
    setCurrentTestId("");
    setPending(null);
    setSelection(emptySelection());
    setReplacementTests([]);
    setMode("cancel");
    setQuery("");
  };

  const submit = () => {
    if (!configuration || !canReview) return;
    setSubmitting(true);
    const jsonWad = {
      ...selection,
      replace:
        mode === "replace" ? replacementTests.map((item) => item.id) : [],
    };
    const payload = {
      formName: configuration.formName,
      formMethod: configuration.formMethod,
      cancelAction: configuration.cancelAction,
      submitOnCancel: configuration.submitOnCancel,
      cancelMethod: configuration.cancelMethod,
      sampleList: configuration.sampleList,
      statusChangedSampleType: sampleTypeId,
      statusChangedCurrentTest: currentTestId,
      statusChangedNextTest: configuration.statusChangedNextTest,
      jsonWad: JSON.stringify(jsonWad),
    };
    postToOpenElisServerJsonResponse(
      "/rest/BatchTestReassignment",
      JSON.stringify(payload),
      (response) => {
        setSubmitting(false);
        setReviewOpen(false);
        notification?.addNotification?.({
          title: intl.formatMessage({ id: "notification.title" }),
          message: intl.formatMessage({
            id: response
              ? "notification.user.post.save.success"
              : "server.error.msg",
          }),
          kind: response ? NotificationKinds.success : NotificationKinds.error,
        });
        notification?.setNotificationVisible?.(true);
        if (response) reset();
      },
    );
  };

  if (loading) {
    return (
      <InlineLoading description={intl.formatMessage({ id: "loading" })} />
    );
  }

  return (
    <div className="adminPageContent batch-reassignment">
      {notification?.notificationVisible ? <AlertDialog /> : null}
      <PageBreadCrumb breadcrumbs={breadcrumbs} />
      <ProductPageHeader
        title={<FormattedMessage id="configuration.batch.test.reassignment" />}
        subtitle={<FormattedMessage id="batch.reassignment.subtitle" />}
        actions={
          <Button kind="ghost" renderIcon={Reset} onClick={reset}>
            <FormattedMessage id="batch.reassignment.reset" />
          </Button>
        }
      />

      {loadError && (
        <InlineNotification
          kind="error"
          lowContrast
          title={intl.formatMessage({ id: "batch.reassignment.loadError" })}
          actionButtonLabel={intl.formatMessage({
            id: "batch.reassignment.retry",
          })}
          onActionButtonClick={loadConfiguration}
        />
      )}

      <ol
        className="batch-reassignment__steps"
        aria-label={intl.formatMessage({ id: "batch.reassignment.steps" })}
      >
        <li className={sampleTypeId ? "is-complete" : "is-active"}>
          <span>1</span>
          <FormattedMessage id="batch.reassignment.step.scope" />
        </li>
        <li
          className={
            currentTestId ? "is-complete" : sampleTypeId ? "is-active" : ""
          }
        >
          <span>2</span>
          <FormattedMessage id="batch.reassignment.step.samples" />
        </li>
        <li className={currentTestId ? "is-active" : ""}>
          <span>3</span>
          <FormattedMessage id="batch.reassignment.step.review" />
        </li>
      </ol>

      <section
        className="batch-reassignment__panel"
        aria-labelledby="batch-scope-title"
      >
        <div className="batch-reassignment__panel-heading">
          <div>
            <p className="batch-reassignment__eyebrow">
              <FormattedMessage id="batch.reassignment.step1" />
            </p>
            <h2 id="batch-scope-title">
              <FormattedMessage id="batch.reassignment.scopeTitle" />
            </h2>
          </div>
          <Tag type={currentTestId ? "green" : "gray"}>
            <FormattedMessage
              id={
                currentTestId
                  ? "batch.reassignment.ready"
                  : "batch.reassignment.incomplete"
              }
            />
          </Tag>
        </div>
        <div className="batch-reassignment__form-grid">
          <Select
            id="batch-sample-type"
            labelText={intl.formatMessage({ id: "sample.type" })}
            value={sampleTypeId}
            onChange={(event) => setSampleTypeId(event.target.value)}
          >
            <SelectItem
              value=""
              text={intl.formatMessage({
                id: "batch.reassignment.chooseSample",
              })}
            />
            {safeList(configuration?.sampleList).map((item) => (
              <SelectItem
                key={item.id}
                value={String(item.id)}
                text={item.value}
              />
            ))}
          </Select>
          <Select
            id="batch-current-test"
            labelText={intl.formatMessage({ id: "label.currentTest" })}
            value={currentTestId}
            disabled={!sampleTypeId || loadingTests}
            onChange={(event) => setCurrentTestId(event.target.value)}
          >
            <SelectItem
              value=""
              text={intl.formatMessage({ id: "batch.reassignment.chooseTest" })}
            />
            {tests.map((item) => (
              <SelectItem
                key={item.id}
                value={String(item.id)}
                text={item.name}
              />
            ))}
          </Select>
        </div>
        {(loadingTests || loadingPending) && (
          <InlineLoading
            description={intl.formatMessage({
              id: "batch.reassignment.loadingScope",
            })}
          />
        )}
        <fieldset
          className="batch-reassignment__mode"
          disabled={!currentTestId}
        >
          <legend>
            <FormattedMessage id="batch.reassignment.action" />
          </legend>
          <button
            type="button"
            className={mode === "cancel" ? "is-selected" : ""}
            onClick={() => {
              setMode("cancel");
              setReplacementTests([]);
            }}
          >
            <strong>
              <FormattedMessage id="batch.reassignment.cancel" />
            </strong>
            <span>
              <FormattedMessage id="batch.reassignment.cancelHelp" />
            </span>
          </button>
          <button
            type="button"
            className={mode === "replace" ? "is-selected" : ""}
            onClick={() => setMode("replace")}
          >
            <strong>
              <FormattedMessage id="batch.reassignment.replace" />
            </strong>
            <span>
              <FormattedMessage id="batch.reassignment.replaceHelp" />
            </span>
          </button>
        </fieldset>
        {mode === "replace" && (
          <MultiSelect
            id="batch-replacement-tests"
            titleText={intl.formatMessage({ id: "label.replaceWith" })}
            label={intl.formatMessage({
              id: "batch.reassignment.chooseReplacement",
            })}
            items={availableReplacementTests}
            itemToString={(item) => item?.name || ""}
            selectedItems={replacementTests}
            onChange={({ selectedItems }) => setReplacementTests(selectedItems)}
          />
        )}
      </section>

      <section
        className="batch-reassignment__panel"
        aria-labelledby="batch-samples-title"
      >
        <div className="batch-reassignment__panel-heading">
          <div>
            <p className="batch-reassignment__eyebrow">
              <FormattedMessage id="batch.reassignment.step2" />
            </p>
            <h2 id="batch-samples-title">
              <FormattedMessage id="batch.reassignment.samplesTitle" />
            </h2>
          </div>
          <div className="batch-reassignment__metrics">
            <span>
              <strong>{totalCount}</strong>
              <FormattedMessage id="batch.reassignment.pending" />
            </span>
            <span>
              <strong>{selectedCount}</strong>
              <FormattedMessage id="batch.reassignment.selected" />
            </span>
            <span>
              <strong>{totalCount - selectedCount}</strong>
              <FormattedMessage id="batch.reassignment.unchanged" />
            </span>
          </div>
        </div>
        {currentTestId && totalCount > 0 && (
          <TextInput
            id="batch-search"
            labelText={intl.formatMessage({ id: "batch.reassignment.search" })}
            placeholder={intl.formatMessage({
              id: "batch.reassignment.searchPlaceholder",
            })}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        )}
        {!currentTestId ? (
          <div className="batch-reassignment__empty">
            <FormattedMessage id="batch.reassignment.selectScopeFirst" />
          </div>
        ) : totalCount === 0 && !loadingPending ? (
          <div className="batch-reassignment__empty">
            <FormattedMessage id="batch.reassignment.noPending" />
          </div>
        ) : (
          <div className="batch-reassignment__group-grid">
            {groups.map(([source, changed, unchanged, label]) => {
              const items = safeList(pending?.[source]);
              const filtered = items.filter((item) =>
                String(item.labNo || "")
                  .toLowerCase()
                  .includes(query.trim().toLowerCase()),
              );
              return (
                <article className="batch-reassignment__group" key={source}>
                  <header>
                    <div>
                      <h3>
                        <FormattedMessage id={label} />
                      </h3>
                      <span>{items.length}</span>
                    </div>
                    <Checkbox
                      id={`batch-all-${source}`}
                      labelText={intl.formatMessage({
                        id: "batch.reassignment.selectAll",
                      })}
                      checked={
                        items.length > 0 &&
                        selection[changed].length === items.length
                      }
                      disabled={items.length === 0}
                      onChange={() => toggleGroup(source, changed, unchanged)}
                    />
                  </header>
                  <div className="batch-reassignment__samples">
                    {filtered.length ? (
                      filtered.map((item) => (
                        <Checkbox
                          key={item.id}
                          id={`batch-${source}-${item.id}`}
                          labelText={item.labNo || String(item.id)}
                          checked={selection[changed].includes(item.id)}
                          onChange={() =>
                            toggleItem(item.id, changed, unchanged)
                          }
                        />
                      ))
                    ) : (
                      <p>
                        <FormattedMessage id="batch.reassignment.emptyGroup" />
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="batch-reassignment__footer">
        <p>
          <FormattedMessage id="batch.reassignment.safetyNote" />
        </p>
        <Button
          renderIcon={ArrowRight}
          disabled={!canReview}
          onClick={() => setReviewOpen(true)}
        >
          <FormattedMessage id="batch.reassignment.review" />
        </Button>
      </div>

      <ComposedModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        size="sm"
      >
        <ModalHeader
          title={intl.formatMessage({ id: "batch.reassignment.confirmTitle" })}
          label={intl.formatMessage({ id: "batch.reassignment.confirmLabel" })}
        />
        <ModalBody>
          <div className="batch-reassignment__review">
            <p>
              <FormattedMessage
                id="batch.reassignment.confirmText"
                values={{ count: selectedCount }}
              />
            </p>
            <dl>
              <div>
                <dt>
                  <FormattedMessage id="sample.type" />
                </dt>
                <dd>{selection.sampleType}</dd>
              </div>
              <div>
                <dt>
                  <FormattedMessage id="label.currentTest" />
                </dt>
                <dd>{selection.current}</dd>
              </div>
              <div>
                <dt>
                  <FormattedMessage id="batch.reassignment.action" />
                </dt>
                <dd>
                  <FormattedMessage
                    id={
                      mode === "cancel"
                        ? "batch.reassignment.cancel"
                        : "batch.reassignment.replace"
                    }
                  />
                </dd>
              </div>
              {mode === "replace" && (
                <div>
                  <dt>
                    <FormattedMessage id="label.replaceWith" />
                  </dt>
                  <dd>
                    {replacementTests.map((item) => item.name).join("、")}
                  </dd>
                </div>
              )}
            </dl>
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title={intl.formatMessage({
                id: "batch.reassignment.irreversible",
              })}
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button kind="secondary" onClick={() => setReviewOpen(false)}>
            <FormattedMessage id="label.button.cancel" />
          </Button>
          <Button renderIcon={Save} disabled={submitting} onClick={submit}>
            {submitting ? (
              <FormattedMessage id="batch.reassignment.submitting" />
            ) : (
              <FormattedMessage id="batch.reassignment.confirm" />
            )}
          </Button>
        </ModalFooter>
      </ComposedModal>
    </div>
  );
}
