import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  InlineNotification,
  Select,
  SelectItem,
  Tag,
  TextArea,
  TextInput,
  Toggle,
} from "@carbon/react";
import { Add, ArrowDown, ArrowUp, TrashCan } from "@carbon/icons-react";
import { FormattedMessage, useIntl } from "react-intl";
import Questionnaire from "../../common/Questionnaire";

const QUESTION_TYPES = [
  "boolean",
  "choice",
  "choice-repeat",
  "integer",
  "decimal",
  "date",
  "time",
  "string",
  "text",
  "quantity",
];

const parseQuestionnaire = (raw) => {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { valid: false, value: null };
    }
    return {
      valid: true,
      value: { ...parsed, item: Array.isArray(parsed.item) ? parsed.item : [] },
    };
  } catch (_error) {
    return { valid: false, value: null };
  }
};

const optionLabel = (option) =>
  option?.valueString ?? option?.valueCoding?.display ?? "";

function QuestionCard({ item, index, count, onChange, onDelete, onMove }) {
  const intl = useIntl();
  const [optionDraft, setOptionDraft] = useState("");
  const visualType =
    item.type === "choice" && item.repeats ? "choice-repeat" : item.type;
  const options = Array.isArray(item.answerOption) ? item.answerOption : [];
  const isChoice = visualType === "choice" || visualType === "choice-repeat";

  const changeType = (type) => {
    const next = { ...item };
    if (type === "choice" || type === "choice-repeat") {
      next.type = "choice";
      next.repeats = type === "choice-repeat";
      next.answerOption = options;
    } else {
      next.type = type;
      delete next.repeats;
      delete next.answerOption;
    }
    onChange(next);
  };
  const addOption = () => {
    const value = optionDraft.trim();
    if (!value) return;
    onChange({ ...item, answerOption: [...options, { valueString: value }] });
    setOptionDraft("");
  };

  return (
    <article
      className="program-question-card"
      data-testid="program-question-card"
    >
      <header>
        <div>
          <span>
            <FormattedMessage
              id="program.management.questionNumber"
              values={{ number: index + 1 }}
            />
          </span>
          <Tag size="sm" type="cool-gray">
            {intl.formatMessage({
              id: `program.management.questionType.${visualType || "string"}`,
            })}
          </Tag>
        </div>
        <div className="program-question-card__order">
          <Button
            type="button"
            kind="ghost"
            size="sm"
            hasIconOnly
            renderIcon={ArrowUp}
            iconDescription={intl.formatMessage({
              id: "program.management.moveUp",
            })}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          />
          <Button
            type="button"
            kind="ghost"
            size="sm"
            hasIconOnly
            renderIcon={ArrowDown}
            iconDescription={intl.formatMessage({
              id: "program.management.moveDown",
            })}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          />
          <Button
            type="button"
            kind="danger--ghost"
            size="sm"
            hasIconOnly
            renderIcon={TrashCan}
            iconDescription={intl.formatMessage({
              id: "program.management.deleteQuestion",
            })}
            onClick={onDelete}
          />
        </div>
      </header>
      <div className="program-question-card__fields">
        <TextInput
          id={`question-text-${item.linkId}`}
          labelText={intl.formatMessage({
            id: "program.management.questionText",
          })}
          value={item.text || ""}
          onChange={(event) => onChange({ ...item, text: event.target.value })}
          invalid={!item.text?.trim()}
          invalidText={intl.formatMessage({ id: "question.text.required" })}
        />
        <Select
          id={`question-type-${item.linkId}`}
          labelText={intl.formatMessage({
            id: "program.management.questionType",
          })}
          value={visualType || "string"}
          onChange={(event) => changeType(event.target.value)}
        >
          {QUESTION_TYPES.map((type) => (
            <SelectItem
              key={type}
              value={type}
              text={intl.formatMessage({
                id: `program.management.questionType.${type}`,
              })}
            />
          ))}
        </Select>
      </div>
      {isChoice && (
        <div className="program-question-card__options">
          <label htmlFor={`question-option-${item.linkId}`}>
            <FormattedMessage id="program.management.options" />
          </label>
          {options.length > 0 && (
            <div className="program-question-card__option-list">
              {options.map((option, optionIndex) => (
                <span key={`${optionLabel(option)}-${optionIndex}`}>
                  <Tag type="blue">{optionLabel(option)}</Tag>
                  <Button
                    type="button"
                    kind="ghost"
                    size="sm"
                    hasIconOnly
                    renderIcon={TrashCan}
                    iconDescription={intl.formatMessage({
                      id: "program.management.deleteOption",
                    })}
                    onClick={() =>
                      onChange({
                        ...item,
                        answerOption: options.filter(
                          (_value, currentIndex) =>
                            currentIndex !== optionIndex,
                        ),
                      })
                    }
                  />
                </span>
              ))}
            </div>
          )}
          <div className="program-question-card__option-entry">
            <TextInput
              id={`question-option-${item.linkId}`}
              labelText=""
              hideLabel
              placeholder={intl.formatMessage({
                id: "program.management.optionPlaceholder",
              })}
              value={optionDraft}
              onChange={(event) => setOptionDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addOption();
                }
              }}
            />
            <Button
              type="button"
              kind="tertiary"
              size="sm"
              renderIcon={Add}
              onClick={addOption}
              disabled={!optionDraft.trim()}
            >
              <FormattedMessage id="program.management.addOption" />
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

function ProgramQuestionnaireBuilder({
  additionalOrderEntryQuestions,
  handleFieldChange,
  onValidityChange = () => {},
}) {
  const intl = useIntl();
  const [advancedMode, setAdvancedMode] = useState(false);
  const parsed = useMemo(
    () => parseQuestionnaire(additionalOrderEntryQuestions),
    [additionalOrderEntryQuestions],
  );
  const questionsComplete = useMemo(
    () =>
      Boolean(
        parsed.valid &&
        parsed.value.item.every((item) => {
          if (!item.text?.trim()) return false;
          if (item.type !== "choice") return true;
          return (
            Array.isArray(item.answerOption) && item.answerOption.length > 0
          );
        }),
      ),
    [parsed],
  );

  useEffect(() => {
    onValidityChange(questionsComplete);
  }, [onValidityChange, questionsComplete]);

  const updateQuestionnaire = (questionnaire) => {
    handleFieldChange({
      target: {
        name: "additionalOrderEntryQuestions",
        value: JSON.stringify(questionnaire, null, 2),
      },
    });
  };
  const updateItem = (index, item) => {
    const items = [...parsed.value.item];
    items[index] = item;
    updateQuestionnaire({ ...parsed.value, item: items });
  };
  const moveItem = (index, offset) => {
    const items = [...parsed.value.item];
    const [item] = items.splice(index, 1);
    items.splice(index + offset, 0, item);
    updateQuestionnaire({ ...parsed.value, item: items });
  };
  const addQuestion = () => {
    const newQuestion = {
      linkId: crypto.randomUUID(),
      text: "",
      type: "string",
    };
    updateQuestionnaire({
      ...parsed.value,
      item: [...parsed.value.item, newQuestion],
    });
  };

  return (
    <section className="program-workspace__card program-questionnaire">
      <header>
        <div>
          <h2>
            <FormattedMessage id="program.management.questionnaire" />
          </h2>
          <p>
            <FormattedMessage id="program.management.questionnaireHelper" />
          </p>
        </div>
        <Toggle
          id="program-json-mode"
          size="sm"
          labelText={intl.formatMessage({
            id: "program.management.advancedMode",
          })}
          labelA={intl.formatMessage({ id: "program.management.visualMode" })}
          labelB={intl.formatMessage({ id: "program.management.jsonMode" })}
          toggled={advancedMode}
          onToggle={setAdvancedMode}
        />
      </header>

      {advancedMode ? (
        <div className="program-questionnaire__json">
          <InlineNotification
            lowContrast
            hideCloseButton
            kind="info"
            title={intl.formatMessage({
              id: "program.management.jsonNotice",
            })}
          />
          <TextArea
            id="additionalOrderEntryQuestions"
            name="additionalOrderEntryQuestions"
            labelText={intl.formatMessage({
              id: "program.management.jsonLabel",
            })}
            rows={14}
            value={additionalOrderEntryQuestions || ""}
            onChange={handleFieldChange}
            invalid={!parsed.valid}
            invalidText={intl.formatMessage({ id: "invalid.json" })}
          />
        </div>
      ) : !parsed.valid ? (
        <div className="program-questionnaire__invalid">
          <InlineNotification
            kind="error"
            hideCloseButton
            title={intl.formatMessage({
              id: "program.management.invalidQuestionnaire",
            })}
            subtitle={intl.formatMessage({
              id: "program.management.invalidQuestionnaireHelper",
            })}
          />
          <Button
            type="button"
            kind="tertiary"
            onClick={() => setAdvancedMode(true)}
          >
            <FormattedMessage id="program.management.openJson" />
          </Button>
        </div>
      ) : (
        <div className="program-questionnaire__workspace">
          <div className="program-questionnaire__builder">
            <div className="program-questionnaire__toolbar">
              <strong>
                <FormattedMessage
                  id="program.management.questions"
                  values={{ count: parsed.value.item.length }}
                />
              </strong>
              <Button
                type="button"
                kind="tertiary"
                size="sm"
                renderIcon={Add}
                onClick={addQuestion}
              >
                <FormattedMessage id="program.management.addQuestion" />
              </Button>
            </div>
            {parsed.value.item.length === 0 ? (
              <div className="program-questionnaire__empty">
                <h3>
                  <FormattedMessage id="program.management.noQuestions" />
                </h3>
                <p>
                  <FormattedMessage id="program.management.noQuestionsHelper" />
                </p>
                <Button
                  type="button"
                  kind="tertiary"
                  size="sm"
                  renderIcon={Add}
                  onClick={addQuestion}
                >
                  <FormattedMessage id="program.management.addFirstQuestion" />
                </Button>
              </div>
            ) : (
              <div className="program-questionnaire__questions">
                {parsed.value.item.map((item, index) => (
                  <QuestionCard
                    key={item.linkId || index}
                    item={item}
                    index={index}
                    count={parsed.value.item.length}
                    onChange={(next) => updateItem(index, next)}
                    onDelete={() =>
                      updateQuestionnaire({
                        ...parsed.value,
                        item: parsed.value.item.filter(
                          (_value, currentIndex) => currentIndex !== index,
                        ),
                      })
                    }
                    onMove={(offset) => moveItem(index, offset)}
                  />
                ))}
              </div>
            )}
          </div>
          <aside className="program-questionnaire__preview">
            <div>
              <span>
                <FormattedMessage id="program.management.preview" />
              </span>
              <Tag size="sm" type="green">
                <FormattedMessage id="program.management.live" />
              </Tag>
            </div>
            {parsed.value.item.length ? (
              <Questionnaire questionnaire={parsed.value} />
            ) : (
              <p>
                <FormattedMessage id="program.management.previewEmpty" />
              </p>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

export default ProgramQuestionnaireBuilder;
