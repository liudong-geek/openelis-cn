import React, { useEffect, useState } from "react";
import { InlineLoading } from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import { getFromOpenElisServer } from "../utils/Utils";
import { modifyProgramName } from "./modifyOrderDisplay";

// Existing program and answers are read-only here. Do not mount the creation
// selector: its default program effect would change an existing order.
const EditOrderEntryAdditionalQuestions = ({ orderFormValues }) => {
  const intl = useIntl();
  const programId = orderFormValues.sampleOrderItems.programId;
  const [programs, setPrograms] = useState(
    orderFormValues.sampleOrderItems.programList || [],
  );
  const [questionnaire, setQuestionnaire] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const response = orderFormValues.sampleOrderItems.additionalQuestions;
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    setQuestionnaire(null);
    if (programs.length === 0)
      getFromOpenElisServer(
        "/rest/user-programs",
        (data) => {
          if (active && Array.isArray(data)) setPrograms(data);
        },
        controller.signal,
      );
    getFromOpenElisServer(
      `/rest/program/${encodeURIComponent(programId)}/questionnaire`,
      (data) => {
        if (!active) return;
        if (!data || data === "Check server logs" || data.message || data.error)
          setFailed(true);
        else setQuestionnaire(data);
        setLoading(false);
      },
      controller.signal,
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [programId]);
  const program = programs.find(
    (item) => String(item.id) === String(programId),
  );
  const name = modifyProgramName(
    program?.value || orderFormValues.sampleOrderItems.program,
    intl,
  );
  const formatAnswer = (answer) => {
    if (answer.valueCoding)
      return answer.valueCoding.display || answer.valueCoding.code;
    if (answer.valueBoolean != null)
      return intl.formatMessage({
        id: answer.valueBoolean ? "label.yes" : "label.no",
      });
    if (answer.valueQuantity)
      return [
        answer.valueQuantity.value,
        answer.valueQuantity.unit || answer.valueQuantity.code,
      ]
        .filter((part) => part != null && part !== "")
        .join(" ");
    return (
      answer.valueDecimal ??
      answer.valueInteger ??
      answer.valueDate ??
      answer.valueTime ??
      answer.valueString ??
      "—"
    );
  };
  const renderItems = (items, responses = []) =>
    items.map((item) => {
      const matches = responses.filter((entry) => entry.linkId === item.linkId);
      const answers = matches.flatMap((entry) => entry.answer || []);
      const childResponses = matches.flatMap((entry) => [
        ...(entry.item || []),
        ...(entry.answer || []).flatMap((answer) => answer.item || []),
      ]);
      return (
        <div key={item.linkId}>
          <dt>{item.text || item.linkId}</dt>
          <dd>
            {answers.length
              ? answers.map(formatAnswer).join("、")
              : item.item?.length
                ? null
                : "—"}
            {item.item?.length ? (
              <dl>{renderItems(item.item, childResponses)}</dl>
            ) : null}
          </dd>
        </div>
      );
    });
  return (
    <div className="modify-order-program">
      <p>
        <strong>
          <FormattedMessage id="modify.order.program" />：
        </strong>
        {name || intl.formatMessage({ id: "modify.order.program.unavailable" })}
      </p>
      {loading ? (
        <InlineLoading />
      ) : failed ? (
        <p>
          <FormattedMessage id="modify.order.questionnaire.failed" />
        </p>
      ) : questionnaire?.item?.length ? (
        <dl>{renderItems(questionnaire.item, response?.item)}</dl>
      ) : (
        <p>
          <FormattedMessage id="modify.order.questionnaire.empty" />
        </p>
      )}
    </div>
  );
};
export default EditOrderEntryAdditionalQuestions;
