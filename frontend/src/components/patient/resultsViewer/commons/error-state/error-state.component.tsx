import React from "react";
import { Layer, Tile } from "@carbon/react";
import { useIntl } from "react-intl";
import { useLayoutType } from "../utils";
//import styles from './error-state.scss';
import "./error-state.scss";

export interface ErrorStateProps {
  error: any;
  headerTitle: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  error,
  headerTitle,
}) => {
  const intl = useIntl();
  const isTablet = useLayoutType() === "tablet";
  const statusCode = error?.response?.status;

  return (
    <Layer>
      <Tile className="tile">
        <div className={isTablet ? "tabletHeading" : "desktopHeading"}>
          <h4>{headerTitle}</h4>
        </div>
        <p className="errorMessage">
          {statusCode
            ? intl.formatMessage(
                { id: "patient.resultsViewer.error.withCode" },
                { status: statusCode },
              )
            : intl.formatMessage({
                id: "patient.resultsViewer.error.label",
              })}
        </p>
        <p className="errorCopy">
          {intl.formatMessage({ id: "patient.resultsViewer.error.copy" })}
        </p>
      </Tile>
    </Layer>
  );
};
