import React from "react";
import { Modal, Tile } from "@carbon/react";
import { useIntl, FormattedMessage } from "react-intl";

// Never manufacture result evidence from formatted display values. Explicit
// empty strings and numeric zero are meaningful stored values.
const valueFor = (value, intl) => {
  if (value === null || value === undefined) {
    return intl.formatMessage({ id: "validation.details.unavailable" });
  }
  if (value === "")
    return intl.formatMessage({ id: "validation.details.empty" });
  return String(value);
};

export const reviewRowIdentity = (queryId, row) =>
  JSON.stringify([
    queryId,
    row.analysisId,
    row.resultId,
    row.testResultComponentId,
  ]);

const ReviewResultDetails = ({ row, displayValue, onClose }) => {
  const intl = useIntl();
  const field = (key, value) => (
    <div key={key} className="validation-detail-field">
      <dt>
        <FormattedMessage id={key} />
      </dt>
      <dd>{valueFor(value, intl)}</dd>
    </div>
  );
  return (
    <Modal
      open
      passiveModal
      size="lg"
      onRequestClose={onClose}
      modalHeading={intl.formatMessage({ id: "validation.details.title" })}
      closeButtonLabel={intl.formatMessage({ id: "validation.details.close" })}
    >
      <p className="validation-detail-summary">
        {row.accessionNumber} · {row.testName}
      </p>
      <dl className="validation-detail-grid">
        <div className="validation-detail-field">
          <dt>
            <FormattedMessage id="validation.details.display" />
          </dt>
          <dd>
            {displayValue === null ||
            displayValue === undefined ||
            displayValue === ""
              ? valueFor(displayValue, intl)
              : displayValue}
          </dd>
        </div>
        {field("validation.details.raw", row.rawResultValue)}
        {field("validation.details.analysisVersion", row.analysisLastupdated)}
        {field("validation.details.analysisId", row.analysisId)}
        {field("validation.details.resultId", row.resultId)}
        {field("validation.details.componentId", row.testResultComponentId)}
        {field("validation.details.sampleItemId", row.sampleItemId)}
        {field("validation.details.type", row.resultType)}
      </dl>
      <h4>
        <FormattedMessage id="validation.details.members" />
      </h4>
      {Array.isArray(row.resultMembers) && row.resultMembers.length ? (
        row.resultMembers.map((member, index) => (
          <Tile
            key={`${member.resultId}-${index}`}
            className="validation-detail-member"
          >
            <dl className="validation-detail-grid">
              {field("validation.details.resultId", member.resultId)}
              {field("validation.details.raw", member.rawResultValue)}
              {field("validation.details.type", member.resultType)}
              {field(
                "validation.details.componentId",
                member.testResultComponentId,
              )}
              {field("validation.details.parentId", member.parentResultId)}
              {field("validation.details.group", member.grouping)}
            </dl>
          </Tile>
        ))
      ) : (
        <p>
          <FormattedMessage id="validation.details.noMembers" />
        </p>
      )}
      <h4>
        <FormattedMessage id="column.name.pastNotes" />
      </h4>
      <p className="validation-detail-notes">
        {valueFor(row.pastNotes?.replace(/<br\s*\/?>/gi, "\n"), intl)}
      </p>
    </Modal>
  );
};

export default ReviewResultDetails;
