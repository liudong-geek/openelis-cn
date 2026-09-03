import React from "react";
import { Layer, Link, Tile } from "@carbon/react";
import { useIntl } from "react-intl";
import { EmptyDataIllustration } from "./empty-data-illustration.component";
import { useLayoutType } from "../utils";
//import styles from './empty-state.scss';
import "./empty-state.scss";

export interface EmptyStateProps {
  displayText: string;
  headerTitle: string;
  launchForm?(): void;
}

export const EmptyState: React.FC<EmptyStateProps> = (props) => {
  const intl = useIntl();
  const isTablet = useLayoutType() === "tablet";

  return (
    <Layer>
      <Tile className="tile">
        <div className={isTablet ? "tabletHeading" : "desktopHeading"}>
          <h4>{props.headerTitle}</h4>
        </div>
        <EmptyDataIllustration
          title={intl.formatMessage({
            id: "patient.resultsViewer.empty.illustration",
          })}
        />
        <p className="content">
          {intl.formatMessage(
            { id: "patient.resultsViewer.empty.message" },
            { displayText: props.displayText },
          )}
        </p>
        <p className="action">
          {props.launchForm && (
            <span>
              <Link onClick={() => props.launchForm()}>
                {intl.formatMessage(
                  { id: "patient.resultsViewer.empty.record" },
                  { displayText: props.displayText },
                )}
              </Link>
            </span>
          )}
        </p>
      </Tile>
    </Layer>
  );
};
