import React from "react";
import { useIntl } from "react-intl";
import { Tab, Tabs, TabList } from "@carbon/react";
//import styles from './trendline.scss';
import "./trendline.scss";

const RangeSelector: React.FC<{
  setLowerRange: (lowerRange: Date) => void;
  upperRange: Date;
}> = ({ setLowerRange, upperRange }) => {
  const intl = useIntl();
  const ranges: Array<[string, () => void]> = [
    [
      intl.formatMessage({ id: "patient.resultsViewer.trend.range.oneDay" }),
      () =>
        setLowerRange(
          new Date(Date.parse(upperRange.toString()) - 1 * 24 * 3600 * 1000),
        ),
    ],
    [
      intl.formatMessage({ id: "patient.resultsViewer.trend.range.fiveDays" }),
      () =>
        setLowerRange(
          new Date(Date.parse(upperRange.toString()) - 5 * 24 * 3600 * 1000),
        ),
    ],
    [
      intl.formatMessage({ id: "patient.resultsViewer.trend.range.oneMonth" }),
      () =>
        setLowerRange(
          new Date(Date.parse(upperRange.toString()) - 30 * 24 * 3600 * 1000),
        ),
    ],
    [
      intl.formatMessage({ id: "patient.resultsViewer.trend.range.sixMonths" }),
      () =>
        setLowerRange(
          new Date(Date.parse(upperRange.toString()) - 182 * 24 * 3600 * 1000),
        ),
    ],
    [
      intl.formatMessage({ id: "patient.resultsViewer.trend.range.oneYear" }),
      () =>
        setLowerRange(
          new Date(Date.parse(upperRange.toString()) - 365 * 24 * 3600 * 1000),
        ),
    ],
    [
      intl.formatMessage({ id: "patient.resultsViewer.trend.range.fiveYears" }),
      () =>
        setLowerRange(
          new Date(
            Date.parse(upperRange.toString()) - 5 * 365 * 24 * 3600 * 1000,
          ),
        ),
    ],
    [
      intl.formatMessage({ id: "patient.resultsViewer.trend.range.all" }),
      () => setLowerRange(new Date(0)),
    ],
  ];

  return (
    <Tabs light selected={6} className="range-tabs">
      <TabList
        aria-label={intl.formatMessage({
          id: "patient.resultsViewer.trend.range.aria",
        })}
      >
        {ranges.map(([label, onClick], index) => (
          <Tab onClick={onClick} key={index}>
            {label}
          </Tab>
        ))}
      </TabList>
    </Tabs>
  );
};

export default React.memo(RangeSelector);
