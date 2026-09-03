import React, { useContext, useEffect, useState } from "react";
import { AccordionSkeleton, DataTableSkeleton, Button } from "@carbon/react";
import { TreeViewAlt } from "@carbon/react/icons";
import { useLayoutType } from "../commons";
import FilterSet, { FilterContext } from "../filter";
import GroupedTimeline from "../grouped-timeline";
import Trendline from "../trendline/trendline.component";
//import styles from '../results-viewer.styles.scss';
import "../results-viewer.styles.scss";
import { useIntl } from "react-intl";
import TabletOverlay from "../tablet-overlay";

interface TreeViewProps {
  patientUuid: string;
  basePath: string;
  testUuid: string;
  loading: boolean;
  expanded: boolean;
  type: string;
}

const TreeView: React.FC<TreeViewProps> = ({
  patientUuid,
  basePath,
  testUuid,
  loading,
  expanded,
  type,
}) => {
  const tablet = useLayoutType() === "tablet";
  const [showTreeOverlay, setShowTreeOverlay] = useState(false);
  const intl = useIntl();
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", updateHash);
    window.addEventListener("popstate", updateHash);
    return () => {
      window.removeEventListener("hashchange", updateHash);
      window.removeEventListener("popstate", updateHash);
    };
  }, []);
  const encodedTrendConcept = hash.startsWith("#trendline/")
    ? hash.slice("#trendline/".length)
    : "";
  let trendConceptUuid = "";
  try {
    trendConceptUuid = decodeURIComponent(encodedTrendConcept);
  } catch {
    trendConceptUuid = "";
  }

  const { timelineData, resetTree } = useContext(FilterContext);

  if (tablet) {
    return (
      <>
        <div>
          {!loading ? (
            trendConceptUuid ? (
              <Trendline
                patientUuid={patientUuid}
                conceptUuid={trendConceptUuid}
                basePath={basePath}
                showBackToTimelineButton
              />
            ) : (
              <GroupedTimeline />
            )
          ) : (
            <DataTableSkeleton />
          )}
        </div>
        <div className="floatingTreeButton">
          <Button
            renderIcon={TreeViewAlt}
            hasIconOnly
            onClick={() => setShowTreeOverlay(true)}
            iconDescription={intl.formatMessage({
              id: "patient.resultsViewer.tree.show",
            })}
          />
        </div>
        {showTreeOverlay && (
          <TabletOverlay
            headerText={intl.formatMessage({
              id: "patient.resultsViewer.tree.title",
            })}
            close={() => setShowTreeOverlay(false)}
            buttonsGroup={
              <>
                <Button
                  kind="secondary"
                  size="xl"
                  onClick={resetTree}
                  disabled={loading}
                >
                  {intl.formatMessage({
                    id: "patient.resultsViewer.tree.reset",
                  })}
                </Button>
                <Button
                  kind="primary"
                  size="xl"
                  onClick={() => setShowTreeOverlay(false)}
                  disabled={loading}
                >
                  {intl.formatMessage(
                    { id: "patient.resultsViewer.tree.viewResults" },
                    {
                      count:
                        !loading && timelineData?.loaded
                          ? timelineData?.data?.rowData?.length
                          : 0,
                    },
                  )}
                </Button>
              </>
            }
          >
            {!loading ? (
              <FilterSet hideFilterSetHeader />
            ) : (
              <AccordionSkeleton open count={4} align="start" />
            )}
          </TabletOverlay>
        )}
      </>
    );
  }

  return (
    <>
      {!tablet && (
        <div id="treeview" className="leftSection">
          {!loading ? (
            <FilterSet />
          ) : (
            <AccordionSkeleton open count={4} align="start" />
          )}
        </div>
      )}
      <div className="rightSection">
        {!tablet && trendConceptUuid ? (
          <Trendline
            patientUuid={patientUuid}
            conceptUuid={trendConceptUuid}
            basePath={basePath}
            showBackToTimelineButton
          />
        ) : !loading || hash === "#groupedtimeline" ? (
          <GroupedTimeline />
        ) : (
          <DataTableSkeleton />
        )}
      </div>
    </>
  );
};

export default TreeView;
