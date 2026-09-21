import { useContext, useEffect, useMemo, useState } from "react";
import {
  Button,
  InlineNotification,
  Select,
  SelectItem,
  Tag,
  TextArea,
  TextInput,
} from "@carbon/react";
import { Add, Send, TrashCan } from "@carbon/icons-react";
import { FormattedMessage, useIntl } from "react-intl";
import { getFromOpenElisServer, postToOpenElisServer } from "../utils/Utils";
import { AlertDialog, NotificationKinds } from "../common/CustomNotification";
import PageBreadCrumb from "../common/PageBreadCrumb";
import ProductPageHeader from "../common/ProductPageHeader";
import { NotificationContext } from "../layout/Layout";
import "./PushNotificationPage.css";

const TEMPLATE_KEY = "openelis.cn.notification.templates.v1";
const HISTORY_KEY = "openelis.cn.notification.history.v1";
const readStored = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch (_error) {
    return [];
  }
};

export default function PushNotificationPage() {
  const intl = useIntl();
  const notification = useContext(NotificationContext);
  const [tab, setTab] = useState("compose");
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState("");
  const [message, setMessage] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templates, setTemplates] = useState(() => readStored(TEMPLATE_KEY));
  const [history, setHistory] = useState(() => readStored(HISTORY_KEY));
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const selectedUser = useMemo(
    () => users.find((user) => String(user.id) === String(userId)),
    [userId, users],
  );

  useEffect(() => {
    getFromOpenElisServer("/rest/systemusers", (data) =>
      setUsers(Array.isArray(data) ? data : []),
    );
  }, []);
  const persistTemplates = (next) => {
    setTemplates(next);
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
  };
  const persistHistory = (next) => {
    const limited = next.slice(0, 100);
    setHistory(limited);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(limited));
  };
  const submit = () => {
    if (!message.trim() || !userId) {
      setError(intl.formatMessage({ id: "notify.error" }));
      return;
    }
    setSending(true);
    setError("");
    postToOpenElisServer(
      `/rest/notification/${userId}`,
      JSON.stringify({ message }),
      (status) => {
        const ok = String(status) === "200" || status === true || status?.ok;
        setSending(false);
        notification?.addNotification?.({
          title: intl.formatMessage({ id: "notification.title" }),
          message: intl.formatMessage({
            id: ok ? "notify.user.success.notification" : "server.error.msg",
          }),
          kind: ok ? NotificationKinds.success : NotificationKinds.error,
        });
        notification?.setNotificationVisible?.(true);
        if (ok) {
          persistHistory([
            {
              id: `${Date.now()}`,
              recipient: selectedUser?.displayName || String(userId),
              message: message.trim(),
              sentAt: new Date().toISOString(),
              status: "SENT",
            },
            ...history,
          ]);
          setMessage("");
        }
      },
    );
  };
  const saveTemplate = () => {
    if (!templateName.trim() || !message.trim()) {
      setError(intl.formatMessage({ id: "notify.template.required" }));
      return;
    }
    persistTemplates([
      {
        id: `${Date.now()}`,
        name: templateName.trim(),
        message: message.trim(),
      },
      ...templates,
    ]);
    setTemplateName("");
    setError("");
  };
  const tabs = [
    ["compose", "notify.tab.compose"],
    ["templates", "notify.tab.templates"],
    ["history", "notify.tab.history"],
  ];
  return (
    <div className="adminPageContent notification-workspace">
      {notification?.notificationVisible ? <AlertDialog /> : null}
      <PageBreadCrumb
        breadcrumbs={[
          { label: "home.label", link: "/" },
          { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
          { label: "notify.main.title", link: "/MasterListsPage/NotifyUser" },
        ]}
      />
      <ProductPageHeader
        title={<FormattedMessage id="notify.main.title" />}
        subtitle={<FormattedMessage id="notify.workspace.subtitle" />}
      />
      <nav
        className="notification-workspace__tabs"
        aria-label={intl.formatMessage({ id: "notify.workspace.tabs" })}
      >
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "is-active" : ""}
            onClick={() => {
              setTab(id);
              setError("");
            }}
          >
            <FormattedMessage id={label} />
            {id === "templates" && <Tag type="gray">{templates.length}</Tag>}
            {id === "history" && <Tag type="gray">{history.length}</Tag>}
          </button>
        ))}
      </nav>
      {error && (
        <InlineNotification
          kind="error"
          lowContrast
          title={error}
          onCloseButtonClick={() => setError("")}
        />
      )}
      {tab === "compose" && (
        <section className="notification-workspace__panel">
          <header>
            <h2>
              <FormattedMessage id="notify.compose.title" />
            </h2>
            <p>
              <FormattedMessage id="notify.compose.help" />
            </p>
          </header>
          <div className="notification-workspace__form">
            <Select
              id="notify-user"
              labelText={intl.formatMessage({ id: "notify.user.by" })}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <SelectItem
                value=""
                text={intl.formatMessage({ id: "notify.user.choose" })}
              />
              {users.map((user) => (
                <SelectItem
                  key={user.id}
                  value={String(user.id)}
                  text={user.displayName}
                />
              ))}
            </Select>
            <TextArea
              id="notify-message"
              labelText={intl.formatMessage({ id: "notify.message" })}
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              enableCounter
              maxCount={500}
            />
          </div>
          <div className="notification-workspace__template-save">
            <TextInput
              id="notify-template-name"
              labelText={intl.formatMessage({ id: "notify.template.name" })}
              placeholder={intl.formatMessage({
                id: "notify.template.namePlaceholder",
              })}
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />
            <Button kind="tertiary" renderIcon={Add} onClick={saveTemplate}>
              <FormattedMessage id="notify.template.save" />
            </Button>
          </div>
          <footer>
            <p>
              <FormattedMessage id="notify.compose.safety" />
            </p>
            <Button
              renderIcon={Send}
              disabled={sending || !userId || !message.trim()}
              onClick={submit}
            >
              {sending
                ? intl.formatMessage({ id: "notify.sending" })
                : intl.formatMessage({ id: "notify.send" })}
            </Button>
          </footer>
        </section>
      )}
      {tab === "templates" && (
        <section className="notification-workspace__panel">
          <header>
            <h2>
              <FormattedMessage id="notify.templates.title" />
            </h2>
            <p>
              <FormattedMessage id="notify.templates.help" />
            </p>
          </header>
          {templates.length === 0 ? (
            <div className="notification-workspace__empty">
              <FormattedMessage id="notify.templates.empty" />
            </div>
          ) : (
            <div className="notification-workspace__list">
              {templates.map((template) => (
                <article key={template.id}>
                  <div>
                    <h3>{template.name}</h3>
                    <p>{template.message}</p>
                  </div>
                  <div>
                    <Button
                      size="sm"
                      kind="ghost"
                      onClick={() => {
                        setMessage(template.message);
                        setTab("compose");
                      }}
                    >
                      <FormattedMessage id="notify.template.use" />
                    </Button>
                    <Button
                      size="sm"
                      kind="danger--ghost"
                      hasIconOnly
                      renderIcon={TrashCan}
                      iconDescription={intl.formatMessage({
                        id: "notify.template.delete",
                      })}
                      onClick={() =>
                        persistTemplates(
                          templates.filter((item) => item.id !== template.id),
                        )
                      }
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      {tab === "history" && (
        <section className="notification-workspace__panel">
          <header>
            <h2>
              <FormattedMessage id="notify.history.title" />
            </h2>
            <p>
              <FormattedMessage id="notify.history.help" />
            </p>
          </header>
          {history.length === 0 ? (
            <div className="notification-workspace__empty">
              <FormattedMessage id="notify.history.empty" />
            </div>
          ) : (
            <div className="notification-workspace__list">
              {history.map((item) => (
                <article key={item.id}>
                  <div>
                    <h3>
                      {item.recipient}{" "}
                      <Tag type="green">
                        <FormattedMessage id="notify.history.sent" />
                      </Tag>
                    </h3>
                    <p>{item.message}</p>
                    <small>{new Date(item.sentAt).toLocaleString()}</small>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
