import React, { useContext, useState, useEffect, useRef } from "react";
import { useHistory } from "react-router-dom";
import { ConfigurationContext, NotificationContext } from "../layout/Layout";
import {
  Button,
  Grid,
  Column,
  Section,
  Loading,
  Heading,
  TextInput,
  Tag,
  Link,
  Accordion,
  AccordionItem,
} from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import { AlertDialog, NotificationKinds } from "../common/CustomNotification";
import "../Style.css";
import PageBreadCrumb from "../common/PageBreadCrumb";
import {
  getFromOpenElisServer,
  postToOpenElisServerJsonResponse,
} from "../utils/Utils";
import CustomLabNumberInput from "../common/CustomLabNumberInput";
import PatientInfo from "../addOrder/PatientInfo";
import { createOrderEntryValidationSchema } from "../formModel/validationSchema/OrderEntryValidationSchema";
import LabelsSection from "../barcodeWorkflow/LabelsSection";
import PostSavePrintDialog from "../barcodeWorkflow/PostSavePrintDialog";
import { parseDateForLocale } from "../common/dateLocaleUtils";

const normalizeQuantity = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const upsertSampleAttribute = (sampleTag, attributeName, value) => {
  const attributePattern = new RegExp(`${attributeName}='[^']*'`);
  if (attributePattern.test(sampleTag)) {
    return sampleTag.replace(attributePattern, `${attributeName}='${value}'`);
  }
  return sampleTag.replace("<sample ", `<sample ${attributeName}='${value}' `);
};

const updateSampleXmlLabelQuantities = (
  sampleXml,
  numOrderLabels,
  numSpecimenLabels,
) => {
  if (!sampleXml || !sampleXml.includes("<sample")) {
    return sampleXml;
  }

  return sampleXml.replace(/<sample\s+[^>]*\/>/, (sampleTag) => {
    let nextTag = upsertSampleAttribute(
      sampleTag,
      "numOrderLabels",
      numOrderLabels,
    );
    nextTag = upsertSampleAttribute(
      nextTag,
      "numSpecimenLabels",
      numSpecimenLabels,
    );
    return nextTag;
  });
};

const extractSampleXmlLabelQuantity = (sampleXml, attributeName) => {
  if (!sampleXml) {
    return 1;
  }
  const match = sampleXml.match(new RegExp(`${attributeName}='([^']+)'`));
  return normalizeQuantity(match?.[1]);
};

const SampleBatchEntry = (props) => {
  const { orderFormValues, setOrderFormValues } = props;
  // const [notificationVisible, setNotificationVisible] = useState(false);
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);
  const { configurationProperties } = useContext(ConfigurationContext);
  const intl = useIntl();
  const componentMounted = useRef(false);
  const history = useHistory();
  const [siteNames, setSiteNames] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showSampleComponent, setShowSampleComponent] = useState(false);
  const [generatedLabNos, setGeneratedLabNos] = useState([]);
  const [saveResponse, setSaveResponse] = useState(null);
  const [errors, setErrors] = useState([]);
  const [generateSaveButtonDisabled, setGenerateSaveButtonDisabled] =
    useState(false);
  const [buttonDisabled, setButtonDisabled] = useState(true);
  const generatingAccession = useRef(false);
  const savingOrder = useRef(false);
  const currentOrder = useRef(orderFormValues);
  const generationSnapshot = useRef(null);
  currentOrder.current = orderFormValues;

  let breadcrumbs = [{ label: "home.label", link: "/" }];

  useEffect(() => {
    componentMounted.current = true;
    getFromOpenElisServer("/rest/SamplePatientEntry", getSampleEntryPreform);
    window.scrollTo(0, 0);
    return () => {
      componentMounted.current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    createOrderEntryValidationSchema(configurationProperties)
      .validate(orderFormValues, { abortEarly: false })
      .then(() => {
        if (current) setErrors([]);
      })
      .catch((error) => {
        if (!current) return;
        if (error.name === "ValidationError") {
          setErrors(error);
        } else {
          console.error("Batch order validation failed:", error);
        }
      });
    return () => {
      current = false;
    };
  }, [configurationProperties, orderFormValues]);

  useEffect(() => {
    getFromOpenElisServer(
      "/rest/departments-for-site?refferingSiteId=" +
        (orderFormValues.sampleOrderItems.referringSiteId || ""),
      loadDepartments,
    );
  }, [orderFormValues.referringSiteId]);

  const getSampleEntryPreform = (response) => {
    if (componentMounted.current) {
      setSiteNames(response.sampleOrderItems.referringSiteList);
    }
  };

  const loadDepartments = (data) => {
    setDepartments(data);
  };

  function handleLabNo(e, rawVal) {
    setOrderFormValues({
      ...orderFormValues,
      sampleOrderItems: {
        ...orderFormValues.sampleOrderItems,
        labNo: rawVal ? rawVal : e?.target?.value,
      },
    });
    // setNotificationVisible(false);
  }

  const showAlertMessage = (msg, kind) => {
    setNotificationVisible(true);
    addNotification({
      kind: kind,
      title: intl.formatMessage({ id: "notification.title" }),
      message: msg,
    });
  };

  const handleKeyPress = (event) => {
    if (event.key === "Enter") {
      handleLabNoGeneration(event);
    }
  };
  function fetchGeneratedAccessionNo(res) {
    generatingAccession.current = false;
    if (!componentMounted.current) return;
    if (!res?.status || typeof res.body !== "string" || !res.body) {
      setGenerateSaveButtonDisabled(false);
      showAlertMessage(
        <FormattedMessage id="error.save.order" />,
        NotificationKinds.error,
      );
      return;
    }
    if (JSON.stringify(currentOrder.current) !== generationSnapshot.current) {
      setGenerateSaveButtonDisabled(false);
      showAlertMessage(
        <FormattedMessage id="error.save.order" />,
        NotificationKinds.error,
      );
      return;
    }
    const generatedOrder = {
      ...orderFormValues,
      sampleOrderItems: {
        ...orderFormValues.sampleOrderItems,
        labNo: res.body,
      },
    };
    setOrderFormValues(generatedOrder);
    setNotificationVisible(false);
    if (generatedOrder.method === "On Demand") {
      // Generation is the save trigger. Typing or changing state is never one.
      post(generatedOrder);
    } else {
      setGenerateSaveButtonDisabled(false);
    }
  }

  function post(formValues = orderFormValues) {
    if (savingOrder.current || !formValues.sampleOrderItems.labNo) return;
    savingOrder.current = true;
    setGenerateSaveButtonDisabled(true);
    setSaveResponse(null);
    const { years, months, days, ...patientProperties } =
      formValues.patientProperties;
    const normalizedOrderLabels = extractSampleXmlLabelQuantity(
      formValues.sampleXML,
      "numOrderLabels",
    );
    const normalizedSpecimenLabels = extractSampleXmlLabelQuantity(
      formValues.sampleXML,
      "numSpecimenLabels",
    );
    const payload = {
      ...formValues,
      patientProperties,
      currentDate: formValues.currentDate || "",
      sampleXML: updateSampleXmlLabelQuantities(
        formValues.sampleXML,
        normalizedOrderLabels,
        normalizedSpecimenLabels,
      ),
    };
    postToOpenElisServerJsonResponse(
      "/rest/SamplePatientEntryBatch",
      JSON.stringify(payload),
      (response) => {
        if (!componentMounted.current) return;
        verifySavedOrder(response, payload);
      },
    );
  }

  const handleLabNoGeneration = (e) => {
    if (e) e.preventDefault();
    if (
      generatingAccession.current ||
      savingOrder.current ||
      generateSaveButtonDisabled
    )
      return;
    generatingAccession.current = true;
    generationSnapshot.current = JSON.stringify(orderFormValues);
    setGenerateSaveButtonDisabled(true);
    getFromOpenElisServer(
      "/rest/SampleEntryGenerateScanProvider",
      fetchGeneratedAccessionNo,
    );
  };

  const savedOrderMatches = (saved, payload) => {
    if (
      !saved ||
      saved.queryVersion !== "2" ||
      saved.labNumber !== payload.sampleOrderItems.labNo ||
      !/^[1-9]\d*$/.test(String(saved.orderId || "")) ||
      !/^[1-9]\d*$/.test(String(saved.patient?.patientId || ""))
    )
      return false;
    const patient = payload.patientProperties;
    if (
      ["firstName", "lastName", "nationalId", "gender"].some(
        (field) =>
          String(saved.patient[field] ?? "") !== String(patient[field] ?? ""),
      )
    )
      return false;
    if (
      patient.patientPK &&
      String(patient.patientPK) !== saved.patient.patientId
    )
      return false;
    const dateLocale = configurationProperties.DEFAULT_DATE_LOCALE || "en-US";
    const sameDate = (left, right) => {
      const parse = (value) =>
        /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(value))
          ? parseDateForLocale(String(value).replaceAll("-", "/"), "zh-CN")
          : parseDateForLocale(value, dateLocale);
      const leftDate = parse(left);
      const rightDate = parse(right);
      return (
        leftDate &&
        rightDate &&
        ["year", "month", "day"].every(
          (field) => leftDate[field] === rightDate[field],
        )
      );
    };
    // Date of birth is optional in the current batch setup. An omitted value
    // must remain omitted in the persisted patient; any supplied date still
    // requires the same parsed calendar date.
    const savedBirthDate = String(saved.patient.birthDate ?? "");
    const sentBirthDate = String(patient.birthDateForDisplay ?? "");
    if (
      (savedBirthDate || sentBirthDate) &&
      !sameDate(savedBirthDate, sentBirthDate)
    )
      return false;
    if (
      ["referringSiteId", "referringSiteDepartmentId"].some(
        (field) =>
          String(saved.sampleOrderItems?.[field] || "") !==
          String(payload.sampleOrderItems[field] || ""),
      )
    )
      return false;
    if (
      !sameDate(
        saved.sampleOrderItems?.receivedDateForDisplay,
        payload.sampleOrderItems.receivedDateForDisplay,
      )
    )
      return false;
    const xml = new DOMParser().parseFromString(
      payload.sampleXML,
      "application/xml",
    );
    if (xml.querySelector("parsererror")) return false;
    const sentSamples = [...xml.querySelectorAll("samples > sample")];
    if (
      !sentSamples.length ||
      !Array.isArray(saved.samples) ||
      saved.samples.length !== sentSamples.length
    )
      return false;
    const csv = (value) =>
      String(value || "")
        .split(",")
        .filter(Boolean);
    return sentSamples.every((sent, index) => {
      const actual = saved.samples[index];
      if (
        actual.sampleTypeId !== sent.getAttribute("sampleID") ||
        !Array.isArray(actual.analyses) ||
        !sameDate(actual.collectionDate, sent.getAttribute("date"))
      )
        return false;
      const tests = new Set(actual.analyses.map((analysis) => analysis.testId));
      const expectedTests = new Set(csv(sent.getAttribute("tests")));
      const panels = new Set(
        actual.analyses.map((analysis) => analysis.panelId).filter(Boolean),
      );
      return (
        tests.size === expectedTests.size &&
        [...expectedTests].every((id) => tests.has(id)) &&
        csv(sent.getAttribute("panels")).every((id) => panels.has(id))
      );
    });
  };

  const verifySavedOrder = (res, payload) => {
    const responseStatus =
      typeof res?.statusCode === "number"
        ? res.statusCode
        : typeof res?.status === "number"
          ? res.status
          : 200;
    if (
      !res ||
      res.error ||
      res.status === false ||
      responseStatus < 200 ||
      responseStatus >= 400
    ) {
      savingOrder.current = false;
      setGenerateSaveButtonDisabled(false);
      showAlertMessage(
        <FormattedMessage id="error.save.order" />,
        NotificationKinds.error,
      );
      return;
    }
    // The legacy POST can return HTTP200 with an unsaved form. Only a fresh
    // query of this exact clinical object establishes that it was saved.
    getFromOpenElisServer(
      "/rest/order/saved?queryVersion=2&labNumber=" +
        encodeURIComponent(payload.sampleOrderItems.labNo),
      (saved) => {
        savingOrder.current = false;
        if (!componentMounted.current) return;
        if (!savedOrderMatches(saved, payload)) {
          // The commit outcome is uncertain; keep this label locked for review.
          // Do not issue another clinical POST or advertise a saved barcode.
          showAlertMessage(
            <FormattedMessage id="error.save.order" />,
            NotificationKinds.error,
          );
          return;
        }
        showAlertMessage(
          <FormattedMessage id="save.order.success.msg" />,
          NotificationKinds.success,
        );
        setGeneratedLabNos((previous) => [...previous, saved.labNumber]);
        setSaveResponse(res);
        setButtonDisabled(false);
      },
    );
  };

  const handleLabelsSectionChange = (labelsModel) => {
    const numOrderLabels =
      labelsModel?.orderRow?.quantities?.order != null
        ? normalizeQuantity(labelsModel.orderRow.quantities.order)
        : 1;
    const numSpecimenLabels =
      labelsModel?.sampleRows?.[0]?.quantities?.specimen != null
        ? normalizeQuantity(labelsModel.sampleRows[0].quantities.specimen)
        : 1;

    setOrderFormValues((current) => ({
      ...current,
      sampleXML: updateSampleXmlLabelQuantities(
        current.sampleXML,
        numOrderLabels,
        numSpecimenLabels,
      ),
    }));
  };

  const buildFallbackPrintableLabels = (accessionNumber) => {
    const orderLabels = extractSampleXmlLabelQuantity(
      orderFormValues.sampleXML,
      "numOrderLabels",
    );
    const specimenLabels = extractSampleXmlLabelQuantity(
      orderFormValues.sampleXML,
      "numSpecimenLabels",
    );
    const encodedAccession = encodeURIComponent(accessionNumber || "");
    return [
      {
        labelType: "order",
        quantity: orderLabels,
        printUrl: `/LabelMakerServlet?labNo=${encodedAccession}&type=order&quantity=${orderLabels}`,
      },
      {
        labelType: "specimen",
        quantity: specimenLabels,
        printUrl: `/LabelMakerServlet?labNo=${encodedAccession}&type=specimen&quantity=${specimenLabels}`,
      },
    ];
  };

  const elementError = (path) => {
    if (errors?.errors?.length > 0) {
      let error = errors.inner?.find((e) => e.path === path);
      if (error) {
        return error.message;
      } else {
        return null;
      }
    }
  };

  return (
    <>
      {notificationVisible && <AlertDialog />}
      {loading && (
        <Loading
          description={intl.formatMessage({ id: "loading.description" })}
        />
      )}
      <PageBreadCrumb breadcrumbs={breadcrumbs} />
      {!showSampleComponent && (
        <>
          <Grid fullWidth={true}>
            <Column lg={16} md={8} sm={4}>
              <Section>
                <Heading>
                  <FormattedMessage
                    id="order.entry.setup.batch"
                    defaultMessage="Batch Order Entry"
                  />
                </Heading>
              </Section>
            </Column>
          </Grid>
          <Grid fullWidth={true}>
            <Column lg={16} md={8} sm={4}>
              <div className="orderLegendBody">
                <Grid fullWidth={true}>
                  <Column lg={16}>
                    <h3>
                      <FormattedMessage id="order.legend.commonFields" />
                    </h3>
                  </Column>

                  <Column lg={4}>
                    <TextInput
                      labelText={<FormattedMessage id="sample.currentDate" />}
                      value={orderFormValues.currentDate}
                      readOnly
                      id="current-date"
                    />
                  </Column>
                  <Column lg={4}>
                    <TextInput
                      labelText={<FormattedMessage id="order.current.time" />}
                      value={orderFormValues.currentTime}
                      readOnly
                      id="current-time"
                    />
                  </Column>

                  <Column lg={4}>
                    <TextInput
                      labelText={<FormattedMessage id="sample.receivedDate" />}
                      value={
                        orderFormValues.sampleOrderItems.receivedDateForDisplay
                      }
                      readOnly
                      id="recieved-date"
                    />
                  </Column>
                  <Column lg={4}>
                    <TextInput
                      labelText={<FormattedMessage id="order.received.time" />}
                      value={orderFormValues.sampleOrderItems.receivedTime}
                      readOnly
                      id="recieved-time"
                    />
                  </Column>
                  <Column lg={16}>
                    <br></br>
                  </Column>
                  {orderFormValues.sampleTypeSelect && (
                    <>
                      <Column lg={4}>
                        {" "}
                        <FormattedMessage id="sample.type" />
                      </Column>
                      <Column lg={8}>
                        <Tag key="1" type="cyan" size="lg">
                          {orderFormValues.sampleTypeSelect}
                        </Tag>
                      </Column>
                      <Column lg={4}></Column>
                    </>
                  )}
                  <Column lg={4}>
                    <FormattedMessage id="eorder.test.name" />
                  </Column>
                  <Column lg={12}>
                    {orderFormValues.tests.map((test) => (
                      <Tag key={test.id} type="cyan">
                        {test.value}
                      </Tag>
                    ))}
                  </Column>
                  <Column lg={4}>
                    <FormattedMessage id="order.legend.facility" />
                  </Column>
                  <Column lg={8}>
                    <Tag type="cyan" size="lg">
                      {orderFormValues.sampleOrderItems.referringSiteName}
                    </Tag>
                  </Column>
                  <Column lg={4}></Column>
                  <Column lg={4}>
                    <FormattedMessage id="order.department.label" />
                  </Column>
                  <Column lg={8}>
                    <Tag type="cyan" size="lg">
                      {
                        orderFormValues.sampleOrderItems
                          .referringSiteDepartmentName
                      }
                    </Tag>
                  </Column>
                </Grid>
              </div>
              {orderFormValues.PatientInfoCheck && (
                <fieldset
                  disabled={generateSaveButtonDisabled}
                  style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
                >
                  <PatientInfo
                    orderFormValues={orderFormValues}
                    setOrderFormValues={setOrderFormValues}
                    error={elementError}
                  />
                </fieldset>
              )}
              {orderFormValues.method === "On Demand" && (
                <div className="orderLegendBody">
                  <Column lg={16}>
                    <h3>
                      <FormattedMessage id="order.generate.barcode" />
                    </h3>
                  </Column>
                  <Column lg={16}>
                    {" "}
                    <br />
                  </Column>

                  <Column lg={8}>
                    <CustomLabNumberInput
                      name="labNo"
                      placeholder={intl.formatMessage({
                        id: "input.placeholder.labNo",
                      })}
                      value={orderFormValues.sampleOrderItems.labNo}
                      onChange={handleLabNo}
                      onKeyPress={handleKeyPress}
                      labelText={
                        <>
                          <FormattedMessage id="sample.label.labnumber" />{" "}
                          <span className="requiredlabel">*</span>
                        </>
                      }
                      id="labNo"
                      invalid={Boolean(elementError("sampleOrderItems.labNo"))}
                      invalidText={elementError("sampleOrderItems.labNo")}
                      disabled={generateSaveButtonDisabled}
                    />
                    <Link
                      href="#"
                      onClick={handleLabNoGeneration}
                      disabled={generateSaveButtonDisabled}
                      data-testid="generate-barcode-link-BatchOrderEntry"
                    >
                      <p>
                        <FormattedMessage id="order.generate.barcode" />
                      </p>
                    </Link>
                  </Column>
                  <Column lg={8}></Column>
                  <Column lg={16}>
                    {" "}
                    <br />
                  </Column>

                  <Column lg={16}>
                    <Accordion>
                      <AccordionItem
                        title={intl.formatMessage({
                          id: "order.generate.barcode.history",
                        })}
                      >
                        {generatedLabNos.map((labNo, index) => (
                          <h6 key={index}> {labNo}</h6>
                        ))}
                      </AccordionItem>
                    </Accordion>
                  </Column>
                  <Column lg={16}>
                    <br />
                  </Column>
                  <Column lg={16}>
                    <Button
                      onClick={() => {
                        setButtonDisabled(true);
                        setGenerateSaveButtonDisabled(false);
                        setSaveResponse(null);
                        setOrderFormValues({
                          ...orderFormValues,
                          sampleOrderItems: {
                            ...orderFormValues.sampleOrderItems,
                            labNo: "",
                          },
                        });
                      }}
                      data-testid="next-button-BatchOrderEntry"
                      disabled={buttonDisabled}
                    >
                      <FormattedMessage id="nextLabel.action.button" />
                    </Button>
                  </Column>
                </div>
              )}
              {orderFormValues.method === "Pre-Printed" && (
                <div className="orderLegendBody">
                  <Column lg={16}>
                    <h3>
                      <FormattedMessage id="accession.entry" />
                    </h3>
                  </Column>
                  <Column lg={16}>
                    <CustomLabNumberInput
                      name="labNo"
                      placeholder={intl.formatMessage({
                        id: "input.placeholder.labNo",
                      })}
                      value={orderFormValues.sampleOrderItems.labNo}
                      onChange={handleLabNo}
                      onKeyPress={handleKeyPress}
                      labelText={
                        <>
                          <FormattedMessage id="sample.label.labnumber" />{" "}
                          <span className="requiredlabel">*</span>
                        </>
                      }
                      id="labNo"
                      invalid={Boolean(elementError("sampleOrderItems.labNo"))}
                      invalidText={elementError("sampleOrderItems.labNo")}
                      disabled={generateSaveButtonDisabled}
                    />
                    <FormattedMessage id="label.order.scan.text" />{" "}
                    <Link href="#" onClick={(e) => handleLabNoGeneration(e)}>
                      <FormattedMessage id="sample.label.labnumber.generate" />
                    </Link>
                  </Column>

                  <br />
                  <Column lg={16}>
                    <Accordion>
                      <AccordionItem
                        title={intl.formatMessage({
                          id: "order.generate.barcode.history",
                        })}
                      >
                        {generatedLabNos.map((labNo, index) => (
                          <h6 key={index}> {labNo}</h6>
                        ))}
                      </AccordionItem>
                    </Accordion>
                  </Column>
                  <Column lg={16}>
                    <br />
                  </Column>
                  <Column lg={16}>
                    <Button
                      onClick={() => post()}
                      disabled={
                        generateSaveButtonDisabled ||
                        !orderFormValues.sampleOrderItems.labNo
                      }
                      data-testid="generate-barcode-btn-BatchOrderEntry"
                    >
                      <FormattedMessage id="column.name.save" />
                    </Button>
                  </Column>
                </div>
              )}

              <div className="orderLegendBody">
                <Grid>
                  <Column lg={16} md={8} sm={4}>
                    <h4>
                      <FormattedMessage id="barcode.labels.section.title" />
                    </h4>
                  </Column>
                  <Column lg={16} md={8} sm={4}>
                    <LabelsSection
                      orderQuantity={extractSampleXmlLabelQuantity(
                        orderFormValues.sampleXML,
                        "numOrderLabels",
                      )}
                      specimenQuantities={[
                        extractSampleXmlLabelQuantity(
                          orderFormValues.sampleXML,
                          "numSpecimenLabels",
                        ),
                      ]}
                      onChange={handleLabelsSectionChange}
                      orderLabelText={intl.formatMessage({
                        id: "barcode.labels.order.row",
                      })}
                      specimenLabelFormatter={(sampleNumber) =>
                        intl.formatMessage(
                          { id: "barcode.labels.sample.row" },
                          { sampleNumber },
                        )
                      }
                      runningTotalLabel={intl.formatMessage({
                        id: "barcode.labels.running.total",
                      })}
                    />
                  </Column>
                </Grid>
              </div>

              {saveResponse && (
                <div className="orderLegendBody">
                  <Grid>
                    <Column lg={16} md={8} sm={4}>
                      <h4>
                        <FormattedMessage id="barcode.print.dialog.title" />
                      </h4>
                    </Column>
                    <Column lg={16} md={8} sm={4}>
                      <PostSavePrintDialog
                        accessionNumber={
                          saveResponse?.postSavePrintDialog?.accessionNumber ||
                          orderFormValues.sampleOrderItems.labNo
                        }
                        printableLabelTypes={
                          saveResponse?.postSavePrintDialog
                            ?.printableLabelTypes &&
                          saveResponse.postSavePrintDialog.printableLabelTypes
                            .length > 0
                            ? saveResponse.postSavePrintDialog
                                .printableLabelTypes
                            : buildFallbackPrintableLabels(
                                orderFormValues.sampleOrderItems.labNo,
                              )
                        }
                      />
                    </Column>
                  </Grid>
                </div>
              )}
              <Grid>
                <Button
                  data-cy="finishButton"
                  onClick={() => history.push("/SampleBatchEntrySetup")}
                >
                  <FormattedMessage id="label.button.finish" />
                </Button>
              </Grid>
            </Column>
          </Grid>
        </>
      )}
    </>
  );
};

export default SampleBatchEntry;
