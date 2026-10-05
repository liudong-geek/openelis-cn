import React from "react";
import {
  Button,
  Checkbox,
  InlineNotification,
  Select,
  SelectItem,
  TextInput,
} from "@carbon/react";
import { ChevronDown, ChevronUp, Search } from "@carbon/icons-react";
import { FormattedMessage, useIntl } from "react-intl";
import { electronicOrderStatusLabel } from "./electronicOrderLabels";

const errorKeys = {
  capability: "eorder.query.error.capability",
  date: "eorder.query.error.date",
  invalid: "eorder.query.error.invalid",
  configuration: "eorder.query.error.configuration",
  scope: "eorder.query.error.scope",
  unauthenticated: "eorder.query.error.unauthenticated",
  forbidden: "eorder.query.error.forbidden",
};
const EOrderSearch = ({
  draft,
  onChange,
  advanced,
  onToggleAdvanced,
  statuses,
  queryState,
  warnings,
  onSearch,
  onReset,
}) => {
  const intl = useIntl();
  const message = (key) => intl.formatMessage({ id: key });
  const dateChange = (key) => (event) =>
    onChange({ [key]: event.currentTarget.value });
  const warning = warnings.includes("FHIR_SEARCH_INCOMPLETE")
    ? "eorder.warning.FHIR_SEARCH_INCOMPLETE"
    : "eorder.warning.FHIR_SEARCH_UNAVAILABLE";
  return (
    <section
      className="eorder-search-panel"
      aria-labelledby="eorder-search-title"
    >
      <div className="eorder-search-panel__heading">
        <h2 id="eorder-search-title">
          <FormattedMessage id="eorder.search.title" />
        </h2>
        <p>
          <FormattedMessage id="eorder.query.defaultScope" />
        </p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <div className="eorder-search-controls">
          <TextInput
            id="eorder-keyword"
            labelText={message("eorder.query.keyword")}
            placeholder={message("eorder.search1.text")}
            value={draft.searchValue}
            maxLength={200}
            onChange={(event) => onChange({ searchValue: event.target.value })}
          />
          <div className="eorder-search-actions">
            <Button
              type="submit"
              renderIcon={Search}
              disabled={queryState.phase === "loading"}
            >
              <FormattedMessage id="label.button.search" />
            </Button>
            <Button type="button" kind="tertiary" onClick={onReset}>
              <FormattedMessage id="label.button.reset" />
            </Button>
            <Button
              type="button"
              kind="ghost"
              aria-expanded={advanced}
              aria-controls="eorder-advanced"
              renderIcon={advanced ? ChevronUp : ChevronDown}
              onClick={onToggleAdvanced}
            >
              <FormattedMessage
                id={
                  advanced ? "eorder.query.collapse" : "eorder.query.advanced"
                }
              />
            </Button>
          </div>
        </div>
        <div
          className="eorder-advanced"
          id="eorder-advanced"
          hidden={!advanced}
        >
          <TextInput
            id="eorder-start-date"
            type="date"
            labelText={message("eorder.date.start")}
            value={draft.startDate}
            onInput={dateChange("startDate")}
            onChange={dateChange("startDate")}
          />
          <TextInput
            id="eorder-end-date"
            type="date"
            labelText={message("eorder.date.end")}
            value={draft.endDate}
            onInput={dateChange("endDate")}
            onChange={dateChange("endDate")}
          />
          <Select
            id="eorder-status-filter"
            labelText={message("eorder.status")}
            value={draft.statusFilter}
            onChange={(event) => onChange({ statusFilter: event.target.value })}
          >
            <SelectItem
              value="PENDING"
              text={message("eorder.query.pending")}
            />
            <SelectItem
              value="ALL"
              text={message("eorder.query.allStatuses")}
            />
            {statuses.map((status) => (
              <SelectItem
                key={status.id}
                value={status.id}
                text={
                  electronicOrderStatusLabel(status.value, intl) ||
                  message("eorder.status.unknown")
                }
              />
            ))}
          </Select>
          <Checkbox
            id="eorder-details"
            labelText={message("eorder.query.includeDetails")}
            checked={draft.useAllInfo}
            onChange={(_, { checked }) => onChange({ useAllInfo: checked })}
          />
        </div>
      </form>
      {queryState.phase === "error" && (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title={message("eorder.search.failed")}
          subtitle={message(
            errorKeys[queryState.kind] || "eorder.query.error.unavailable",
          )}
        />
      )}
      {queryState.phase === "success" && warnings.length > 0 && (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title={message("eorder.query.partial")}
          subtitle={message(warning)}
        />
      )}
    </section>
  );
};
export default EOrderSearch;
