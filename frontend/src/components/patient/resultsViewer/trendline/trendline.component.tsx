import React, { useState, useCallback, useMemo, useLayoutEffect } from "react";
import { useIntl } from "react-intl";
import { Button, InlineLoading } from "@carbon/react";
import { ArrowLeft } from "@carbon/react/icons";
import { LineChart } from "@carbon/charts-react";
import { parseDate, ConfigurableLink } from "../commons";
import { EmptyState, ErrorState, OBSERVATION_INTERPRETATION } from "../commons";
import { useObstreeData } from "./trendline-resource";
import CommonDataTable from "../overview/common-datatable.component";
import RangeSelector from "./range-selector.component";
//import styles from './trendline.scss';
import "./trendline.scss";

enum ScaleTypes {
  TIME = "time",
  LINEAR = "linear",
  LOG = "log",
  LABELS = "labels",
}

enum TickRotations {
  ALWAYS = "always",
  AUTO = "auto",
  NEVER = "never",
}

const numericValuePattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const comparisonValuePattern =
  /^(?:<=|>=|<|>|≤|≥)\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)$/;

const parseTrendNumber = (candidate: unknown): number | null => {
  if (typeof candidate === "number") {
    return Number.isFinite(candidate) ? candidate : null;
  }

  if (typeof candidate !== "string") {
    return null;
  }

  const normalized = candidate.trim();
  if (!normalized) {
    return null;
  }

  const numericText = numericValuePattern.test(normalized)
    ? normalized
    : comparisonValuePattern.exec(normalized)?.[1];
  if (!numericText) {
    return null;
  }

  const numericValue = Number(numericText);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const getTrendValue = (observation: {
  value?: unknown;
  rawValue?: unknown;
}): number | null =>
  parseTrendNumber(observation.value) ?? parseTrendNumber(observation.rawValue);

const TrendLineBackground = ({ ...props }) => (
  <div {...props} className="background" />
);

const TrendlineHeader = ({
  patientUuid,
  title,
  referenceRange,
  isValidating,
  showBackToTimelineButton,
}) => {
  const intl = useIntl();
  return (
    <div className="header">
      <div className="backButton">
        {showBackToTimelineButton && (
          <ConfigurableLink to="#groupedtimeline">
            <Button
              kind="ghost"
              renderIcon={(props) => <ArrowLeft {...props} size={24} />}
              iconDescription={intl.formatMessage({
                id: "patient.resultsViewer.trend.returnToTimeline",
              })}
            >
              <span>
                {intl.formatMessage({
                  id: "patient.resultsViewer.trend.backToTimeline",
                })}
              </span>
            </Button>
          </ConfigurableLink>
        )}
      </div>
      <div className="content">
        <span className="title">{title}</span>
        <span className="referenceange">{referenceRange}</span>
      </div>
      <div>{isValidating && <InlineLoading className="inlineLoader" />}</div>
    </div>
  );
};

interface TrendlineProps {
  patientUuid: string;
  conceptUuid: string;
  basePath: string;
  hideTrendlineHeader?: boolean;
  showBackToTimelineButton?: boolean;
}

const Trendline: React.FC<TrendlineProps> = ({
  patientUuid,
  conceptUuid,
  basePath,
  hideTrendlineHeader = false,
  showBackToTimelineButton = false,
}) => {
  const { trendlineData, isLoading, isValidating, error } = useObstreeData(
    patientUuid,
    conceptUuid,
  );
  const intl = useIntl();
  const {
    obs,
    display: chartTitle,
    hiNormal,
    lowNormal,
    units: leftAxisTitle,
    range: referenceRange,
  } = trendlineData;
  const bottomAxisTitle = intl.formatMessage({
    id: "patient.resultsViewer.trend.date",
  });
  const [range, setRange] = useState<[Date, Date]>();

  const [upperRange, lowerRange] = useMemo(() => {
    if (obs.length === 0) {
      return [new Date(), new Date()];
    }
    return [new Date(), new Date(Date.parse(obs[obs.length - 1].obsDatetime))];
  }, [obs]);

  const setLowerRange = useCallback(
    (selectedLowerRange: Date) => {
      setRange([
        selectedLowerRange > lowerRange ? selectedLowerRange : lowerRange,
        upperRange,
      ]);
    },
    [setRange, upperRange, lowerRange],
  );

  /**
   * reorder svg element to bring line in front of the area
   */
  useLayoutEffect(() => {
    const graph = document.querySelector("g.cds--cc--area")?.parentElement;
    if (obs && obs.length && graph) {
      graph.insertBefore(graph.children[3], graph.childNodes[2]);
    }
  }, [obs]);

  const data: Array<{
    date: Date;
    value: number;
    group: string;
    min?: number;
    max?: number;
  }> = [];

  //

  const tableData: Array<{
    id: string;
    date: string;
    time: string;
    value:
      | number
      | {
          value: number;
          interpretation: OBSERVATION_INTERPRETATION;
        };
  }> = [];

  const dataset = chartTitle;

  obs.forEach((obs, idx) => {
    const numericValue = getTrendValue(obs);
    if (numericValue === null) {
      return;
    }

    const observationLowNormal = obs.lowNormal ?? lowNormal;
    const observationHighNormal = obs.hiNormal ?? hiNormal;
    const numericLowNormal = parseTrendNumber(observationLowNormal);
    const numericHighNormal = parseTrendNumber(observationHighNormal);
    const normalRange = {
      ...(numericHighNormal !== null ? { max: numericHighNormal } : {}),
      ...(numericLowNormal !== null ? { min: numericLowNormal } : {}),
    };

    data.push({
      date: new Date(Date.parse(obs.obsDatetime)),
      value: numericValue,
      group: chartTitle,
      ...normalRange,
    });

    tableData.push({
      id: `${idx}`,
      date: intl.formatDate(parseDate(obs.obsDatetime), {
        year: "numeric",
        month: "short",
        day: "2-digit",
      }),
      time: intl.formatTime(parseDate(obs.obsDatetime), {
        hour: "2-digit",
        minute: "2-digit",
      }),
      value: {
        value: numericValue,
        interpretation: obs.interpretation,
      },
    });
  });

  const chartOptions = useMemo(
    () => ({
      bounds: {
        lowerBoundMapsTo: "min",
        upperBoundMapsTo: "max",
      },
      axes: {
        bottom: {
          title: bottomAxisTitle,
          mapsTo: "date",
          scaleType: ScaleTypes.TIME,
          ticks: {
            rotation: TickRotations.ALWAYS,
            // formatter: x => x.toLocaleDateString("en-US", TableDateFormatOption)
          },
          domain: range,
        },
        left: {
          mapsTo: "value",
          title: leftAxisTitle,
          scaleType: ScaleTypes.LINEAR,
          includeZero: false,
        },
      },
      height: "20.125rem",

      color: {
        scale: {
          [chartTitle]: "#6929c4",
        },
      },
      points: {
        radius: 4,
        enabled: true,
      },
      legend: {
        enabled: false,
      },
      locale: {
        code: intl.locale,
        translations: {
          group: intl.formatMessage({
            id: "patient.resultsViewer.chart.group",
          }),
          total: intl.formatMessage({
            id: "patient.resultsViewer.chart.total",
          }),
          tabularRep: {
            title: intl.formatMessage({
              id: "patient.resultsViewer.chart.table.title",
            }),
            downloadAsCSV: intl.formatMessage({
              id: "patient.resultsViewer.chart.table.downloadCsv",
            }),
          },
          toolbar: {
            exportAsCSV: intl.formatMessage({
              id: "patient.resultsViewer.chart.exportCsv",
            }),
            exportAsJPG: intl.formatMessage({
              id: "patient.resultsViewer.chart.exportJpg",
            }),
            exportAsPNG: intl.formatMessage({
              id: "patient.resultsViewer.chart.exportPng",
            }),
            zoomIn: intl.formatMessage({
              id: "patient.resultsViewer.chart.zoomIn",
            }),
            zoomOut: intl.formatMessage({
              id: "patient.resultsViewer.chart.zoomOut",
            }),
            resetZoom: intl.formatMessage({
              id: "patient.resultsViewer.chart.resetZoom",
            }),
            moreOptions: intl.formatMessage({
              id: "patient.resultsViewer.chart.moreOptions",
            }),
            makeFullScreen: intl.formatMessage({
              id: "patient.resultsViewer.chart.fullScreen",
            }),
            exitFullScreen: intl.formatMessage({
              id: "patient.resultsViewer.chart.exitFullScreen",
            }),
            showAsTable: intl.formatMessage({
              id: "patient.resultsViewer.chart.showTable",
            }),
          },
        },
      },
      tooltip: {
        customHTML: ([{ date, value }]) =>
          `<div class="cds--tooltip cds--tooltip--shown" style="min-width: max-content; font-weight:600">${value} ${leftAxisTitle}<br>
          <span style="color: #c6c6c6; font-size: 0.75rem; font-weight:400">${intl.formatDate(
            date,
            {
              year: "numeric",
              month: "short",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            },
          )}</span></div>`,
      },
    }),
    [bottomAxisTitle, leftAxisTitle, range, chartTitle, intl],
  );

  const tableHeaderData = useMemo(
    () => [
      {
        header: intl.formatMessage({
          id: "patient.resultsViewer.trend.date",
        }),
        key: "date",
      },
      {
        header: intl.formatMessage({
          id: "patient.resultsViewer.trend.timeOfTest",
        }),
        key: "time",
      },
      {
        header: `${intl.formatMessage({
          id: "patient.resultsViewer.trend.value",
        })} (${leftAxisTitle})`,
        key: "value",
      },
    ],
    [intl, leftAxisTitle],
  );

  if (isLoading) {
    return (
      <InlineLoading
        description={intl.formatMessage({
          id: "patient.resultsViewer.trend.loading",
        })}
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        error={error}
        headerTitle={intl.formatMessage({
          id: "patient.resultsViewer.error.title",
        })}
      />
    );
  }

  if (obs.length === 0) {
    return (
      <EmptyState
        displayText={intl.formatMessage({
          id: "patient.resultsViewer.trend.observations",
        })}
        headerTitle={chartTitle}
      />
    );
  }

  return (
    <>
      {!hideTrendlineHeader && (
        <TrendlineHeader
          showBackToTimelineButton={showBackToTimelineButton}
          isValidating={isValidating}
          patientUuid={patientUuid}
          title={dataset}
          referenceRange={referenceRange}
        />
      )}
      <TrendLineBackground>
        <RangeSelector setLowerRange={setLowerRange} upperRange={upperRange} />
        <LineChart data={data} options={chartOptions} />
      </TrendLineBackground>
      <DrawTable {...{ tableData, tableHeaderData }} />
    </>
  );
};

const DrawTable = React.memo<{ tableData; tableHeaderData }>(
  ({ tableData, tableHeaderData }) => {
    return <CommonDataTable data={tableData} tableHeaders={tableHeaderData} />;
  },
);

export default Trendline;
