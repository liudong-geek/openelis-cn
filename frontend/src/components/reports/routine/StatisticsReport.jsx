import React, { useEffect, useState } from "react";
import {
  Form,
  Checkbox,
  Button,
  Dropdown,
  InlineLoading,
  InlineNotification,
} from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import { getFromOpenElisServer, Roles } from "../../utils/Utils";
import "../../Style.css";
import config from "../../../config.json";
import { openReportWindow } from "../common/reportLaunch";
import { formatTatPriority } from "../tat/tatUtils";
import "./statistics-report.scss";

const timeFrames = [
  {
    id: "NORMAL_WORK_HOURS",
    labelId: "reports.statistics.timeFrame.normal",
  },
  {
    id: "OUT_OF_NORMAL_WORK_HOURS",
    labelId: "reports.statistics.timeFrame.outside",
  },
];

const MINIMUM_REPORT_YEAR = 2009;

const monthColumns = [
  ["Jan", 1],
  ["Feb", 2],
  ["Mar", 3],
  ["Apr", 4],
  ["May", 5],
  ["Jun", 6],
  ["Jul", 7],
  ["Aug", 8],
  ["Sep", 9],
  ["Oct", 10],
  ["Nov", 11],
  ["Dec", 12],
].map(([suffix, month]) => ({
  month,
  testsKey: `tests${suffix}`,
  samplesKey: `samples${suffix}`,
}));

export const buildStatisticsReportUrl = ({
  serverBaseUrl,
  labUnits = [],
  priorities = [],
  receptionTimes = [],
  year,
}) => {
  const query = new URLSearchParams({
    report: "statisticsReport",
    type: "indicator",
    upperYear: String(year),
  });
  labUnits.forEach((unit) => query.append("labSections", String(unit)));
  priorities.forEach((priority) => query.append("priority", String(priority)));
  receptionTimes.forEach((timeFrame) =>
    query.append("receptionTime", String(timeFrame)),
  );

  const baseUrl = String(serverBaseUrl || "").replace(/\/$/, "");
  return `${baseUrl}/ReportPrint?${query.toString()}`;
};

export const buildStatisticsPreviewUrl = ({
  labUnits = [],
  priorities = [],
  receptionTimes = [],
  year,
}) => {
  const query = new URLSearchParams({ year: String(year) });
  labUnits.forEach((unit) => query.append("labSections", String(unit)));
  priorities.forEach((priority) => query.append("priority", String(priority)));
  receptionTimes.forEach((timeFrame) =>
    query.append("receptionTime", String(timeFrame)),
  );
  return `/rest/reports/statistics/workload?${query.toString()}`;
};

const StatisticsReport = () => {
  const intl = useIntl();
  const [labUnits, setLabUnits] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [selectedLabUnits, setSelectedLabUnits] = useState([]);
  const [selectedPriorities, setSelectedPriorities] = useState([]);
  const [selectedTimeFrames, setSelectedTimeFrames] = useState(() =>
    timeFrames.map((frame) => frame.id),
  );
  const [selectedYear, setSelectedYear] = useState({
    value: new Date().getFullYear(),
    label: new Date().getFullYear().toString(),
  });

  const [labUnitsState, setLabUnitsState] = useState("loading");
  const [prioritiesState, setPrioritiesState] = useState("loading");
  const [launchError, setLaunchError] = useState(false);
  const [yearError, setYearError] = useState(false);
  const [previewState, setPreviewState] = useState("idle");
  const [preview, setPreview] = useState(null);
  const [previewCriteria, setPreviewCriteria] = useState(null);

  useEffect(() => {
    getFromOpenElisServer(
      "/rest/user-test-sections/" + Roles.REPORTS,
      (fetchedTestSections) => {
        if (!Array.isArray(fetchedTestSections)) {
          setLabUnits([]);
          setLabUnitsState("error");
          return;
        }
        const availableLabUnits = fetchedTestSections.filter(
          (unit) => unit?.id !== undefined && unit?.id !== null,
        );
        setLabUnits(availableLabUnits);
        setSelectedLabUnits(availableLabUnits.map((unit) => unit.id));
        setLabUnitsState(availableLabUnits.length > 0 ? "ready" : "empty");
      },
    );
    getFromOpenElisServer(
      "/rest/displayList/ORDER_PRIORITY",
      (fetchedPriorities) => {
        if (!Array.isArray(fetchedPriorities)) {
          setPriorities([]);
          setPrioritiesState("error");
          return;
        }
        const availablePriorities = fetchedPriorities.filter(
          (priority) => priority?.id !== undefined && priority?.id !== null,
        );
        setPriorities(availablePriorities);
        setSelectedPriorities(
          availablePriorities.map((priority) => priority.id),
        );
        setPrioritiesState(availablePriorities.length > 0 ? "ready" : "empty");
      },
    );
  }, []);

  const getCriteria = () => ({
    labUnits:
      selectedLabUnits.length > 0
        ? selectedLabUnits
        : labUnits.map((unit) => unit.id),
    priorities:
      selectedPriorities.length > 0
        ? selectedPriorities
        : priorities.map((priority) => priority.id),
    receptionTimes:
      selectedTimeFrames.length > 0
        ? selectedTimeFrames
        : timeFrames.map((frame) => frame.id),
    year: Number(selectedYear?.value),
  });

  const validateYear = (year) => {
    const invalid =
      !Number.isInteger(year) ||
      year < MINIMUM_REPORT_YEAR ||
      year > currentYear;
    setYearError(invalid);
    if (invalid) {
      setLaunchError(false);
    }
    return !invalid;
  };

  const resetPreview = () => {
    setPreview(null);
    setPreviewCriteria(null);
    setPreviewState("idle");
    setLaunchError(false);
  };

  const handlePreview = (event) => {
    event?.preventDefault();
    const criteria = getCriteria();
    if (!validateYear(criteria.year)) {
      return;
    }

    setPreviewState("loading");
    setPreview(null);
    setPreviewCriteria(null);
    getFromOpenElisServer(buildStatisticsPreviewUrl(criteria), (response) => {
      if (!response || !Array.isArray(response.rows) || !response.totals) {
        setPreviewState("error");
        return;
      }
      setPreview(response);
      setPreviewCriteria(criteria);
      setPreviewState("ready");
    });
  };

  const handlePrint = () => {
    if (!previewCriteria) return;

    const url = buildStatisticsReportUrl({
      serverBaseUrl: config.serverBaseUrl,
      ...previewCriteria,
    });
    setLaunchError(!openReportWindow(url));
  };

  const handleYearChange = (year) => {
    setSelectedYear(year ? { value: year.value, label: year.label } : null);
    setYearError(false);
    resetPreview();
  };

  const handleSelectAllLabUnits = (isChecked) => {
    setSelectedLabUnits(isChecked ? labUnits.map((unit) => unit.id) : []);
    resetPreview();
  };

  const handleSelectAllPriorities = (isChecked) => {
    setSelectedPriorities(
      isChecked ? priorities.map((priority) => priority.id) : [],
    );
    resetPreview();
  };

  const handleSelectAllTimeFrames = (isChecked) => {
    setSelectedTimeFrames(isChecked ? timeFrames.map((frame) => frame.id) : []);
    resetPreview();
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from(
    { length: currentYear - MINIMUM_REPORT_YEAR + 1 },
    (_, index) => ({
      value: currentYear - index,
      label: (currentYear - index).toString(),
    }),
  );

  const optionsLoading =
    labUnitsState === "loading" || prioritiesState === "loading";
  const optionsLoadError =
    labUnitsState === "error" || prioritiesState === "error";
  const optionsEmpty = labUnitsState === "empty" || prioritiesState === "empty";

  return (
    <div className="statistics-report">
      <header className="statistics-report__header">
        <h1>
          <FormattedMessage id="openreports.stat.aggregate" />
        </h1>
      </header>
      <Form className="statistics-report__form" onSubmit={handlePreview}>
        <div className="statistics-report__notifications">
          {optionsLoading && (
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title={intl.formatMessage({
                id: "reports.query.options.loading",
              })}
            />
          )}
          {optionsLoadError && (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title={intl.formatMessage({
                id: "reports.query.options.loadError.title",
              })}
              subtitle={intl.formatMessage({
                id: "reports.query.options.loadError.subtitle",
              })}
            />
          )}
          {optionsEmpty && (
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title={intl.formatMessage({
                id: "reports.query.options.empty",
              })}
            />
          )}
          {launchError && (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title={intl.formatMessage({ id: "reports.query.error.title" })}
              subtitle={intl.formatMessage({
                id: "reports.query.popupBlocked",
              })}
            />
          )}
        </div>
        <InlineNotification
          className="statistics-report__scope"
          kind="info"
          lowContrast
          hideCloseButton
          title={intl.formatMessage({
            id: "reports.statistics.scope.title",
          })}
          subtitle={intl.formatMessage({
            id: "reports.statistics.scope.description",
          })}
        />
        <div className="statistics-report__filter-grid">
          <fieldset className="statistics-report__group statistics-report__group--lab-units">
            <legend>
              <FormattedMessage id="select.labUnits" />
            </legend>
            <div className="statistics-report__options statistics-report__options--lab-units">
              <Checkbox
                labelText={intl.formatMessage({ id: "all.label" })}
                id="select-all-lab-units"
                checked={
                  labUnits.length > 0 &&
                  selectedLabUnits.length === labUnits.length
                }
                onChange={(event) =>
                  handleSelectAllLabUnits(event.target.checked)
                }
              />
              {labUnits.map((unit) => (
                <Checkbox
                  key={unit.id}
                  labelText={unit.value}
                  id={`statistics-lab-unit-${unit.id}`}
                  checked={selectedLabUnits.includes(unit.id)}
                  onChange={() => {
                    resetPreview();
                    setSelectedLabUnits((prev) => {
                      if (prev.includes(unit.id)) {
                        return prev.filter((item) => item !== unit.id);
                      } else {
                        return [...prev, unit.id];
                      }
                    });
                  }}
                />
              ))}
            </div>
          </fieldset>
          <fieldset className="statistics-report__group">
            <legend>
              <FormattedMessage id="select.priority.tests" />
            </legend>
            <div className="statistics-report__options statistics-report__options--priorities">
              <Checkbox
                labelText={intl.formatMessage({ id: "all.label" })}
                id="select-all-priorities"
                checked={
                  priorities.length > 0 &&
                  selectedPriorities.length === priorities.length
                }
                onChange={(event) =>
                  handleSelectAllPriorities(event.target.checked)
                }
              />
              {priorities.map((priority) => (
                <Checkbox
                  key={priority.id}
                  labelText={formatTatPriority(priority.id, intl)}
                  id={`statistics-priority-${priority.id}`}
                  checked={selectedPriorities.includes(priority.id)}
                  onChange={() => {
                    resetPreview();
                    setSelectedPriorities((prev) => {
                      if (prev.includes(priority.id)) {
                        return prev.filter((item) => item !== priority.id);
                      } else {
                        return [...prev, priority.id];
                      }
                    });
                  }}
                />
              ))}
            </div>
          </fieldset>
          <fieldset className="statistics-report__group">
            <legend>
              <FormattedMessage id="select.timeFrame" />
            </legend>
            <p className="statistics-report__group-description">
              <FormattedMessage id="select.timeFrame.Note" />
            </p>
            <div className="statistics-report__options statistics-report__options--time-frames">
              <Checkbox
                labelText={intl.formatMessage({ id: "all.label" })}
                id="select-all-time-frames"
                checked={selectedTimeFrames.length === timeFrames.length}
                onChange={(event) =>
                  handleSelectAllTimeFrames(event.target.checked)
                }
              />
              {timeFrames.map((frame) => (
                <Checkbox
                  key={frame.id}
                  id={frame.id}
                  labelText={intl.formatMessage({
                    id: frame.labelId,
                  })}
                  checked={selectedTimeFrames.includes(frame.id)}
                  onChange={() => {
                    resetPreview();
                    setSelectedTimeFrames((prev) => {
                      if (prev.includes(frame.id)) {
                        return prev.filter((item) => item !== frame.id);
                      } else {
                        return [...prev, frame.id];
                      }
                    });
                  }}
                />
              ))}
            </div>
          </fieldset>
        </div>
        <div className="statistics-report__actions">
          <div className="statistics-report__year">
            <h2>
              <FormattedMessage id="select.year.report" />
            </h2>
            <Dropdown
              id="year-picker"
              titleText={intl.formatMessage({
                id: "reports.statistics.year.label",
              })}
              label={intl.formatMessage({
                id: "reports.statistics.year.placeholder",
              })}
              selectedItem={selectedYear}
              onChange={({ selectedItem }) => handleYearChange(selectedItem)}
              items={years.map((year) => ({
                value: year.value,
                label: year.label,
              }))}
              itemToString={(item) => item?.label || ""}
              invalid={yearError}
              invalidText={intl.formatMessage(
                { id: "reports.statistics.year.invalid" },
                {
                  minimumYear: MINIMUM_REPORT_YEAR,
                  maximumYear: currentYear,
                },
              )}
            />
          </div>
          <div className="statistics-report__action-buttons">
            <Button
              data-cy="statisticsPreview"
              type="submit"
              disabled={
                optionsLoading ||
                optionsLoadError ||
                optionsEmpty ||
                previewState === "loading"
              }
            >
              <FormattedMessage id="reports.statistics.preview.action" />
            </Button>
            <Button
              data-cy="printableVersion"
              type="button"
              kind="secondary"
              disabled={previewState !== "ready"}
              onClick={handlePrint}
            >
              <FormattedMessage id="label.button.generatePrintableVersion" />
            </Button>
          </div>
        </div>
      </Form>
      <section
        className="statistics-report__results"
        aria-labelledby="statistics-report-results-title"
      >
        <div className="statistics-report__results-heading">
          <div>
            <h2 id="statistics-report-results-title">
              <FormattedMessage id="reports.statistics.preview.title" />
            </h2>
            <p>
              <FormattedMessage id="reports.statistics.preview.description" />
            </p>
          </div>
          {previewState === "ready" && (
            <div className="statistics-report__totals" role="status">
              <span>
                <FormattedMessage
                  id="reports.statistics.preview.totalTests"
                  values={{ total: preview.totals.tests }}
                />
              </span>
              <span>
                <FormattedMessage
                  id="reports.statistics.preview.totalSamples"
                  values={{ total: preview.totals.samples }}
                />
              </span>
            </div>
          )}
        </div>
        {previewState === "idle" && (
          <div className="statistics-report__empty">
            <FormattedMessage id="reports.statistics.preview.idle" />
          </div>
        )}
        {previewState === "loading" && (
          <InlineLoading
            description={intl.formatMessage({
              id: "reports.statistics.preview.loading",
            })}
          />
        )}
        {previewState === "error" && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={intl.formatMessage({
              id: "reports.statistics.preview.error.title",
            })}
            subtitle={intl.formatMessage({
              id: "reports.statistics.preview.error.description",
            })}
          />
        )}
        {previewState === "ready" && preview.rows.length === 0 && (
          <div className="statistics-report__empty">
            <FormattedMessage id="reports.statistics.preview.empty" />
          </div>
        )}
        {previewState === "ready" && preview.rows.length > 0 && (
          <div className="statistics-report__table-wrap">
            <p className="statistics-report__table-legend">
              <FormattedMessage id="reports.statistics.preview.legend" />
            </p>
            <table>
              <thead>
                <tr>
                  <th scope="col">
                    <FormattedMessage id="reports.statistics.preview.test" />
                  </th>
                  {monthColumns.map(({ month }) => (
                    <th scope="col" key={month}>
                      <FormattedMessage
                        id="reports.statistics.preview.month"
                        values={{ month }}
                      />
                    </th>
                  ))}
                  <th scope="col">
                    <FormattedMessage id="reports.statistics.preview.annual" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.testName}>
                    <th scope="row">{row.testName}</th>
                    {monthColumns.map(({ month, testsKey, samplesKey }) => (
                      <td key={month}>
                        {row[testsKey]} / {row[samplesKey]}
                      </td>
                    ))}
                    <td>
                      <strong>
                        {row.totalTests} / {row.totalSamples}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default StatisticsReport;
