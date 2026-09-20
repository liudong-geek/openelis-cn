import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  ContentSwitcher,
  InlineLoading,
  Loading,
  Modal,
  Switch,
  Tag,
  TextArea,
  TextInput,
} from "@carbon/react";
import { ArrowLeft, Edit, Save, Undo } from "@carbon/icons-react";
import { FormattedMessage, useIntl } from "react-intl";
import { useLocation } from "react-router-dom";
import {
  getFromOpenElisServer,
  postToOpenElisServerJsonResponse,
} from "../../utils/Utils";
import { NotificationContext } from "../../layout/Layout";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import { navigateToInternalPath } from "../../utils/NavigationUtils";
import "./TestNotificationConfigEdit.css";

const breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
  {
    label: "testnotificationconfig.browse.title",
    link: "/MasterListsPage/testNotificationConfigMenu",
  },
];

const CHANNELS = [
  {
    key: "providerEmail",
    label: "testnotification.provider.email",
    email: true,
  },
  { key: "providerSMS", label: "testnotification.provider.sms", email: false },
  { key: "patientEmail", label: "testnotification.patient.email", email: true },
  { key: "patientSMS", label: "testnotification.patient.sms", email: false },
];

const clone = (value) => JSON.parse(JSON.stringify(value || {}));

export default function TestNotificationConfigEdit() {
  const intl = useIntl();
  const location = useLocation();
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);
  const mounted = useRef(false);
  const testId = new URLSearchParams(location.search).get("testId") || "0";

  const [selectedChannel, setSelectedChannel] = useState(0);
  const [configLoading, setConfigLoading] = useState(true);
  const [namesLoading, setNamesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [systemTemplateEditable, setSystemTemplateEditable] = useState(false);
  const [form, setForm] = useState({});
  const [savedForm, setSavedForm] = useState({});
  const [testNames, setTestNames] = useState([]);

  useEffect(() => {
    mounted.current = true;
    if (testId !== "0") {
      getFromOpenElisServer(
        `/rest/TestNotificationConfig?testId=${encodeURIComponent(testId)}`,
        (response) => {
          if (!mounted.current) return;
          const next = clone(response);
          setForm(next);
          setSavedForm(clone(next));
          setConfigLoading(false);
        },
      );
    } else {
      setConfigLoading(false);
    }
    getFromOpenElisServer("/rest/test-list", (response) => {
      if (!mounted.current) return;
      setTestNames(Array.isArray(response) ? response : []);
      setNamesLoading(false);
    });
    return () => {
      mounted.current = false;
    };
  }, [testId]);

  const testName = useMemo(() => {
    const configuredId = form?.config?.testId ?? testId;
    return (
      testNames.find((item) => String(item.id) === String(configuredId))
        ?.value ||
      intl.formatMessage(
        { id: "testnotification.editor.unknownTest" },
        { id: configuredId },
      )
    );
  }, [form, intl, testId, testNames]);

  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(savedForm),
    [form, savedForm],
  );

  const activeChannelCount = useMemo(
    () => CHANNELS.filter(({ key }) => form?.config?.[key]?.active).length,
    [form],
  );

  const setAtPath = (path, value) => {
    setForm((current) => {
      const next = clone(current);
      const parts = path.split(".");
      let cursor = next;
      parts.slice(0, -1).forEach((part) => {
        cursor[part] ||= {};
        cursor = cursor[part];
      });
      cursor[parts.at(-1)] = value;
      return next;
    });
  };

  const readAtPath = (path) => {
    let cursor = form;
    for (const part of path.split(".")) cursor = cursor?.[part];
    return cursor ?? "";
  };

  const updateSystemTemplate = (field, value) => {
    setForm((current) => ({
      ...current,
      editSystemDefaultPayloadTemplate: true,
      systemDefaultPayloadTemplate: {
        ...current.systemDefaultPayloadTemplate,
        [field]: value,
      },
    }));
  };

  const discardChanges = () => {
    setForm(clone(savedForm));
    setSystemTemplateEditable(false);
  };

  const saveChanges = () => {
    setConfirmOpen(false);
    setSaving(true);
    postToOpenElisServerJsonResponse(
      "/rest/TestNotificationConfig",
      JSON.stringify(form),
      (response) => {
        if (!mounted.current) return;
        const succeeded = Boolean(response);
        if (succeeded) {
          setSavedForm(clone(form));
          setSystemTemplateEditable(false);
        }
        addNotification({
          kind: succeeded ? NotificationKinds.success : NotificationKinds.error,
          title: intl.formatMessage({ id: "notification.title" }),
          message: intl.formatMessage({
            id: succeeded
              ? "notification.user.post.save.success"
              : "server.error.msg",
          }),
        });
        setNotificationVisible(true);
        setSaving(false);
      },
    );
  };

  const channel = CHANNELS[selectedChannel];
  const loading = configLoading || namesLoading;

  return (
    <>
      {notificationVisible && <AlertDialog />}
      {loading && <Loading />}
      <div className="adminPageContent notification-template-workspace">
        <PageBreadCrumb breadcrumbs={breadcrumbs} />
        <ProductPageHeader
          title={testName}
          subtitle={<FormattedMessage id="testnotification.editor.subtitle" />}
          actions={
            <>
              <Button
                kind="ghost"
                renderIcon={ArrowLeft}
                onClick={() =>
                  navigateToInternalPath(
                    "/MasterListsPage/testNotificationConfigMenu",
                    { replace: true },
                  )
                }
              >
                <FormattedMessage id="testnotification.editor.back" />
              </Button>
              <Button
                kind="secondary"
                renderIcon={Undo}
                disabled={!isDirty || saving}
                onClick={discardChanges}
              >
                <FormattedMessage id="testnotification.workspace.discard" />
              </Button>
              <Button
                renderIcon={Save}
                disabled={!isDirty || saving}
                onClick={() => setConfirmOpen(true)}
              >
                {saving ? (
                  <InlineLoading
                    description={intl.formatMessage({
                      id: "testnotification.workspace.saving",
                    })}
                  />
                ) : (
                  <FormattedMessage id="testnotification.workspace.save" />
                )}
              </Button>
            </>
          }
        />

        {!loading && form?.config && (
          <>
            <section className="notification-template-workspace__channels">
              <header>
                <div>
                  <h2>
                    <FormattedMessage id="testnotification.editor.channelsTitle" />
                  </h2>
                  <p>
                    <FormattedMessage id="testnotification.editor.channelsHelper" />
                  </p>
                </div>
                <Tag type={activeChannelCount ? "teal" : "cool-gray"} size="sm">
                  <FormattedMessage
                    id="testnotification.editor.channelsActive"
                    values={{ count: activeChannelCount }}
                  />
                </Tag>
              </header>
              <div className="notification-template-workspace__channel-grid">
                {CHANNELS.map((item) => (
                  <Checkbox
                    key={item.key}
                    id={`channel-${item.key}`}
                    aria-label={intl.formatMessage({ id: item.label })}
                    labelText={intl.formatMessage({ id: item.label })}
                    checked={Boolean(form.config?.[item.key]?.active)}
                    onChange={(event) =>
                      setAtPath(
                        `config.${item.key}.active`,
                        event.target.checked,
                      )
                    }
                  />
                ))}
              </div>
            </section>

            <div className="notification-template-workspace__layout">
              <aside className="notification-template-workspace__guide">
                <h2>
                  <FormattedMessage id="testnotification.instructions.header" />
                </h2>
                <p>
                  <FormattedMessage id="testnotification.instructions.body" />
                </p>
                <ol>
                  <li>
                    <FormattedMessage id="testnotification.instructions.body.0" />
                  </li>
                  <li>
                    <FormattedMessage id="testnotification.instructions.body.1" />
                  </li>
                  <li>
                    <FormattedMessage id="testnotification.instructions.body.2" />
                  </li>
                  <li>
                    <FormattedMessage id="testnotification.instructions.body.3" />
                  </li>
                </ol>
                <h3>
                  <FormattedMessage id="testnotification.instructionis.variables.header" />
                </h3>
                <ul className="notification-template-workspace__variables">
                  <li>
                    <FormattedMessage id="testnotification.instructionis.variables.body" />
                  </li>
                  <li>
                    <FormattedMessage id="testnotification.instructionis.variables.body.0" />
                  </li>
                  <li>
                    <FormattedMessage id="testnotification.instructionis.variables.body.1" />
                  </li>
                  <li>
                    <FormattedMessage id="testnotification.instructionis.variables.body.2" />
                  </li>
                </ul>
              </aside>

              <main className="notification-template-workspace__templates">
                <section className="notification-template-workspace__card">
                  <header>
                    <div>
                      <h2>
                        <FormattedMessage id="testnotification.systemdefault.template" />
                      </h2>
                      <p>
                        <FormattedMessage id="testnotification.editor.systemHelper" />
                      </p>
                    </div>
                    <Button
                      kind="ghost"
                      size="sm"
                      renderIcon={Edit}
                      onClick={() =>
                        setSystemTemplateEditable((value) => !value)
                      }
                    >
                      <FormattedMessage
                        id={
                          systemTemplateEditable
                            ? "testnotification.editor.lockSystem"
                            : "testnotification.editor.editSystem"
                        }
                      />
                    </Button>
                  </header>
                  {systemTemplateEditable && (
                    <p className="notification-template-workspace__warning">
                      <FormattedMessage id="testnotification.editor.systemWarning" />
                    </p>
                  )}
                  <div className="notification-template-workspace__fields">
                    <TextInput
                      id="system-default-subject"
                      labelText={intl.formatMessage({
                        id: "testnotification.subjecttemplate",
                      })}
                      disabled={!systemTemplateEditable}
                      value={
                        form.systemDefaultPayloadTemplate?.subjectTemplate || ""
                      }
                      onChange={(event) =>
                        updateSystemTemplate(
                          "subjectTemplate",
                          event.target.value,
                        )
                      }
                    />
                    <TextArea
                      id="system-default-message"
                      aria-label={intl.formatMessage({
                        id: "testnotification.messagetemplate",
                      })}
                      labelText={intl.formatMessage({
                        id: "testnotification.messagetemplate",
                      })}
                      disabled={!systemTemplateEditable}
                      value={
                        form.systemDefaultPayloadTemplate?.messageTemplate || ""
                      }
                      onChange={(event) =>
                        updateSystemTemplate(
                          "messageTemplate",
                          event.target.value,
                        )
                      }
                    />
                  </div>
                </section>

                <section className="notification-template-workspace__card">
                  <header>
                    <div>
                      <h2>
                        <FormattedMessage id="testnotification.testdefault.template" />
                      </h2>
                      <p>
                        <FormattedMessage id="testnotification.editor.testDefaultHelper" />
                      </p>
                    </div>
                  </header>
                  <div className="notification-template-workspace__fields">
                    <TextInput
                      id="test-default-subject"
                      labelText={intl.formatMessage({
                        id: "testnotification.subjecttemplate",
                      })}
                      value={readAtPath(
                        "config.defaultPayloadTemplate.subjectTemplate",
                      )}
                      onChange={(event) =>
                        setAtPath(
                          "config.defaultPayloadTemplate.subjectTemplate",
                          event.target.value,
                        )
                      }
                    />
                    <TextArea
                      id="test-default-message"
                      aria-label={intl.formatMessage({
                        id: "testnotification.messagetemplate",
                      })}
                      labelText={intl.formatMessage({
                        id: "testnotification.messagetemplate",
                      })}
                      value={readAtPath(
                        "config.defaultPayloadTemplate.messageTemplate",
                      )}
                      onChange={(event) =>
                        setAtPath(
                          "config.defaultPayloadTemplate.messageTemplate",
                          event.target.value,
                        )
                      }
                    />
                  </div>
                </section>

                <section className="notification-template-workspace__card">
                  <header>
                    <div>
                      <h2>
                        <FormattedMessage id="testnotification.options" />
                      </h2>
                      <p>
                        <FormattedMessage id="testnotification.editor.individualHelper" />
                      </p>
                    </div>
                    <Tag type={isDirty ? "warm-gray" : "green"} size="sm">
                      <FormattedMessage
                        id={
                          isDirty
                            ? "testnotification.editor.unsaved"
                            : "testnotification.workspace.saved"
                        }
                      />
                    </Tag>
                  </header>
                  <ContentSwitcher
                    selectedIndex={selectedChannel}
                    onChange={({ index }) => setSelectedChannel(index)}
                    size="sm"
                  >
                    {CHANNELS.map((item) => (
                      <Switch
                        key={item.key}
                        name={item.key}
                        text={intl.formatMessage({ id: item.label })}
                      />
                    ))}
                  </ContentSwitcher>
                  <div className="notification-template-workspace__fields notification-template-workspace__fields--channel">
                    {channel.email && (
                      <TextInput
                        id={`${channel.key}-subject`}
                        labelText={intl.formatMessage({
                          id: "testnotification.subjecttemplate",
                        })}
                        value={readAtPath(
                          `config.${channel.key}.payloadTemplate.subjectTemplate`,
                        )}
                        onChange={(event) =>
                          setAtPath(
                            `config.${channel.key}.payloadTemplate.subjectTemplate`,
                            event.target.value,
                          )
                        }
                      />
                    )}
                    <TextArea
                      id={`${channel.key}-message`}
                      aria-label={intl.formatMessage({
                        id: "testnotification.messagetemplate",
                      })}
                      labelText={intl.formatMessage({
                        id: "testnotification.messagetemplate",
                      })}
                      value={readAtPath(
                        `config.${channel.key}.payloadTemplate.messageTemplate`,
                      )}
                      onChange={(event) =>
                        setAtPath(
                          `config.${channel.key}.payloadTemplate.messageTemplate`,
                          event.target.value,
                        )
                      }
                    />
                  </div>
                </section>
              </main>
            </div>
          </>
        )}
      </div>

      <Modal
        open={confirmOpen}
        modalHeading={intl.formatMessage({
          id: "testnotification.editor.confirmTitle",
        })}
        primaryButtonText={intl.formatMessage({
          id: "testnotification.workspace.confirmSave",
        })}
        secondaryButtonText={intl.formatMessage({ id: "label.button.cancel" })}
        onRequestClose={() => setConfirmOpen(false)}
        onRequestSubmit={saveChanges}
      >
        <p>
          <FormattedMessage
            id="testnotification.editor.confirmBody"
            values={{ test: testName }}
          />
        </p>
      </Modal>
    </>
  );
}
