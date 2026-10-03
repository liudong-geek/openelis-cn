import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionItem,
  Button,
  InlineLoading,
  InlineNotification,
  Modal,
  ProgressIndicator,
  ProgressStep,
} from "@carbon/react";
import { ArrowLeft } from "@carbon/icons-react";
import { FormattedMessage, useIntl } from "react-intl";
import { useHistory, useLocation } from "react-router-dom";
import EditSample from "./EditSample";
import AddOrder from "../addOrder/AddOrder";
import "../addOrder/add-order.scss";
import "./modify-order.scss";
import { NotificationContext } from "../layout/Layout";
import { AlertDialog, NotificationKinds } from "../common/CustomNotification";
import {
  postToOpenElisServerFullResponse,
  getFromOpenElisServer,
} from "../utils/Utils";
import EditOrderEntryAdditionalQuestions from "./EditOrderEntryAdditionalQuestions";
import PageBreadCrumb from "../common/PageBreadCrumb";
import { listReturnLocation } from "../common/listWorkspace";
import { createModifyOrderEntryValidationSchema } from "../formModel/validationSchema/ModifyOrderEntryValidationSchema";
import {
  buildSampleEditPayload,
  hasIncompleteAddedSamples,
} from "./sampleEditPayload";
import { modifyPatientName } from "./modifyOrderDisplay";

const breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "sidenav.label.order.active", link: "/order" },
  { label: "modify.order.title", link: "" },
];

const ModifyOrder = () => {
  const intl = useIntl();
  const history = useHistory();
  const location = useLocation();
  const [orderFormValues, setOrderFormValues] = useState(null);
  const [samples, setSamples] = useState([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [errors, setErrors] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [changed, setChanged] = useState({
    "sampleOrderItems.providerFirstName": false,
    "sampleOrderItems.providerLastName": false,
    "sampleOrderItems.labNo": false,
  });
  const baseline = useRef("");
  const saving = useRef(false);
  const requestScope = useRef(0);
  const mounted = useRef(true);
  const schema = useMemo(
    () => createModifyOrderEntryValidationSchema(intl),
    [intl],
  );
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    requestScope.current += 1;
    saving.current = false;
    setIsSubmitting(false);
    setErrors(null);
    const controller = new AbortController();
    setLoading(true);
    setLoadFailed(false);
    setOrderFormValues(null);
    setSamples([]);
    setPage(0);
    setSaved(false);
    setConfirmLeave(false);
    setSaveError("");
    const params = new URLSearchParams(location.search);
    const accessionNumber = params.get("accessionNumber") || "";
    const patientId = params.get("patientId") || "";
    const editMode =
      params.get("type") === "readonly" ? "readonly" : "readwrite";
    if (!accessionNumber && !patientId) {
      setLoadFailed(true);
      setLoading(false);
    } else {
      getFromOpenElisServer(
        `/rest/SampleEdit?patientId=${encodeURIComponent(patientId)}&accessionNumber=${encodeURIComponent(accessionNumber)}&type=${editMode}`,
        (data) => {
          if (!active) return;
          if (
            !data?.noSampleFound &&
            data?.sampleOrderItems?.labNo &&
            Array.isArray(data.existingTests) &&
            Array.isArray(data.possibleTests)
          ) {
            const loaded = {
              ...data,
              sampleOrderItems: { ...data.sampleOrderItems },
            };
            baseline.current = JSON.stringify(loaded);
            setOrderFormValues(loaded);
          } else {
            setLoadFailed(true);
          }
          setLoading(false);
        },
        controller.signal,
      );
    }
    return () => {
      active = false;
      controller.abort();
    };
  }, [location.search, reloadKey]);

  useEffect(() => {
    let active = true;
    if (orderFormValues) {
      schema
        .validate(orderFormValues, { abortEarly: false })
        .then(() => {
          if (active) setErrors(null);
        })
        .catch((error) => {
          if (active) setErrors(error);
        });
    }
    return () => {
      active = false;
    };
  }, [orderFormValues, schema]);

  const readOnly =
    new URLSearchParams(location.search).get("type") === "readonly" ||
    orderFormValues?.isEditable === false;
  const dirty =
    !saved &&
    !!orderFormValues &&
    (JSON.stringify(orderFormValues) !== baseline.current ||
      samples.length > 0);
  const returnToList = () =>
    history.push(listReturnLocation(location.state, "/order"));
  const requestLeave = () => {
    if (saving.current) return;
    if (dirty) setConfirmLeave(true);
    else returnToList();
  };
  const updateOrder = (value) => {
    if (!saving.current && !readOnly) setOrderFormValues(value);
  };
  const updateSamples = (value) => {
    if (!saving.current && !readOnly) setSamples(value);
  };
  const elementError = (path) =>
    errors?.inner?.find((error) => error.path === path)?.message || null;

  const submit = async (event) => {
    event.preventDefault();
    if (saving.current || !orderFormValues || saved || readOnly) return;
    setSaveError("");
    if (hasIncompleteAddedSamples(samples)) {
      setPage(0);
      setSaveError(
        intl.formatMessage({ id: "modify.order.incomplete.sample" }),
      );
      return;
    }
    // Lock synchronously, including the asynchronous validation interval.
    const scope = requestScope.current;
    saving.current = true;
    setIsSubmitting(true);
    try {
      await schema.validate(orderFormValues, { abortEarly: false });
    } catch (error) {
      if (!mounted.current || requestScope.current !== scope) return;
      setErrors(error);
      setSaveError(intl.formatMessage({ id: "modify.order.invalid" }));
      saving.current = false;
      setIsSubmitting(false);
      return;
    }
    if (!mounted.current || requestScope.current !== scope) return;
    let payload;
    try {
      payload = buildSampleEditPayload(orderFormValues, samples);
    } catch (_) {
      saving.current = false;
      setIsSubmitting(false);
      setSaveError(
        intl.formatMessage({ id: "modify.order.incomplete.sample" }),
      );
      return;
    }
    postToOpenElisServerFullResponse(
      "/rest/SampleEdit",
      JSON.stringify(payload),
      async (response) => {
        if (!mounted.current || requestScope.current !== scope) return;
        if (response?.ok) {
          setSaved(true);
          setNotificationVisible(true);
          addNotification({
            kind: NotificationKinds.success,
            title: intl.formatMessage({ id: "notification.title" }),
            message: intl.formatMessage({ id: "modify.order.saved" }),
          });
        } else {
          const key =
            response?.status === 403
              ? "modify.order.forbidden"
              : response?.status === 409
                ? "modify.order.conflict"
                : response?.status === 400 || response?.status === 422
                  ? "modify.order.invalid"
                  : "modify.order.save.failed";
          let serverMessage = "";
          if (
            (response?.status === 400 ||
              response?.status === 409 ||
              response?.status === 422) &&
            typeof response.json === "function"
          ) {
            try {
              const body = await response.json();
              // Legacy endpoints may return English diagnostics. Keep Chinese
              // business errors readable; other bodies use the localized fallback.
              if (
                typeof body?.message === "string" &&
                /[\u3400-\u9fff]/.test(body.message)
              )
                serverMessage = body.message.slice(0, 300);
            } catch (_) {
              /* The localized status message remains available. */
            }
          }
          if (!mounted.current || requestScope.current !== scope) return;
          setSaveError(serverMessage || intl.formatMessage({ id: key }));
        }
        saving.current = false;
        setIsSubmitting(false);
      },
    );
  };

  return (
    <div className="modify-order-workspace">
      <PageBreadCrumb breadcrumbs={breadcrumbs} />
      <header className="modify-order-heading">
        <div>
          <h1>
            <FormattedMessage id="modify.order.title" />
          </h1>
          <p>
            <FormattedMessage id="modify.order.helper" />
          </p>
        </div>
        <Button
          kind="tertiary"
          size="sm"
          renderIcon={ArrowLeft}
          disabled={isSubmitting}
          onClick={requestLeave}
        >
          <FormattedMessage id="button.back" />
        </Button>
      </header>
      {notificationVisible && <AlertDialog />}
      {loading && (
        <InlineLoading
          description={intl.formatMessage({ id: "modify.order.loading" })}
        />
      )}
      {loadFailed && (
        <div className="modify-order-load-error">
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={intl.formatMessage({ id: "modify.order.load.failed" })}
          />
          <Button
            kind="tertiary"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            <FormattedMessage id="modify.order.retry" />
          </Button>
        </div>
      )}
      {orderFormValues && !loading && !loadFailed && (
        <>
          <section
            className="modify-order-summary"
            aria-label={intl.formatMessage({ id: "modify.order.summary" })}
          >
            <div className="modify-order-patient">
              <strong>
                {modifyPatientName(orderFormValues.patientName, intl.locale) ||
                  intl.formatMessage({ id: "modify.order.unknown.patient" })}
              </strong>
              <span>
                {orderFormValues.gender === "M"
                  ? intl.formatMessage({ id: "patient.male" })
                  : orderFormValues.gender === "F"
                    ? intl.formatMessage({ id: "patient.female" })
                    : "—"}
              </span>
              <span>{orderFormValues.dob || "—"}</span>
            </div>
            <dl>
              <div>
                <dt>
                  <FormattedMessage id="sample.label.labnumber" />
                </dt>
                <dd>
                  {orderFormValues.accessionNumber ||
                    orderFormValues.sampleOrderItems.labNo}
                </dd>
              </div>
              <div>
                <dt>
                  <FormattedMessage id="patient.id" />
                </dt>
                <dd>
                  {orderFormValues.patientId ||
                    new URLSearchParams(location.search).get("patientId") ||
                    "—"}
                </dd>
              </div>
              <div>
                <dt>
                  <FormattedMessage
                    id="patient.natioanalid"
                    defaultMessage="Identity number"
                  />
                </dt>
                <dd>{orderFormValues.nationalId || "—"}</dd>
              </div>
            </dl>
          </section>
          {saved ? (
            <section className="modify-order-success">
              <h2>
                <FormattedMessage id="modify.order.saved" />
              </h2>
              <p>
                <FormattedMessage id="modify.order.saved.helper" />
              </p>
              <Button onClick={returnToList}>
                <FormattedMessage id="button.back" />
              </Button>
            </section>
          ) : (
            <>
              <ProgressIndicator
                currentIndex={page}
                spaceEqually
                className="modify-order-progress"
                onChange={(index) => {
                  if (!saving.current) setPage(index);
                }}
              >
                <ProgressStep
                  disabled={isSubmitting}
                  label={intl.formatMessage({ id: "modify.order.samples" })}
                />
                <ProgressStep
                  disabled={isSubmitting}
                  label={intl.formatMessage({ id: "modify.order.information" })}
                />
              </ProgressIndicator>
              {readOnly && (
                <InlineNotification
                  kind="info"
                  lowContrast
                  hideCloseButton
                  title={intl.formatMessage({ id: "modify.order.readonly" })}
                />
              )}
              {saveError && (
                <InlineNotification
                  kind="error"
                  lowContrast
                  hideCloseButton
                  title={saveError}
                />
              )}
              <fieldset
                className="modify-order-fields"
                disabled={isSubmitting || readOnly}
                {...(isSubmitting ? { inert: "" } : {})}
              >
                {page === 0 ? (
                  <EditSample
                    orderFormValues={orderFormValues}
                    setOrderFormValues={updateOrder}
                    setSamples={updateSamples}
                    samples={samples}
                    error={elementError}
                    disabled={isSubmitting || readOnly}
                  />
                ) : (
                  <>
                    <AddOrder
                      orderFormValues={orderFormValues}
                      setOrderFormValues={updateOrder}
                      samples={samples}
                      error={elementError}
                      isModifyOrder
                      changed={changed}
                      setChanged={setChanged}
                    />
                  </>
                )}
              </fieldset>
              {page === 1 && orderFormValues.sampleOrderItems.programId && (
                <Accordion className="modify-order-additional">
                  <AccordionItem
                    disabled={isSubmitting}
                    title={intl.formatMessage({
                      id: "modify.order.additional",
                    })}
                  >
                    <EditOrderEntryAdditionalQuestions
                      orderFormValues={orderFormValues}
                    />
                  </AccordionItem>
                </Accordion>
              )}
              <footer className="modify-order-actions">
                <Button
                  kind="secondary"
                  disabled={isSubmitting}
                  onClick={requestLeave}
                >
                  <FormattedMessage id="label.button.cancel" />
                </Button>
                {page === 1 && (
                  <Button
                    kind="tertiary"
                    disabled={isSubmitting}
                    onClick={() => setPage(0)}
                  >
                    <FormattedMessage id="modify.order.back.samples" />
                  </Button>
                )}
                {page === 0 ? (
                  <Button data-cy="next-button" onClick={() => setPage(1)}>
                    <FormattedMessage id="modify.order.next.information" />
                  </Button>
                ) : (
                  !readOnly && (
                    <Button
                      data-cy="submit-order"
                      disabled={isSubmitting}
                      onClick={submit}
                    >
                      {isSubmitting ? (
                        <FormattedMessage id="modify.order.saving" />
                      ) : (
                        <FormattedMessage id="modify.order.save" />
                      )}
                    </Button>
                  )
                )}
              </footer>
            </>
          )}
        </>
      )}
      {confirmLeave && (
        <Modal
          open
          className="oe-admin-modal"
          modalHeading={intl.formatMessage({ id: "workspace.leave.title" })}
          primaryButtonText={intl.formatMessage({
            id: "workspace.leave.confirm",
          })}
          secondaryButtonText={intl.formatMessage({
            id: "workspace.leave.cancel",
          })}
          closeButtonLabel={intl.formatMessage({ id: "label.button.close" })}
          onRequestClose={() => setConfirmLeave(false)}
          onRequestSubmit={returnToList}
        >
          <p>
            <FormattedMessage id="workspace.leave.helper" />
          </p>
        </Modal>
      )}
    </div>
  );
};
export default ModifyOrder;
