import React, { useEffect, useState } from "react";
import {
  Form,
  Checkbox,
  Grid,
  Column,
  Section,
  Button,
  Dropdown,
  Heading,
  InlineNotification,
} from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import { getFromOpenElisServer, Roles } from "../../utils/Utils";
import "../../Style.css";
import config from "../../../config.json";
import { openReportWindow } from "../common/reportLaunch";
import { formatTatPriority } from "../tat/tatUtils";

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

  const handleSubmit = (event) => {
    event?.preventDefault();
    const year = Number(selectedYear?.value);
    if (
      !Number.isInteger(year) ||
      year < MINIMUM_REPORT_YEAR ||
      year > currentYear
    ) {
      setYearError(true);
      setLaunchError(false);
      return;
    }

    const url = buildStatisticsReportUrl({
      serverBaseUrl: config.serverBaseUrl,
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
      year,
    });
    setYearError(false);
    setLaunchError(!openReportWindow(url));
  };

  const handleYearChange = (year) => {
    setSelectedYear(year ? { value: year.value, label: year.label } : null);
    setYearError(false);
    setLaunchError(false);
  };

  const handleSelectAllLabUnits = (isChecked) => {
    setSelectedLabUnits(isChecked ? labUnits.map((unit) => unit.id) : []);
  };

  const handleSelectAllPriorities = (isChecked) => {
    setSelectedPriorities(
      isChecked ? priorities.map((priority) => priority.id) : [],
    );
  };

  const handleSelectAllTimeFrames = (isChecked) => {
    setSelectedTimeFrames(isChecked ? timeFrames.map((frame) => frame.id) : []);
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
    <>
      <Grid fullWidth={true}>
        <Column lg={16} md={8} sm={4}>
          <Section>
            <Section>
              <Heading>
                <FormattedMessage id="openreports.stat.aggregate" />
              </Heading>
            </Section>
          </Section>
        </Column>
      </Grid>
      <Grid fullWidth={true}>
        <Column lg={16} md={8} sm={4}>
          <Form onSubmit={handleSubmit}>
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
            <InlineNotification
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
            <Grid fullWidth={true}>
              <Column lg={16} md={8} sm={4}>
                <Section>
                  <br />
                  <br />
                  <h5>
                    <FormattedMessage id="select.labUnits" />
                  </h5>
                </Section>
                <div>
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
              </Column>
            </Grid>
            <Grid fullWidth={true}>
              <Column lg={16} md={8} sm={4}>
                <Section>
                  <br />
                  <h5>
                    <FormattedMessage id="select.priority.tests" />
                  </h5>
                </Section>
                <div className="inlineDiv">
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
              </Column>
            </Grid>
            <Grid fullWidth={true}>
              <Column lg={16} md={8} sm={4}>
                <Section>
                  <br />
                  <h5>
                    <FormattedMessage id="select.timeFrame" />
                  </h5>
                  <br />
                  <p>
                    <FormattedMessage id="select.timeFrame.Note" />
                  </p>
                </Section>
                <div>
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
              </Column>
            </Grid>
            <Grid fullWidth={true}>
              <Column lg={16} md={8} sm={4}>
                <Section>
                  <br />
                  <h5>
                    <FormattedMessage id="select.year.report" />
                  </h5>
                </Section>
              </Column>
              <Column lg={2} md={2} sm={2}>
                <Dropdown
                  id="year-picker"
                  titleText={intl.formatMessage({
                    id: "reports.statistics.year.label",
                  })}
                  label={intl.formatMessage({
                    id: "reports.statistics.year.placeholder",
                  })}
                  selectedItem={selectedYear}
                  onChange={({ selectedItem }) =>
                    handleYearChange(selectedItem)
                  }
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
              </Column>{" "}
            </Grid>
            <br />
            <Section>
              <br />
              <Button
                data-cy="printableVersion"
                type="submit"
                disabled={optionsLoading || optionsLoadError || optionsEmpty}
              >
                <FormattedMessage id="label.button.generatePrintableVersion" />
              </Button>
            </Section>
          </Form>
        </Column>
      </Grid>
    </>
  );
};

export default StatisticsReport;
