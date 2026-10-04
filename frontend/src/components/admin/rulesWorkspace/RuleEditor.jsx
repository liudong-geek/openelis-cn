import React, { useEffect, useRef, useState } from "react";
import {
  Button,
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Modal,
  InlineNotification,
  Loading,
  Select,
  SelectItem,
  TextInput,
  TextArea,
  Grid,
  Column,
  Stack,
  Tag,
} from "@carbon/react";
import { Add, Subtract } from "@carbon/icons-react";
import { FormattedMessage, useIntl } from "react-intl";
import { RULE_ENDPOINTS, ruleRequest as transport } from "./ruleApi";
import {
  cloneRule,
  newRule,
  emptyCondition,
  emptyAction,
  emptyOperation,
  isRuleDetail,
  ruleMatches,
  rulePayload,
  validRuleId,
  formulaSyntaxValid,
  numericValueValid,
  ruleFieldLengthsValid,
  conditionValueLimit,
} from "./ruleModel";
import {
  readCreationPending,
  rememberCreation,
  clearCreationPending,
} from "./rulePending";
import "../AdminModal.css";

const RELATION_KEYS = {
  EQUALS: "rules.relation.equals",
  NOT_EQUALS: "rules.relation.notEquals",
  INSIDE_NORMAL_RANGE: "rules.relation.inside",
  OUTSIDE_NORMAL_RANGE: "rules.relation.outside",
  LESS_THAN_OR_EQUAL: "rules.relation.lte",
  GREATER_THAN_OR_EQUAL: "rules.relation.gte",
  LESS_THAN: "rules.relation.lt",
  GREATER_THAN: "rules.relation.gt",
  BETWEEN: "rules.relation.between",
};
export const ruleFailureKey = (status) =>
  ({
    400: "rules.error.invalid",
    401: "rules.error.permission",
    403: "rules.error.permission",
    404: "rules.error.missing",
    409: "rules.error.conflict",
  })[status] || "rules.error.save";
const optionListValid = (items) =>
  Array.isArray(items) &&
  items.every(
    (item) => item && item.id != null && typeof item.value === "string",
  );
const testListValid = (items) =>
  optionListValid(items) &&
  items.every(
    (item) =>
      typeof item.resultType === "string" && Array.isArray(item.resultList),
  );

export default function RuleEditor({
  type,
  id,
  onClose,
  onSaved,
  requestContext,
}) {
  const ruleRequest = (path, options = {}) =>
    transport(path, { ...options, session: requestContext });
  const intl = useIntl();
  const msg = (key, values) => intl.formatMessage({ id: key }, values);
  const [draft, setDraft] = useState(id ? null : newRule(type));
  const [initial, setInitial] = useState(id ? null : newRule(type));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [samples, setSamples] = useState([]);
  const [mathFunctions, setMathFunctions] = useState([]);
  const [relations, setRelations] = useState({
    numeric: [],
    general: [],
    overall: [],
  });
  const [tests, setTests] = useState({});
  const [testErrors, setTestErrors] = useState({});
  const [testBusy, setTestBusy] = useState({});
  const priorCreation = !id && readCreationPending(type, requestContext);
  const [errorKey, setErrorKey] = useState(
    priorCreation ? "rules.error.unconfirmedCreate" : "",
  );
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(
    priorCreation ? { id: null, payload: null } : null,
  );
  const [confirmLeave, setConfirmLeave] = useState(false);
  const live = useRef(true);
  const lock = useRef(false);
  const testRequests = useRef(new Set());
  const closeRef = useRef(() => false);
  const abortRef = useRef(null);
  const dirty =
    draft && initial && JSON.stringify(draft) !== JSON.stringify(initial);
  const locked = busy || Boolean(pending);

  useEffect(() => {
    live.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setLoadError(false);
    setTests({});
    setTestErrors({});
    setTestBusy({});
    testRequests.current.clear();
    const refsUrl =
      type === "reflex" ? "/rest/reflexrule-options" : "/rest/math-functions";
    const detailPromise = id
      ? ruleRequest(RULE_ENDPOINTS[type].detail + id, {
          signal: controller.signal,
        })
      : Promise.resolve({ ok: true, data: newRule(type) });
    Promise.all([
      detailPromise,
      ruleRequest("/rest/displayList/SAMPLE_TYPE_ACTIVE", {
        signal: controller.signal,
      }),
      ruleRequest(refsUrl, { signal: controller.signal }),
    ])
      .then(([detail, sampleResponse, options]) => {
        if (!live.current || controller.signal.aborted) return;
        const validOptions =
          type === "reflex"
            ? options.data &&
              [
                "numericRelationOptions",
                "generalRelationOptions",
                "overallOptions",
              ].every(
                (key) =>
                  Array.isArray(options.data[key]) &&
                  options.data[key].every(
                    (item) =>
                      typeof item.value === "string" &&
                      (key === "overallOptions"
                        ? ["ANY", "ALL"].includes(item.value)
                        : Boolean(RELATION_KEYS[item.value])),
                  ),
              )
            : optionListValid(options.data);
        if (
          !detail.ok ||
          (id && !isRuleDetail(type, detail.data, id)) ||
          !sampleResponse.ok ||
          !optionListValid(sampleResponse.data) ||
          !options.ok ||
          !validOptions
        ) {
          setLoadError(true);
          setLoading(false);
          return;
        }
        setDraft(cloneRule(detail.data));
        setInitial(cloneRule(detail.data));
        setSamples(sampleResponse.data);
        if (type === "reflex")
          setRelations({
            numeric: options.data.numericRelationOptions,
            general: options.data.generalRelationOptions,
            overall: options.data.overallOptions,
          });
        else setMathFunctions(options.data);
        setLoading(false);
      })
      .catch((error) => {
        if (live.current && error?.name !== "AbortError") {
          setLoadError(true);
          setLoading(false);
        }
      });
    return () => {
      live.current = false;
      controller.abort();
    };
  }, [type, id, revision]);

  // Cache is editor-local and keyed by specimen identity. A late response only
  // populates its own identity; it can never replace another selection's list.
  useEffect(() => {
    if (!draft || loading || loadError) return;
    const selectedSamples =
      type === "reflex"
        ? [...draft.conditions, ...draft.actions].map((item) => item.sampleId)
        : [
            draft.sampleId,
            ...draft.operations
              .filter((op) => op.type === "TEST_RESULT")
              .map((op) => op.sampleId),
          ];
    for (const sample of new Set(selectedSamples.filter(Boolean).map(String))) {
      if (
        tests[sample] ||
        testErrors[sample] ||
        testRequests.current.has(sample)
      )
        continue;
      testRequests.current.add(sample);
      setTestBusy((current) => ({ ...current, [sample]: true }));
      const signal = abortRef.current?.signal;
      ruleRequest(
        `/rest/test-display-beans?sampleType=${encodeURIComponent(sample)}`,
        { signal },
      )
        .then((response) => {
          if (!live.current || signal?.aborted) return;
          if (response.ok && testListValid(response.data))
            setTests((current) => ({ ...current, [sample]: response.data }));
          else setTestErrors((current) => ({ ...current, [sample]: true }));
          setTestBusy((current) => ({ ...current, [sample]: false }));
          testRequests.current.delete(sample);
        })
        .catch(() => {
          testRequests.current.delete(sample);
        });
    }
  }, [draft, type, loading, loadError, tests, testErrors]);

  const setField = (field, value) => {
    if (lock.current || pending) return;
    setErrorKey("");
    setDraft((current) => ({ ...current, [field]: value }));
  };
  const setItem = (field, index, values) => {
    if (lock.current || pending) return;
    setErrorKey("");
    setDraft((current) => ({
      ...current,
      [field]: current[field].map((item, i) =>
        i === index ? { ...item, ...values } : item,
      ),
    }));
  };
  const addItem = (field, value) => {
    if (!lock.current && !pending)
      setDraft((current) => ({
        ...current,
        [field]: [...current[field], value],
      }));
  };
  const removeItem = (field, index) => {
    if (!lock.current && !pending)
      setDraft((current) => ({
        ...current,
        [field]: current[field].filter((_, i) => i !== index),
      }));
  };
  const requestClose = () => {
    if (lock.current || confirmLeave) return false;
    if (dirty || pending) setConfirmLeave(true);
    else onClose();
    return false;
  };
  closeRef.current = requestClose;
  const selectedTest = (sample, test) =>
    tests[String(sample)]?.find((item) => String(item.id) === String(test));
  const sampleExists = (sample) =>
    samples.some((item) => String(item.id) === String(sample));
  const validAssociation = (sample, test) =>
    sampleExists(sample) && Boolean(selectedTest(sample, test));
  const requiredSamples = draft
    ? type === "reflex"
      ? [...draft.conditions, ...draft.actions].map((item) =>
          String(item.sampleId),
        )
      : [
          draft.sampleId,
          ...draft.operations
            .filter((op) => op.type === "TEST_RESULT")
            .map((op) => op.sampleId),
        ].map(String)
    : [];
  const refsBusy = requiredSamples.some((sample) => testBusy[sample]);
  const refsFailed = requiredSamples.some((sample) => testErrors[sample]);
  const refsMissing =
    draft &&
    !loading &&
    !refsBusy &&
    !refsFailed &&
    (type === "reflex"
      ? [
          ...draft.conditions.map((c) => [c.sampleId, c.testId]),
          ...draft.actions.map((a) => [a.sampleId, a.reflexTestId]),
        ].some(
          ([s, t]) => s && (!sampleExists(s) || (t && !selectedTest(s, t))),
        )
      : [
          [draft.sampleId, draft.testId],
          ...draft.operations
            .filter((op) => op.type === "TEST_RESULT")
            .map((op) => [op.sampleId, op.value]),
        ].some(
          ([s, t]) => s && (!sampleExists(s) || (t && !selectedTest(s, t))),
        ));

  const definitionValid = () => {
    if (refsBusy || refsFailed || refsMissing || !draft) return false;
    if (type === "reflex")
      return Boolean(
        draft.ruleName?.trim() &&
        ["ALL", "ANY"].includes(draft.overall) &&
        draft.conditions.length &&
        draft.actions.length &&
        draft.conditions.every((condition) => {
          const test = selectedTest(condition.sampleId, condition.testId);
          const allowed =
            test?.resultType === "N" ? relations.numeric : relations.general;
          if (
            !validAssociation(condition.sampleId, condition.testId) ||
            !allowed.some((item) => item.value === condition.relation)
          )
            return false;
          if (
            ["INSIDE_NORMAL_RANGE", "OUTSIDE_NORMAL_RANGE"].includes(
              condition.relation,
            )
          )
            return true;
          if (test.resultType === "N")
            return (
              numericValueValid(condition.value) &&
              (condition.relation !== "BETWEEN" ||
                (numericValueValid(condition.value2) &&
                  Number(condition.value) <= Number(condition.value2)))
            );
          return test.resultType === "D"
            ? test.resultList.some(
                (item) => String(item.id) === String(condition.value),
              )
            : Boolean(String(condition.value || "").trim());
        }) &&
        draft.actions.every((action) =>
          validAssociation(action.sampleId, action.reflexTestId),
        ),
      );
    const target = selectedTest(draft.sampleId, draft.testId);
    return Boolean(
      draft.name?.trim() &&
      validAssociation(draft.sampleId, draft.testId) &&
      draft.operations.length &&
      draft.operations.every((op) =>
        op.type === "TEST_RESULT"
          ? validAssociation(op.sampleId, op.value) &&
            selectedTest(op.sampleId, op.value).resultType === "N"
          : op.type === "INTEGER"
            ? numericValueValid(op.value)
            : op.type === "MATH_FUNCTION"
              ? mathFunctions.some(
                  (item) => String(item.id) === String(op.value),
                )
              : op.type === "PATIENT_ATTRIBUTE" && op.value === "AGE",
      ) &&
      formulaSyntaxValid(draft.operations) &&
      (target.resultType !== "D" ||
        target.resultList.some(
          (item) => String(item.id) === String(draft.result),
        )),
    );
  };

  const verify = async (state) => {
    if (!validRuleId(state.id)) {
      setPending(state);
      setErrorKey("rules.error.unconfirmedCreate");
      return;
    }
    const response = await ruleRequest(RULE_ENDPOINTS[type].detail + state.id);
    if (!live.current) return;
    if (
      response.ok &&
      ruleMatches(type, response.data, { ...state.payload, id: state.id })
    ) {
      if (!id) clearCreationPending(type, requestContext);
      setPending(null);
      await onSaved();
    } else {
      setPending(state);
      setErrorKey("rules.error.unconfirmed");
    }
  };
  const save = async () => {
    if (lock.current || pending || loading || loadError) return;
    if (
      !ruleFieldLengthsValid(
        type,
        draft,
        (condition) =>
          selectedTest(condition.sampleId, condition.testId)?.resultType,
      )
    ) {
      setErrorKey("rules.error.length");
      return;
    }
    if (
      type === "reflex" &&
      draft.conditions.some(
        (condition) =>
          condition.relation === "BETWEEN" &&
          numericValueValid(condition.value) &&
          numericValueValid(condition.value2) &&
          Number(condition.value) > Number(condition.value2),
      )
    ) {
      setErrorKey("rules.error.rangeOrder");
      return;
    }
    if (!definitionValid()) {
      setErrorKey(
        type === "calculation"
          ? "rules.error.formula"
          : "rules.error.definition",
      );
      return;
    }
    if (!id) {
      try {
        rememberCreation(type, requestContext);
      } catch {
        setPending({ id: null, payload: null });
        setErrorKey("rules.error.unconfirmedCreate");
        return;
      }
    }
    lock.current = true;
    setBusy(true);
    setErrorKey("");
    const payload = rulePayload(type, draft);
    const response = await ruleRequest(RULE_ENDPOINTS[type].save, {
      method: "POST",
      body: payload,
    });
    if (!live.current) return;
    if (response.ok && validRuleId(response.data?.id))
      await verify({ payload, id: id || response.data.id });
    else if ([400, 401, 403, 404, 409, 422].includes(response.status)) {
      if (!id) clearCreationPending(type, requestContext);
      setErrorKey(ruleFailureKey(response.status));
    } else await verify({ payload, id: id || null });
    if (live.current) {
      lock.current = false;
      setBusy(false);
    }
  };
  const retryVerify = async () => {
    if (lock.current || !pending?.id) return;
    lock.current = true;
    setBusy(true);
    await verify(pending);
    if (live.current) {
      lock.current = false;
      setBusy(false);
    }
  };
  const retryTests = () => {
    if (locked) return;
    setTestErrors({});
    testRequests.current.clear();
  };
  const fieldDisabled = locked || loading || loadError;
  const sampleSelect = (value, onChange, fieldId) => (
    <Select
      id={fieldId}
      labelText={msg("rulebuilder.label.selectSample")}
      value={value ?? ""}
      disabled={fieldDisabled}
      onChange={(event) => onChange(event.target.value)}
    >
      <SelectItem value="" text={msg("rules.select.placeholder")} />
      {value && !sampleExists(value) && (
        <SelectItem
          value={value}
          text={msg("rules.reference.missingId", { id: value })}
        />
      )}
      {samples.map((sample) => (
        <SelectItem key={sample.id} value={sample.id} text={sample.value} />
      ))}
    </Select>
  );
  const testSelect = (sample, value, onChange, fieldId, numeric = false) => (
    <Select
      id={fieldId}
      labelText={msg("rulebuilder.label.searchTest")}
      value={value ?? ""}
      disabled={
        fieldDisabled ||
        !sample ||
        testBusy[String(sample)] ||
        testErrors[String(sample)]
      }
      onChange={(event) => onChange(event.target.value)}
    >
      <SelectItem value="" text={msg("rules.select.placeholder")} />
      {value && !selectedTest(sample, value) && (
        <SelectItem
          value={value}
          text={msg("rules.reference.missingId", { id: value })}
        />
      )}
      {(tests[String(sample)] || [])
        .filter((test) => !numeric || test.resultType === "N")
        .map((test) => (
          <SelectItem key={test.id} value={test.id} text={test.value} />
        ))}
    </Select>
  );
  const itemButtons = (field, index, empty) => (
    <div className="rules-workspace__item-actions">
      <Button
        size="sm"
        kind="ghost"
        renderIcon={Subtract}
        disabled={fieldDisabled || draft[field].length === 1}
        onClick={() => removeItem(field, index)}
      >
        {msg("rules.item.remove")}
      </Button>
      {index === draft[field].length - 1 && (
        <Button
          size="sm"
          kind="tertiary"
          renderIcon={Add}
          disabled={fieldDisabled}
          onClick={() => addItem(field, empty())}
        >
          {msg("rules.item.add")}
        </Button>
      )}
    </div>
  );

  return (
    <>
      <ComposedModal
        open
        size="lg"
        className="oe-admin-modal oe-admin-modal--large rules-editor-modal"
        onClose={() => closeRef.current()}
      >
        <ModalHeader
          title={msg(id ? "rules.editor.edit" : "rules.editor.create")}
          label={msg(
            type === "reflex" ? "rules.type.reflex" : "rules.type.calculation",
          )}
          iconDescription={msg("button.close")}
        />
        <ModalBody hasScrollingContent>
          <Stack gap={5}>
            {loading && (
              <Loading
                small
                withOverlay={false}
                description={msg("rules.loading")}
              />
            )}
            {loadError && (
              <>
                <InlineNotification
                  kind="error"
                  title=""
                  subtitle={msg("rules.error.load")}
                  hideCloseButton
                />
                <Button
                  kind="tertiary"
                  onClick={() => setRevision((value) => value + 1)}
                >
                  {msg("button.retry")}
                </Button>
              </>
            )}
            {errorKey && (
              <InlineNotification
                kind={pending ? "warning" : "error"}
                title=""
                subtitle={msg(errorKey)}
                hideCloseButton
              />
            )}
            {refsFailed && (
              <>
                <InlineNotification
                  kind="error"
                  title=""
                  subtitle={msg("rules.error.references")}
                  hideCloseButton
                />
                <Button kind="tertiary" disabled={locked} onClick={retryTests}>
                  {msg("button.retry")}
                </Button>
              </>
            )}
            {refsMissing && (
              <InlineNotification
                kind="warning"
                title=""
                subtitle={msg("rules.reference.missing")}
                hideCloseButton
              />
            )}
            {draft && !loading && !loadError && (
              <>
                <Grid fullWidth className="rules-workspace__grid">
                  <Column lg={12} md={6} sm={4}>
                    <TextInput
                      id="rule-editor-name"
                      labelText={msg("rulebuilder.label.ruleName")}
                      value={type === "reflex" ? draft.ruleName : draft.name}
                      disabled={fieldDisabled}
                      onChange={(event) =>
                        setField(
                          type === "reflex" ? "ruleName" : "name",
                          event.target.value,
                        )
                      }
                      maxLength={64}
                    />
                  </Column>
                  <Column lg={4} md={2} sm={4}>
                    <p className="rules-workspace__label">
                      {msg("rules.column.status")}
                    </p>
                    <Tag type={draft.active ? "green" : "cool-gray"}>
                      {msg(
                        draft.active
                          ? "rules.state.active"
                          : "rules.state.inactive",
                      )}
                    </Tag>
                    <p className="rules-workspace__helper">
                      {msg("rules.editor.statusHelp")}
                    </p>
                  </Column>
                </Grid>
                {type === "reflex" ? (
                  <>
                    <Select
                      id="rule-editor-overall"
                      labelText={msg("rulebuilder.label.overallOptions")}
                      value={draft.overall}
                      disabled={fieldDisabled}
                      onChange={(event) =>
                        setField("overall", event.target.value)
                      }
                    >
                      {relations.overall.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          text={msg(
                            option.value === "ALL"
                              ? "rules.overall.all"
                              : "rules.overall.any",
                          )}
                        />
                      ))}
                    </Select>
                    <h3>{msg("rulebuilder.label.addRuleConditions")}</h3>
                    {draft.conditions.map((condition, index) => {
                      const test = selectedTest(
                        condition.sampleId,
                        condition.testId,
                      );
                      const range = [
                        "INSIDE_NORMAL_RANGE",
                        "OUTSIDE_NORMAL_RANGE",
                      ].includes(condition.relation);
                      const relationOptions =
                        test?.resultType === "N"
                          ? relations.numeric
                          : relations.general;
                      return (
                        <section key={index} className="rules-workspace__item">
                          <p className="rules-workspace__item-title">
                            {msg("rules.condition.number", {
                              number: index + 1,
                            })}
                          </p>
                          <Grid fullWidth className="rules-workspace__grid">
                            <Column lg={5} md={4} sm={4}>
                              {sampleSelect(
                                condition.sampleId,
                                (sampleId) =>
                                  setItem("conditions", index, {
                                    sampleId,
                                    testId: "",
                                    testName: "",
                                    relation: "",
                                    value: "0",
                                    value2: "0",
                                  }),
                                `condition-${index}-sample`,
                              )}
                            </Column>
                            <Column lg={6} md={4} sm={4}>
                              {testSelect(
                                condition.sampleId,
                                condition.testId,
                                (testId) =>
                                  setItem("conditions", index, {
                                    testId,
                                    testName:
                                      selectedTest(condition.sampleId, testId)
                                        ?.value || "",
                                    relation: "",
                                    value: "0",
                                    value2: "0",
                                  }),
                                `condition-${index}-test`,
                              )}
                            </Column>
                            <Column lg={5} md={4} sm={4}>
                              <Select
                                id={`condition-${index}-relation`}
                                labelText={msg("rulebuilder.label.relation")}
                                value={condition.relation}
                                disabled={fieldDisabled || !test}
                                onChange={(event) =>
                                  setItem("conditions", index, {
                                    relation: event.target.value,
                                  })
                                }
                              >
                                <SelectItem
                                  value=""
                                  text={msg("rules.select.placeholder")}
                                />
                                {relationOptions.map((option) => (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                    text={msg(RELATION_KEYS[option.value])}
                                  />
                                ))}
                              </Select>
                            </Column>
                            {!range && (
                              <Column
                                lg={condition.relation === "BETWEEN" ? 8 : 16}
                                md={4}
                                sm={4}
                              >
                                {test?.resultType === "D" ? (
                                  <Select
                                    id={`condition-${index}-value`}
                                    labelText={msg(
                                      "rulebuilder.label.dictValue",
                                    )}
                                    value={condition.value}
                                    disabled={fieldDisabled || !test}
                                    onChange={(event) =>
                                      setItem("conditions", index, {
                                        value: event.target.value,
                                      })
                                    }
                                  >
                                    <SelectItem
                                      value=""
                                      text={msg("rules.select.placeholder")}
                                    />
                                    {test.resultList.map((result) => (
                                      <SelectItem
                                        key={result.id}
                                        value={result.id}
                                        text={result.value}
                                      />
                                    ))}
                                  </Select>
                                ) : (
                                  <TextInput
                                    id={`condition-${index}-value`}
                                    labelText={msg(
                                      test?.resultType === "N"
                                        ? condition.relation === "BETWEEN"
                                          ? "rules.range.lower"
                                          : "rulebuilder.label.numericValue"
                                        : "rulebuilder.label.textValue",
                                    )}
                                    value={condition.value ?? ""}
                                    maxLength={conditionValueLimit(
                                      condition,
                                      test?.resultType,
                                    )}
                                    disabled={fieldDisabled || !test}
                                    onChange={(event) =>
                                      setItem("conditions", index, {
                                        value: event.target.value,
                                      })
                                    }
                                  />
                                )}
                              </Column>
                            )}
                            {range &&
                              String(initial?.conditions[index]?.value ?? "")
                                .length > 50 && (
                                <Column lg={16} md={8} sm={4}>
                                  <TextInput
                                    id={`condition-${index}-value`}
                                    labelText={msg(
                                      "rules.condition.retainedValue",
                                    )}
                                    helperText={msg("rules.error.length")}
                                    value={condition.value ?? ""}
                                    maxLength={50}
                                    disabled={fieldDisabled || !test}
                                    onChange={(event) =>
                                      setItem("conditions", index, {
                                        value: event.target.value,
                                      })
                                    }
                                  />
                                </Column>
                              )}
                            {test?.resultType === "N" &&
                              condition.relation === "BETWEEN" && (
                                <Column lg={8} md={4} sm={4}>
                                  <TextInput
                                    id={`condition-${index}-value2`}
                                    labelText={msg("rules.range.upper")}
                                    value={condition.value2 ?? ""}
                                    maxLength={64}
                                    disabled={fieldDisabled}
                                    onChange={(event) =>
                                      setItem("conditions", index, {
                                        value2: event.target.value,
                                      })
                                    }
                                  />
                                </Column>
                              )}
                          </Grid>
                          {condition.relation === "BETWEEN" && (
                            <p className="rules-workspace__helper">
                              {msg("rules.range.helper")}
                            </p>
                          )}
                          {itemButtons("conditions", index, emptyCondition)}
                        </section>
                      );
                    })}
                    <h3>{msg("rules.actions.heading")}</h3>
                    {draft.actions.map((action, index) => (
                      <section key={index} className="rules-workspace__item">
                        <p className="rules-workspace__item-title">
                          {msg("rules.action.number", { number: index + 1 })}
                        </p>
                        <Grid fullWidth className="rules-workspace__grid">
                          <Column lg={8} md={4} sm={4}>
                            {sampleSelect(
                              action.sampleId,
                              (sampleId) =>
                                setItem("actions", index, {
                                  sampleId,
                                  reflexTestId: "",
                                  reflexTestName: "",
                                }),
                              `action-${index}-sample`,
                            )}
                          </Column>
                          <Column lg={8} md={4} sm={4}>
                            {testSelect(
                              action.sampleId,
                              action.reflexTestId,
                              (reflexTestId) =>
                                setItem("actions", index, {
                                  reflexTestId,
                                  reflexTestName:
                                    selectedTest(action.sampleId, reflexTestId)
                                      ?.value || "",
                                }),
                              `action-${index}-test`,
                            )}
                          </Column>
                          <Column lg={8} md={4} sm={4}>
                            <TextArea
                              id={`action-${index}-internal`}
                              rows={2}
                              labelText={msg(
                                "rulebuilder.label.addInternalNote",
                              )}
                              value={action.internalNote ?? ""}
                              maxLength={50}
                              disabled={fieldDisabled}
                              onChange={(event) =>
                                setItem("actions", index, {
                                  internalNote: event.target.value,
                                })
                              }
                            />
                          </Column>
                          <Column lg={8} md={4} sm={4}>
                            <TextArea
                              id={`action-${index}-external`}
                              rows={2}
                              labelText={msg(
                                "rulebuilder.label.addExternalNote",
                              )}
                              value={action.externalNote ?? ""}
                              maxLength={50}
                              disabled={fieldDisabled}
                              onChange={(event) =>
                                setItem("actions", index, {
                                  externalNote: event.target.value,
                                })
                              }
                            />
                          </Column>
                        </Grid>
                        {itemButtons("actions", index, emptyAction)}
                      </section>
                    ))}
                  </>
                ) : (
                  <>
                    <h3>{msg("rules.formula.heading")}</h3>
                    <p className="rules-workspace__helper">
                      {msg("rules.formula.help")}
                    </p>
                    {draft.operations.map((operation, index) => (
                      <section key={index} className="rules-workspace__item">
                        <p className="rules-workspace__item-title">
                          {msg("rules.operation.number", { number: index + 1 })}
                        </p>
                        <Grid fullWidth className="rules-workspace__grid">
                          <Column lg={4} md={4} sm={4}>
                            <Select
                              id={`operation-${index}-type`}
                              labelText={msg("rules.operation.type")}
                              value={operation.type}
                              disabled={fieldDisabled}
                              onChange={(event) =>
                                setItem("operations", index, {
                                  type: event.target.value,
                                  sampleId: null,
                                  value: "",
                                })
                              }
                            >
                              {[
                                "TEST_RESULT",
                                "MATH_FUNCTION",
                                "INTEGER",
                                "PATIENT_ATTRIBUTE",
                              ].map((value) => (
                                <SelectItem
                                  key={value}
                                  value={value}
                                  text={msg(
                                    {
                                      TEST_RESULT:
                                        "testcalculation.label.testResult",
                                      MATH_FUNCTION:
                                        "testcalculation.label.mathFucntion",
                                      INTEGER: "testcalculation.label.integer",
                                      PATIENT_ATTRIBUTE:
                                        "testcalculation.label.patientAttribute",
                                    }[value],
                                  )}
                                />
                              ))}
                            </Select>
                          </Column>
                          {operation.type === "TEST_RESULT" ? (
                            <>
                              <Column lg={6} md={4} sm={4}>
                                {sampleSelect(
                                  operation.sampleId,
                                  (sampleId) =>
                                    setItem("operations", index, {
                                      sampleId,
                                      value: "",
                                    }),
                                  `operation-${index}-sample`,
                                )}
                              </Column>
                              <Column lg={6} md={4} sm={4}>
                                {testSelect(
                                  operation.sampleId,
                                  operation.value,
                                  (value) =>
                                    setItem("operations", index, { value }),
                                  `operation-${index}-test`,
                                  true,
                                )}
                              </Column>
                            </>
                          ) : (
                            <Column lg={12} md={4} sm={4}>
                              {operation.type === "INTEGER" ? (
                                <TextInput
                                  id={`operation-${index}-value`}
                                  labelText={msg(
                                    "testcalculation.label.integer",
                                  )}
                                  value={operation.value ?? ""}
                                  disabled={fieldDisabled}
                                  onChange={(event) =>
                                    setItem("operations", index, {
                                      value: event.target.value,
                                    })
                                  }
                                />
                              ) : (
                                <Select
                                  id={`operation-${index}-value`}
                                  labelText={msg(
                                    operation.type === "MATH_FUNCTION"
                                      ? "testcalculation.label.mathFucntion"
                                      : "testcalculation.label.patientAttribute",
                                  )}
                                  value={operation.value ?? ""}
                                  disabled={fieldDisabled}
                                  onChange={(event) =>
                                    setItem("operations", index, {
                                      value: event.target.value,
                                    })
                                  }
                                >
                                  <SelectItem
                                    value=""
                                    text={msg("rules.select.placeholder")}
                                  />
                                  {operation.type === "MATH_FUNCTION" ? (
                                    mathFunctions.map((item) => (
                                      <SelectItem
                                        key={item.id}
                                        value={item.id}
                                        text={item.value}
                                      />
                                    ))
                                  ) : (
                                    <SelectItem
                                      value="AGE"
                                      text={msg("rules.patient.age")}
                                    />
                                  )}
                                </Select>
                              )}
                            </Column>
                          )}
                        </Grid>
                        <div className="rules-workspace__item-actions">
                          <Button
                            kind="ghost"
                            size="sm"
                            renderIcon={Subtract}
                            disabled={
                              fieldDisabled || draft.operations.length === 1
                            }
                            onClick={() => removeItem("operations", index)}
                          >
                            {msg("rules.item.remove")}
                          </Button>
                          <Button
                            kind="tertiary"
                            size="sm"
                            renderIcon={Add}
                            disabled={fieldDisabled}
                            onClick={() =>
                              setDraft((current) => ({
                                ...current,
                                operations: [
                                  ...current.operations.slice(0, index + 1),
                                  emptyOperation(),
                                  ...current.operations.slice(index + 1),
                                ],
                              }))
                            }
                          >
                            {msg("rules.operation.insert")}
                          </Button>
                        </div>
                      </section>
                    ))}
                    <h3>{msg("testcalculation.label.finalresult")}</h3>
                    <Grid fullWidth className="rules-workspace__grid">
                      <Column lg={8} md={4} sm={4}>
                        {sampleSelect(
                          draft.sampleId,
                          (sampleId) => {
                            if (!locked)
                              setDraft((current) => ({
                                ...current,
                                sampleId,
                                testId: "",
                                result: "",
                              }));
                          },
                          "calculation-output-sample",
                        )}
                      </Column>
                      <Column lg={8} md={4} sm={4}>
                        {testSelect(
                          draft.sampleId,
                          draft.testId,
                          (testId) => {
                            if (!locked)
                              setDraft((current) => ({
                                ...current,
                                testId,
                                result: "",
                              }));
                          },
                          "calculation-output-test",
                        )}
                      </Column>
                      <Column lg={16} md={8} sm={4}>
                        {selectedTest(draft.sampleId, draft.testId)
                          ?.resultType === "D" ? (
                          <Select
                            id="calculation-result"
                            labelText={msg(
                              "testcalculation.label.selectDictionaryValue",
                            )}
                            value={draft.result ?? ""}
                            disabled={fieldDisabled}
                            onChange={(event) =>
                              setField("result", event.target.value)
                            }
                          >
                            <SelectItem
                              value=""
                              text={msg("rules.select.placeholder")}
                            />
                            {selectedTest(
                              draft.sampleId,
                              draft.testId,
                            ).resultList.map((result) => (
                              <SelectItem
                                key={result.id}
                                value={result.id}
                                text={result.value}
                              />
                            ))}
                          </Select>
                        ) : (
                          ["A", "R"].includes(
                            selectedTest(draft.sampleId, draft.testId)
                              ?.resultType,
                          ) && (
                            <TextInput
                              id="calculation-result"
                              labelText={msg("testcalculation.label.textValue")}
                              value={draft.result ?? ""}
                              maxLength={64}
                              disabled={fieldDisabled}
                              onChange={(event) =>
                                setField("result", event.target.value)
                              }
                            />
                          )
                        )}
                      </Column>
                      <Column lg={16} md={8} sm={4}>
                        <TextArea
                          id="calculation-note"
                          rows={2}
                          labelText={msg("rulebuilder.label.addExternalNote")}
                          value={draft.note ?? ""}
                          maxLength={64}
                          disabled={fieldDisabled}
                          onChange={(event) =>
                            setField("note", event.target.value)
                          }
                        />
                      </Column>
                    </Grid>
                  </>
                )}
              </>
            )}
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button kind="secondary" disabled={busy} onClick={requestClose}>
            {msg("button.cancel")}
          </Button>
          {pending ? (
            <Button
              kind="primary"
              disabled={busy || !pending.id}
              onClick={retryVerify}
            >
              {msg("rules.verify")}
            </Button>
          ) : (
            <Button
              kind="primary"
              disabled={
                fieldDisabled ||
                refsBusy ||
                refsFailed ||
                refsMissing ||
                Boolean(id && !dirty)
              }
              onClick={save}
            >
              {msg(busy ? "button.saving" : "button.save")}
            </Button>
          )}
        </ModalFooter>
      </ComposedModal>
      {confirmLeave && (
        <Modal
          open
          className="oe-admin-modal"
          modalHeading={msg("workspace.leave.title")}
          closeButtonLabel={msg("button.close")}
          primaryButtonText={msg("workspace.leave.confirm")}
          secondaryButtonText={msg("workspace.leave.cancel")}
          onRequestClose={() => setConfirmLeave(false)}
          onSecondarySubmit={() => setConfirmLeave(false)}
          onRequestSubmit={() => {
            setConfirmLeave(false);
            onClose();
          }}
        >
          <p>
            {msg(
              pending ? "rules.leave.unconfirmed" : "workspace.leave.helper",
            )}
          </p>
        </Modal>
      )}
    </>
  );
}
