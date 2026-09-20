import React, { useContext, useState, useEffect, useMemo } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  Form,
  Checkbox,
  TextInput,
  Select,
  SelectItem,
  Button,
  Loading,
  Modal,
  InlineLoading,
  Tag,
} from "@carbon/react";
import { Save, Undo } from "@carbon/icons-react";
import LabNumberFormValues from "./LabNumberFormValues";
import type { LabNumberFormValues as LabNumberValues } from "./LabNumberFormValues";
import {
  getFromOpenElisServer,
  postToOpenElisServerFullResponse,
  convertAlphaNumLabNumForDisplay,
} from "../../utils/Utils";
import { NotificationContext } from "../../layout/Layout";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
import { FormattedMessage, useIntl } from "react-intl";
import { ConfigurationContext } from "../../layout/Layout";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import "./LabNumberManagement.css";

// eslint-disable-next-line prefer-const -- preserve the original JavaScript runtime declaration
const breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
  {
    label: "sidenav.label.admin.labNumber",
    link: "/MasterListsPage/labNumber",
  },
];

interface ConfigurationContextValue {
  configurationProperties: Record<string, unknown>;
  reloadConfiguration: () => void;
}

interface NotificationContextValue {
  notificationVisible: boolean;
  setNotificationVisible: (visible: boolean) => void;
  addNotification: (notification: {
    kind: string;
    title: string;
    message: string;
  }) => void;
}

function LabNumberManagement() {
  const intl = useIntl();
  const { configurationProperties, reloadConfiguration } = useContext(
    ConfigurationContext,
  ) as unknown as ConfigurationContextValue;
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext) as unknown as NotificationContextValue;

  const [currentLabNumForDisplay, setCurrentLabNumForDisplay] = useState(
    convertAlphaNumLabNumForDisplay("23000000"),
  );
  const [sampleLabNumForDisplay, setSampleLabNumForDisplay] = useState(
    convertAlphaNumLabNumForDisplay("23000000"),
  );
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [labNumberValues, setLabNumberValues] =
    useState<LabNumberValues>(LabNumberFormValues);
  const [savedValues, setSavedValues] =
    useState<LabNumberValues>(LabNumberFormValues);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isDirty = useMemo(
    () => JSON.stringify(labNumberValues) !== JSON.stringify(savedValues),
    [labNumberValues, savedValues],
  );

  useEffect(() => {
    loadValues();
  }, []);

  useEffect(() => {
    fetchCurrentLabNumberNoIncrement();
  }, [configurationProperties]);

  useEffect(() => {
    if (!(labNumberValues.labNumberType === "ALPHANUM")) {
      fetchLegacyLabNumNoIncrement();
    }
    generateSampleLabNum();
  }, [labNumberValues]);

  const handleFieldChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setLabNumberValues((current) => ({ ...current, [name]: value }));
  };

  async function displayStatus(res: Response | undefined) {
    setNotificationVisible(true);
    setIsSubmitting(false);
    if (res && res.status >= 200 && res.status < 300) {
      addNotification({
        kind: NotificationKinds.success,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "success.add.edited.msg" }),
      });
      const body = (await res.json()) as Partial<LabNumberValues>;
      const nextValues = { ...LabNumberFormValues, ...body };
      setLabNumberValues(nextValues);
      setSavedValues(nextValues);
    } else {
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "error.add.edited.msg" }),
      });
    }
    reloadConfiguration();
  }

  const loadValues = () => {
    getFromOpenElisServer(
      "/rest/labnumbermanagement",
      (body: Partial<LabNumberValues> | undefined) => {
        const nextValues = { ...LabNumberFormValues, ...body };
        setLabNumberValues(nextValues);
        setSavedValues(nextValues);
        setLoading(false);
      },
    );
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setConfirmOpen(true);
  };

  const submitValues = () => {
    setConfirmOpen(false);
    setIsSubmitting(true);
    postToOpenElisServerFullResponse(
      "/rest/labnumbermanagement",
      JSON.stringify(labNumberValues),
      displayStatus,
    );
  };

  const fetchCurrentLabNumberNoIncrement = () => {
    getFromOpenElisServer(
      "/rest/SampleEntryGenerateScanProvider?noIncrement=true",
      (res: { status?: boolean; body: string } | undefined) => {
        if (res?.status) {
          if (configurationProperties?.AccessionFormat != "ALPHANUM") {
            setCurrentLabNumForDisplay(res.body);
          } else {
            setCurrentLabNumForDisplay(
              convertAlphaNumLabNumForDisplay(res.body),
            );
          }
        }
      },
    );
  };

  const generateSampleLabNum = () => {
    // eslint-disable-next-line prefer-const -- preserve the original JavaScript declaration
    let dateDigits = new Date().getFullYear() % 100;
    let labNumber = "" + dateDigits;
    if (labNumberValues.usePrefix && labNumberValues.alphanumPrefix) {
      labNumber = labNumber + labNumberValues.alphanumPrefix;
    }
    labNumber = labNumber + "000000";
    setSampleLabNumForDisplay(convertAlphaNumLabNumForDisplay(labNumber));
  };

  const fetchLegacyLabNumNoIncrement = () => {
    getFromOpenElisServer(
      "/rest/SampleEntryGenerateScanProvider?noIncrement=true&format=SITEYEARNUM",
      (res: { status?: boolean; body: string } | undefined) => {
        if (res?.status) {
          setSampleLabNumForDisplay(res.body);
        }
      },
    );
  };

  return (
    <>
      {notificationVisible === true ? <AlertDialog /> : ""}
      {loading && <Loading />}
      <div className="adminPageContent lab-number-workspace">
        <PageBreadCrumb breadcrumbs={breadcrumbs} />
        <ProductPageHeader
          title={<FormattedMessage id="configure.labNumber.title" />}
          subtitle={<FormattedMessage id="labNumber.workspace.description" />}
          actions={
            <>
              <Button
                kind="secondary"
                renderIcon={Undo}
                disabled={!isDirty || isSubmitting}
                onClick={() => setLabNumberValues(savedValues)}
              >
                <FormattedMessage id="labNumber.discard" />
              </Button>
              <Button
                type="submit"
                form="lab-number-form"
                renderIcon={Save}
                disabled={!isDirty || isSubmitting}
                data-testid="submit-button"
              >
                {isSubmitting ? (
                  <InlineLoading
                    description={intl.formatMessage({
                      id: "config.workspace.saving",
                    })}
                  />
                ) : (
                  <FormattedMessage id="labNumber.save" />
                )}
              </Button>
            </>
          }
        />

        <Form id="lab-number-form" onSubmit={handleSubmit}>
          <div className="lab-number-workspace__layout">
            <section className="lab-number-workspace__panel">
              <header>
                <div>
                  <h2>
                    <FormattedMessage id="labNumber.rule.title" />
                  </h2>
                  <p>
                    <FormattedMessage id="labNumber.rule.description" />
                  </p>
                </div>
                <Tag type={isDirty ? "warm-gray" : "green"} size="sm">
                  <FormattedMessage
                    id={
                      isDirty
                        ? "labNumber.status.unsaved"
                        : "labNumber.status.saved"
                    }
                  />
                </Tag>
              </header>
              <div className="lab-number-workspace__fields">
                <Select
                  id="lab_number_type"
                  labelText={intl.formatMessage({ id: "labNumber.type" })}
                  aria-label={intl.formatMessage({ id: "labNumber.type" })}
                  helperText={intl.formatMessage({
                    id: "labNumber.type.helper",
                  })}
                  name="labNumberType"
                  value={labNumberValues.labNumberType}
                  onChange={handleFieldChange}
                >
                  <SelectItem
                    value="ALPHANUM"
                    text={intl.formatMessage({
                      id: "labNumber.type.alphanumeric",
                    })}
                  />
                  <SelectItem
                    value="SITEYEARNUM"
                    text={intl.formatMessage({ id: "labNumber.type.legacy" })}
                  />
                </Select>

                {labNumberValues.labNumberType === "ALPHANUM" && (
                  <div className="lab-number-workspace__prefix">
                    <Checkbox
                      name="usePrefix"
                      id="usePrefix"
                      aria-label={intl.formatMessage({
                        id: "labNumber.usePrefix",
                      })}
                      labelText={intl.formatMessage({
                        id: "labNumber.usePrefix",
                      })}
                      checked={labNumberValues.usePrefix}
                      onChange={(_event, { checked }) =>
                        setLabNumberValues((current) => ({
                          ...current,
                          usePrefix: Boolean(checked),
                        }))
                      }
                    />
                    <TextInput
                      type="text"
                      name="alphanumPrefix"
                      id="alphanumPrefix"
                      labelText={intl.formatMessage({ id: "labNumber.prefix" })}
                      helperText={intl.formatMessage({
                        id: "labNumber.prefix.helper",
                      })}
                      disabled={!labNumberValues.usePrefix}
                      value={labNumberValues.alphanumPrefix}
                      onChange={handleFieldChange}
                      enableCounter
                      maxCount={5}
                    />
                  </div>
                )}
              </div>
            </section>

            <section className="lab-number-workspace__panel lab-number-workspace__preview">
              <header>
                <div>
                  <h2>
                    <FormattedMessage id="labNumber.preview.title" />
                  </h2>
                  <p>
                    <FormattedMessage id="labNumber.preview.description" />
                  </p>
                </div>
              </header>
              <div className="lab-number-workspace__comparison">
                <article>
                  <span>
                    <FormattedMessage id="labNumber.format.current" />
                  </span>
                  <strong>{currentLabNumForDisplay || "—"}</strong>
                </article>
                <article className="lab-number-workspace__new-format">
                  <span>
                    <FormattedMessage id="labNumber.format.new" />
                  </span>
                  <strong>{sampleLabNumForDisplay || "—"}</strong>
                </article>
              </div>
              <p className="lab-number-workspace__notice">
                <FormattedMessage id="labNumber.preview.notice" />
              </p>
            </section>
          </div>
        </Form>
      </div>

      <Modal
        open={confirmOpen}
        danger
        modalHeading={intl.formatMessage({ id: "labNumber.confirm.title" })}
        primaryButtonText={intl.formatMessage({ id: "labNumber.confirm.save" })}
        secondaryButtonText={intl.formatMessage({ id: "button.cancel" })}
        onRequestClose={() => setConfirmOpen(false)}
        onRequestSubmit={submitValues}
      >
        <p>
          <FormattedMessage id="labNumber.confirm.description" />
        </p>
      </Modal>
    </>
  );
}

export default LabNumberManagement;
