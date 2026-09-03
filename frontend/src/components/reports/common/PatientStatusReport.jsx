import React, { useContext, useState, useRef, useEffect } from "react";
import { FormattedMessage, injectIntl, useIntl } from "react-intl";
import "../../Style.css";
import { getFromOpenElisServer } from "../../utils/Utils";
import {
  Form,
  Checkbox,
  Dropdown,
  Heading,
  Grid,
  Column,
  Section,
  Button,
  Select,
  SelectItem,
  Accordion,
  AccordionItem,
  InlineNotification,
  RadioButton,
  RadioButtonGroup,
} from "@carbon/react";
import CustomLabNumberInput from "../../common/CustomLabNumberInput";
import config from "../../../config.json";
import CustomDatePicker from "../../common/CustomDatePicker";
import AutoComplete from "../../common/AutoComplete";
import { ConfigurationContext } from "../../layout/Layout";
import { Formik, Field } from "formik";
import PatientStatusReportFormValues from "../../formModel/innitialValues/PatientStatusReportFormValues";
import SearchPatientForm from "../../patient/SearchPatientForm";

import {
  buildReportUrl,
  isReportDateRangeValid,
  openReportWindow,
} from "./reportLaunch";

function PatientStatusReport(props) {
  const [reportFormValues, setReportFormValues] = useState(
    PatientStatusReportFormValues,
  );
  const { configurationProperties } = useContext(ConfigurationContext);

  const intl = useIntl();
  const itemList = [
    {
      id: "option-0",
      text: intl.formatMessage({ id: "reports.query.dateType.result" }),
      tag: "RESULT_DATE",
    },
    {
      id: "option-1",
      text: intl.formatMessage({ id: "reports.query.dateType.order" }),
      tag: "ORDER_DATE",
    },
  ];

  const componentMounted = useRef(false);
  const [checkbox, setCheckbox] = useState("on");
  const [result, setResult] = useState("false");
  const [items, setItems] = useState(itemList[0].tag);
  const [siteNames, setSiteNames] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [filterMode, setFilterMode] = useState("patient");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [reportError, setReportError] = useState("");

  const getSelectedPatient = (patient) => {
    setSelectedPatient(patient);
    setReportError("");
    setReportFormValues((current) => ({
      ...current,
      selectedPatientId: patient.patientPK,
    }));
  };

  const handleReportPrint = () => {
    const params = {
      report: props.report,
      type: "patient",
      onlyResults: result,
      _onlyResults: checkbox,
    };

    if (filterMode === "patient") {
      if (!reportFormValues.selectedPatientId) {
        setReportError("reports.query.validation.patient");
        return;
      }
      params.selPatient = reportFormValues.selectedPatientId;
    } else if (filterMode === "labNumber") {
      const from = String(reportFormValues.from || "").trim();
      const to = String(reportFormValues.to || "").trim();
      if (!from && !to) {
        setReportError("reports.query.validation.labNumber");
        return;
      }
      params.accessionDirect = from || to;
      params.highAccessionDirect = to || from;
    } else {
      const referringSiteId = String(
        reportFormValues.referringSiteId || "",
      ).trim();
      if (!/^\d+$/.test(referringSiteId)) {
        setReportError("reports.query.validation.site");
        return;
      }
      if (!reportFormValues.startDate || !reportFormValues.endDate) {
        setReportError("reports.error.dateRangeRequired");
        return;
      }
      if (
        !isReportDateRangeValid(
          reportFormValues.startDate,
          reportFormValues.endDate,
          configurationProperties?.DEFAULT_DATE_LOCALE || "fr-FR",
        )
      ) {
        setReportError("reports.error.invalidDateRange");
        return;
      }
      params.referringSiteId = referringSiteId;
      params.referringSiteDepartmentId =
        reportFormValues.referringSiteDepartmentId;
      params.dateType = items;
      params.lowerDateRange = reportFormValues.startDate;
      params.upperDateRange = reportFormValues.endDate;
    }

    const reportUrl = buildReportUrl(config.serverBaseUrl, params);
    setReportError(
      openReportWindow(reportUrl) ? "" : "reports.query.popupBlocked",
    );
  };

  function handleLabNoFrom(value) {
    setReportError("");
    setReportFormValues((current) => ({
      ...current,
      from: value,
    }));
  }

  function handleLabNoTo(value) {
    setReportError("");
    setReportFormValues((current) => ({
      ...current,
      to: value,
    }));
  }

  function handleSiteName(e) {
    setReportError("");
    setReportFormValues((current) => ({
      ...current,
      referringSiteId: "",
      referringSiteName: e.target.value,
      referringSiteDepartmentId: "",
    }));
  }

  function handleRequesterDept(e) {
    setReportError("");
    setReportFormValues((current) => ({
      ...current,
      referringSiteDepartmentId: e.target.value,
    }));
  }

  function handleAutoCompleteSiteName(siteId) {
    setReportError("");
    setReportFormValues((current) => ({
      ...current,
      referringSiteId: siteId,
      referringSiteName: "",
      referringSiteDepartmentId: "",
    }));
  }
  const loadDepartments = (data) => {
    setDepartments(Array.isArray(data) ? data : []);
  };

  const handleStartDatePickerChangeDate = (date) => {
    setReportError("");
    setReportFormValues((current) => ({
      ...current,
      startDate: date,
    }));
  };

  const handleEndDatePickerChangeDate = (date) => {
    setReportError("");
    setReportFormValues((current) => ({
      ...current,
      endDate: date,
    }));
  };

  const getSiteList = (response) => {
    if (componentMounted.current) {
      setSiteNames(Array.isArray(response) ? response : []);
    }
  };

  useEffect(() => {
    getFromOpenElisServer(
      "/rest/departments-for-site?refferingSiteId=" +
        (reportFormValues.referringSiteId || ""),
      loadDepartments,
    );
  }, [reportFormValues.referringSiteId]);

  useEffect(() => {
    componentMounted.current = true;
    getFromOpenElisServer(
      "/rest/displayList/SAMPLE_PATIENT_REFERRING_CLINIC",
      getSiteList,
    );
    window.scrollTo(0, 0);
    return () => {
      componentMounted.current = false;
    };
  }, []);

  return (
    <>
      <Grid fullWidth={true}>
        <Column lg={16} md={8} sm={4}>
          <Section>
            <Section>
              <Heading>
                <FormattedMessage id={props.id} />
              </Heading>
            </Section>
          </Section>
        </Column>
        <br></br>
      </Grid>
      <Grid fullWidth={true}>
        <Column lg={16} md={8} sm={4}>
          <RadioButtonGroup
            name="report-filter-mode"
            legendText={intl.formatMessage({
              id: "reports.query.method.legend",
            })}
            valueSelected={filterMode}
            orientation="horizontal"
            onChange={(value) => {
              setFilterMode(value);
              setReportError("");
            }}
          >
            <RadioButton
              id="report-filter-patient"
              value="patient"
              labelText={intl.formatMessage({
                id: "reports.query.method.patient",
              })}
            />
            <RadioButton
              id="report-filter-lab-number"
              value="labNumber"
              labelText={intl.formatMessage({
                id: "reports.query.method.labNumber",
              })}
            />
            <RadioButton
              id="report-filter-site-date"
              value="siteDate"
              labelText={intl.formatMessage({
                id: "reports.query.method.siteDate",
              })}
            />
          </RadioButtonGroup>
        </Column>
        {filterMode === "patient" && (
          <Column lg={16} md={8} sm={4}>
            <Section>
              <h5>
                <FormattedMessage id="report.enter.patient.headline" />
              </h5>
            </Section>
            <Accordion>
              <AccordionItem
                title={intl.formatMessage({ id: "report.labe.byPatient" })}
              >
                <FormattedMessage id="report.enter.patient.headline.description" />
                <SearchPatientForm getSelectedPatient={getSelectedPatient} />
                {selectedPatient && (
                  <InlineNotification
                    kind="success"
                    lowContrast
                    hideCloseButton
                    title={intl.formatMessage({
                      id: "reports.query.patient.selected",
                    })}
                    subtitle={`${selectedPatient.firstName || ""} ${
                      selectedPatient.lastName || ""
                    } (${selectedPatient.nationalId || selectedPatient.patientID || selectedPatient.patientPK})`}
                  />
                )}
              </AccordionItem>
            </Accordion>
          </Column>
        )}
        <Column lg={16} md={8} sm={4}>
          <Formik
            initialValues={reportFormValues}
            enableReinitialize={true}
            // validationSchema={}
            onSubmit={() => undefined}
            onChange
          >
            {({
              values,
              //errors,
              //touched,
              setFieldValue,
              handleChange,
              handleBlur,
              handleSubmit,
            }) => (
              <Form
                onSubmit={handleSubmit}
                onChange={handleChange}
                onBlur={handleBlur}
              >
                <Field name="guid">
                  {({ field }) => (
                    <input type="hidden" name={field.name} id={field.name} />
                  )}
                </Field>
                {filterMode === "labNumber" && (
                  <>
                    <Grid fullWidth={true}>
                      <Column lg={16} md={8} sm={4}>
                        <Section>
                          <br />
                          <h5>
                            <FormattedMessage id="report.enter.labNumber.headline" />
                          </h5>
                        </Section>
                      </Column>
                    </Grid>
                    <Accordion>
                      <AccordionItem
                        title={intl.formatMessage({
                          id: "report.labe.byLabNumber",
                        })}
                      >
                        <Grid>
                          <Column lg={16} md={8} sm={4}>
                            <FormattedMessage id="sample.search.scanner.instructions" />
                          </Column>
                          <Column lg={8} md={8} sm={4}>
                            <Field name="from">
                              {({ field }) => (
                                <CustomLabNumberInput
                                  name={field.name}
                                  value={values[field.name]}
                                  labelText={intl.formatMessage({
                                    id: "reports.query.labNumber.from",
                                  })}
                                  id={field.name}
                                  onChange={(event, rawValue) => {
                                    const value =
                                      rawValue ?? event?.target?.value ?? "";
                                    setFieldValue(field.name, value);
                                    handleLabNoFrom(value);
                                  }}
                                />
                              )}
                            </Field>
                          </Column>
                          <Column lg={8} md={8} sm={4}>
                            <Field name="to">
                              {({ field }) => (
                                <CustomLabNumberInput
                                  name={field.name}
                                  value={values[field.name]}
                                  labelText={intl.formatMessage({
                                    id: "reports.query.labNumber.to",
                                  })}
                                  id={field.name}
                                  onChange={(event, rawValue) => {
                                    const value =
                                      rawValue ?? event?.target?.value ?? "";
                                    setFieldValue(field.name, value);
                                    handleLabNoTo(value);
                                  }}
                                />
                              )}
                            </Field>
                          </Column>
                        </Grid>
                      </AccordionItem>
                    </Accordion>
                  </>
                )}

                {filterMode === "siteDate" && (
                  <>
                    <br />
                    <Grid fullWidth={true}>
                      <Column lg={16} md={8} sm={4}>
                        <h5>
                          <FormattedMessage id="report.enter.site.headline" />
                        </h5>
                      </Column>
                    </Grid>
                    <Accordion>
                      <AccordionItem
                        title={intl.formatMessage({ id: "report.labe.site" })}
                      >
                        <Grid>
                          <Column lg={8} md={8} sm={4}>
                            <AutoComplete
                              name="siteName"
                              id="siteName"
                              allowFreeText={
                                !(
                                  configurationProperties.restrictFreeTextRefSiteEntry ===
                                  "true"
                                )
                              }
                              value={
                                reportFormValues.referringSiteId != ""
                                  ? reportFormValues.referringSiteId
                                  : reportFormValues.referringSiteName
                              }
                              onChange={handleSiteName}
                              onSelect={handleAutoCompleteSiteName}
                              label={
                                <>
                                  <FormattedMessage id="order.site.name" />
                                </>
                              }
                              style={{ width: "!important 100%" }}
                              suggestions={
                                siteNames.length > 0 ? siteNames : []
                              }
                              noSuggestionsText={intl.formatMessage({
                                id: "reports.query.site.noSuggestions",
                              })}
                            />
                          </Column>
                          <Column lg={8} md={8} sm={4}>
                            <Select
                              id="requesterDepartmentId"
                              name="requesterDepartmentId"
                              labelText={intl.formatMessage({
                                id: "order.department.label",
                              })}
                              onChange={handleRequesterDept}
                            >
                              <SelectItem value="" text="" />
                              {departments.map((department, index) => (
                                <SelectItem
                                  key={index}
                                  text={department.value}
                                  value={department.id}
                                />
                              ))}
                            </Select>
                          </Column>
                        </Grid>
                        <Grid fullWidth={true}>
                          <Column lg={16} md={8} sm={4}>
                            <br />
                          </Column>
                          <Column lg={16} md={8} sm={4}>
                            <h6>
                              <FormattedMessage id="report.patient.site.description" />
                            </h6>
                          </Column>
                        </Grid>
                        <Grid fullWidth={true}>
                          <Column lg={4} md={8} sm={4}>
                            <Checkbox
                              onChange={() => {
                                if (checkbox === "on") {
                                  setResult("true");
                                  setCheckbox("off");
                                } else {
                                  setResult("false");
                                  setCheckbox("on");
                                }
                              }}
                              labelText={intl.formatMessage({
                                id: "report.label.site.onlyResults",
                              })}
                              id="checkbox-label-1"
                            />
                          </Column>
                          <Column lg={12} md={8} sm={4}></Column>
                          <Column lg={4} md={8} sm={4}>
                            <Dropdown
                              id="dateType"
                              data-cy="dateTypeDropdown"
                              name="dateType"
                              titleText={intl.formatMessage({
                                id: "report.label.site.dateType",
                              })}
                              initialSelectedItem={itemList.find(
                                (item) => item.tag === items,
                              )}
                              label={intl.formatMessage({
                                id: "report.label.site.dateType",
                              })}
                              items={itemList}
                              itemToString={(item) => (item ? item.text : "")}
                              onChange={({ selectedItem }) => {
                                setItems(selectedItem?.tag || itemList[0].tag);
                                setReportError("");
                              }}
                            />
                          </Column>
                          <Column lg={12} md={8} sm={4}></Column>
                          <Column lg={4} md={8} sm={4}>
                            <CustomDatePicker
                              id={"startDate"}
                              labelText={intl.formatMessage({
                                id: "eorder.date.start",
                              })}
                              autofillDate={true}
                              value={reportFormValues.startDate}
                              onChange={(date) =>
                                handleStartDatePickerChangeDate(date)
                              }
                            />
                          </Column>
                          <Column lg={4} md={8} sm={4}>
                            <CustomDatePicker
                              id={"endDate"}
                              labelText={intl.formatMessage({
                                id: "eorder.date.end",
                              })}
                              autofillDate={true}
                              value={reportFormValues.endDate}
                              onChange={(date) =>
                                handleEndDatePickerChangeDate(date)
                              }
                            />
                          </Column>
                          <Column lg={8} md={8} sm={4}>
                            {" "}
                          </Column>
                          <Column lg={16} md={8} sm={4}>
                            <br />
                            <br />
                          </Column>
                        </Grid>
                      </AccordionItem>
                    </Accordion>
                  </>
                )}
                {reportError && (
                  <InlineNotification
                    kind="error"
                    lowContrast
                    hideCloseButton
                    title={intl.formatMessage({
                      id: "reports.query.error.title",
                    })}
                    subtitle={intl.formatMessage({ id: reportError })}
                  />
                )}
                <Grid>
                  <Column lg={16} md={8} sm={4}>
                    <br />
                    <br />
                  </Column>
                  <Column lg={16} md={8} sm={4}>
                    <Button
                      data-cy="printableVersion"
                      type="button"
                      onClick={handleReportPrint}
                    >
                      <FormattedMessage id="label.button.generatePrintableVersion" />
                    </Button>
                  </Column>
                </Grid>
              </Form>
            )}
          </Formik>
        </Column>
      </Grid>
    </>
  );
}

export default injectIntl(PatientStatusReport);
