import React, { useContext, useEffect, useRef, useState } from "react";
import {
  Accordion,
  AccordionItem,
  Button,
  InlineNotification,
  Select,
  SelectItem,
  Tag,
  TextInput,
  Toggle,
} from "@carbon/react";
import { FormattedMessage, injectIntl, useIntl } from "react-intl";
import { getFromOpenElisServer } from "../../utils/Utils";
import config from "../../../config.json";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import { NotificationContext } from "../../layout/Layout";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
import "../AdminListWorkspace.css";
import "./LoggingManagement.css";

const LOG_LEVELS = [
  { code: "A", label: "ALL" },
  { code: "T", label: "TRACE" },
  { code: "D", label: "DEBUG" },
  { code: "I", label: "INFO" },
  { code: "W", label: "WARN" },
  { code: "E", label: "ERROR" },
  { code: "F", label: "FATAL" },
  { code: "O", label: "OFF" },
];

export const MAX_DISPLAYED_LINES = 500;

export const appendLogLine = (lines, line, maximum = MAX_DISPLAYED_LINES) => {
  const next = [...lines, line];
  return next.length > maximum ? next.slice(next.length - maximum) : next;
};

function LoggingManagement() {
  const intl = useIntl();
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);
  const [logLevel, setLogLevel] = useState("I");
  const [logger, setLogger] = useState("org.openelisglobal");
  const [streaming, setStreaming] = useState(true);
  const [streamError, setStreamError] = useState(null);
  const [tailLines, setTailLines] = useState([]);
  const tailRef = useRef(null);

  useEffect(() => {
    if (!streaming) return undefined;

    const eventSource = new EventSource(
      `${config.serverBaseUrl}/logging/stream`,
      { withCredentials: true },
    );
    eventSource.onopen = () => setStreamError(null);
    eventSource.onmessage = (event) =>
      setTailLines((lines) => appendLogLine(lines, event.data));
    eventSource.onerror = () =>
      setStreamError(
        intl.formatMessage({ id: "logging.management.tail.disconnected" }),
      );
    return () => eventSource.close();
  }, [streaming, intl]);

  useEffect(() => {
    if (tailRef.current) {
      tailRef.current.scrollTop = tailRef.current.scrollHeight;
    }
  }, [tailLines]);

  const handleApply = () => {
    const endpoint = `/logging?logLevel=${encodeURIComponent(logLevel)}&logger=${encodeURIComponent(logger)}`;
    getFromOpenElisServer(endpoint, () => {
      setNotificationVisible(true);
      addNotification({
        kind: NotificationKinds.success,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage(
          { id: "logging.management.success" },
          {
            level: LOG_LEVELS.find((level) => level.code === logLevel)?.label,
            logger,
          },
        ),
      });
    });
  };

  return (
    <>
      {notificationVisible && <AlertDialog />}
      <div className="adminPageContent admin-list-workspace admin-list-workspace--compact system-log-page">
        <PageBreadCrumb
          breadcrumbs={[
            { label: "home.label", link: "/" },
            { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
            {
              label: "logging.management.label",
              link: "/MasterListsPage/loggingManagement",
            },
          ]}
        />
        <ProductPageHeader
          title={<FormattedMessage id="logging.management.label" />}
          subtitle={<FormattedMessage id="logging.management.page.subtitle" />}
        />

        <section className="admin-list-workspace__overview">
          <article>
            <span>
              <FormattedMessage id="logging.management.metric.level" />
            </span>
            <strong>
              {LOG_LEVELS.find((item) => item.code === logLevel)?.label}
            </strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="logging.management.metric.visible" />
            </span>
            <strong>{tailLines.length}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="logging.management.metric.stream" />
            </span>
            <Tag type={streaming ? "green" : "cool-gray"} size="sm">
              <FormattedMessage
                id={
                  streaming
                    ? "logging.management.tail.receiving"
                    : "logging.management.tail.paused"
                }
              />
            </Tag>
          </article>
        </section>

        <section className="admin-list-workspace__surface system-log-page__viewer">
          <header className="admin-list-workspace__section-heading">
            <div>
              <h2>
                <FormattedMessage id="logging.management.tail.label" />
              </h2>
              <p>
                <FormattedMessage id="logging.management.tail.description" />
              </p>
            </div>
            <div className="system-log-page__viewer-actions">
              <Toggle
                id="tail-stream"
                size="sm"
                hideLabel
                labelText={intl.formatMessage({
                  id: "logging.management.tail.stream",
                })}
                labelA={intl.formatMessage({
                  id: "logging.management.tail.off",
                })}
                labelB={intl.formatMessage({
                  id: "logging.management.tail.on",
                })}
                toggled={streaming}
                onToggle={setStreaming}
              />
              <Button
                kind="ghost"
                size="sm"
                disabled={tailLines.length === 0}
                onClick={() => setTailLines([])}
              >
                <FormattedMessage id="logging.management.tail.clear" />
              </Button>
            </div>
          </header>

          {streamError && (
            <InlineNotification
              className="system-log-page__notification"
              kind="error"
              lowContrast
              hideCloseButton
              title={intl.formatMessage({
                id: "logging.management.tail.connectionError",
              })}
              subtitle={streamError}
            />
          )}

          <div
            className="system-log-page__log"
            ref={tailRef}
            role="log"
            aria-label={intl.formatMessage({
              id: "logging.management.tail.label",
            })}
          >
            {tailLines.length === 0 ? (
              <div className="system-log-page__empty" role="status">
                <FormattedMessage id="logging.management.tail.empty" />
              </div>
            ) : (
              tailLines.map((line, index) => (
                <div className="system-log-page__line" key={`${index}-${line}`}>
                  <span aria-hidden="true">{index + 1}</span>
                  <code>{line}</code>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="admin-list-workspace__surface system-log-page__settings">
          <Accordion align="start">
            <AccordionItem
              title={intl.formatMessage({
                id: "logging.management.settings.title",
              })}
            >
              <p className="system-log-page__settings-copy">
                <FormattedMessage id="logging.management.description" />
              </p>
              <div className="system-log-page__settings-grid">
                <Select
                  id="log-level-select"
                  labelText={intl.formatMessage({
                    id: "logging.management.level",
                  })}
                  value={logLevel}
                  onChange={(event) => setLogLevel(event.target.value)}
                >
                  {LOG_LEVELS.map((level) => (
                    <SelectItem
                      key={level.code}
                      value={level.code}
                      text={level.label}
                    />
                  ))}
                </Select>
                <TextInput
                  id="logger-name"
                  labelText={intl.formatMessage({
                    id: "logging.management.logger",
                  })}
                  value={logger}
                  onChange={(event) => setLogger(event.target.value)}
                  helperText={intl.formatMessage({
                    id: "logging.management.logger.helper",
                  })}
                />
                <Button size="sm" onClick={handleApply}>
                  <FormattedMessage id="logging.management.apply" />
                </Button>
              </div>
            </AccordionItem>
          </Accordion>
        </section>
      </div>
    </>
  );
}

export default injectIntl(LoggingManagement);
