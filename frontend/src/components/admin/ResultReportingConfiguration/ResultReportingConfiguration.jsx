import React, { useEffect, useRef, useState } from "react";
import {
  Button,
  InlineLoading,
  InlineNotification,
  Select,
  SelectItem,
  Tag,
  TextInput,
  Toggle,
} from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import { useHistory, useLocation } from "react-router-dom";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import ReportGroupingConfiguration from "./ReportGroupingConfiguration";
import HisResultOutboxPanel from "./HisResultOutboxPanel";
import {
  useReportSession,
  pendingReportKey,
  readPendingReport,
  rememberPendingReport,
  clearPendingReport,
} from "../../patient/resultsViewer/reportWorkspaceState";
import { ReportApiError } from "../../patient/resultsViewer/patient-report-release-api";
import {
  channelIdentity,
  getReportingChannels,
  saveReportingChannels,
  sameChannelConfiguration,
} from "./result-reporting-api";
import "./ResultReportingConfiguration.css";

const SECTIONS = ["channels", "groups", "operations"];
const CHANNEL_TITLES = {
  resultReport: "resultreporting.channel.results",
  malariaSurvaeillance: "resultreporting.channel.surveillance",
  malariaCase: "resultreporting.channel.case",
};
const copy = (value) => JSON.parse(JSON.stringify(value));

export default function ResultReportingConfiguration() {
  const intl = useIntl();
  const location = useLocation();
  const history = useHistory();
  const session = useReportSession(true);
  const query = new URLSearchParams(location.search);
  const section = SECTIONS.includes(query.get("section"))
    ? query.get("section")
    : "channels";
  const base = location.pathname.startsWith("/admin")
    ? "/admin"
    : "/MasterListsPage";
  return (
    <div className="adminPageContent result-reporting-page">
      <PageBreadCrumb
        breadcrumbs={[
          { label: "home.label", link: "/" },
          { label: "breadcrums.admin.managment", link: base },
          {
            label: "resultreporting.browse.title",
            link: `${base}/resultReportingConfiguration`,
          },
        ]}
      />
      <ProductPageHeader
        title={<FormattedMessage id="resultreporting.browse.title" />}
        subtitle={<FormattedMessage id="resultreporting.workspace.subtitle" />}
      />
      <div className="result-reporting-workspace__section-picker">
        <Select
          id="report-configuration-section"
          labelText={intl.formatMessage({
            id: "resultreporting.section.label",
          })}
          value={section}
          onChange={(event) => {
            const next = new URLSearchParams(location.search);
            next.set("section", event.target.value);
            history.replace({ ...location, search: `?${next}` });
          }}
        >
          {SECTIONS.map((value) => (
            <SelectItem
              key={value}
              value={value}
              text={intl.formatMessage({
                id: `resultreporting.section.${value}`,
              })}
            />
          ))}
        </Select>
      </div>
      {!session.valid || !session.stamp ? (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title={intl.formatMessage({ id: "resultreporting.adminOnly" })}
        />
      ) : (
        <div className="result-reporting-workspace" key={session.key}>
          <section
            hidden={section !== "channels"}
            aria-label={intl.formatMessage({
              id: "resultreporting.section.channels",
            })}
          >
            <ChannelEditor
              request={{ stamp: session.stamp, current: session.current }}
            />
          </section>
          <section
            hidden={section !== "groups"}
            aria-label={intl.formatMessage({
              id: "resultreporting.section.groups",
            })}
          >
            <ReportGroupingConfiguration />
          </section>
          <section
            hidden={section !== "operations"}
            aria-label={intl.formatMessage({
              id: "resultreporting.section.operations",
            })}
          >
            <HisResultOutboxPanel />
          </section>
        </div>
      )}
    </div>
  );
}

export function ChannelEditor({ request }) {
  const intl = useIntl();
  const t = (id) => intl.formatMessage({ id: `resultreporting.${id}` });
  const [form, setForm] = useState(null),
    [baseline, setBaseline] = useState(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false);
  const key = pendingReportKey(request.stamp.identity, "channels");
  const [pending, setPending] = useState(!!readPendingReport(key));
  const active = useRef(true),
    generation = useRef(0),
    working = useRef(false),
    latest = useRef(request),
    expected = useRef(null);
  latest.current = request;
  const context = () => {
    const value = ++generation.current;
    return {
      ...request,
      current: () =>
        active.current &&
        value === generation.current &&
        latest.current.current(),
    };
  };
  const dirty = form && baseline && !sameChannelConfiguration(baseline, form);
  const load = async () => {
    if (working.current) return;
    const c = context();
    setBusy(true);
    setError("");
    setSuccess(false);
    try {
      const current = await getReportingChannels(c);
      if (!c.current()) return;
      if (pending && expected.current) {
        if (!sameChannelConfiguration(expected.current, current)) {
          setError(t("channels.unknown"));
          return;
        }
        clearPendingReport(key);
        setPending(false);
        expected.current = null;
        setSuccess(true);
      }
      // A failed read never destroys the editable draft; ordinary reload is disabled while dirty.
      setForm(copy(current));
      setBaseline(copy(current));
    } catch {
      if (c.current()) setError(t("channels.loadError"));
    } finally {
      if (c.current()) setBusy(false);
    }
  };
  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
      generation.current++;
    };
  }, []);
  const save = async () => {
    if (
      !form ||
      !dirty ||
      busy ||
      working.current ||
      pending ||
      readPendingReport(key) ||
      !request.current()
    )
      return;
    const target = copy(form),
      c = context();
    expected.current = target;
    working.current = true;
    setBusy(true);
    setError("");
    setSuccess(false);
    try {
      rememberPendingReport(key, { kind: "rules" }, c);
      setPending(true);
      await saveReportingChannels(target, c);
      const current = await getReportingChannels(c);
      if (!c.current()) return;
      if (!sameChannelConfiguration(target, current))
        throw new ReportApiError("unknown");
      clearPendingReport(key);
      setPending(false);
      expected.current = null;
      setForm(copy(current));
      setBaseline(copy(current));
      setSuccess(true);
    } catch (failure) {
      if (!c.current()) return;
      if (failure instanceof ReportApiError && failure.kind === "rejected") {
        clearPendingReport(key);
        setPending(false);
        expected.current = null;
        setError(t("channels.rejected"));
      } else setError(t("channels.unknown"));
    } finally {
      working.current = false;
      if (c.current()) setBusy(false);
    }
  };
  const change = (identity, updates) => {
    if (busy || pending || working.current) return;
    setSuccess(false);
    setForm((current) => ({
      ...current,
      reports: current.reports.map((channel) =>
        channelIdentity(channel) === identity
          ? { ...channel, ...updates }
          : channel,
      ),
    }));
  };
  const locked = busy || pending;
  return (
    <div className="result-reporting-channels">
      <header className="result-reporting-workspace__section-header">
        <div>
          <h2>{t("section.channels")}</h2>
          <p>{t("channels.help")}</p>
        </div>
        <Button
          kind="tertiary"
          size="sm"
          disabled={busy || (dirty && !pending)}
          onClick={() => void load()}
        >
          {t(pending ? "channels.verify" : "channels.reload")}
        </Button>
      </header>
      {error && !(pending && error === t("channels.unknown")) && (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title={error}
        />
      )}
      {pending && (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title={t("channels.unknown")}
        />
      )}
      {success && (
        <InlineNotification
          kind="success"
          lowContrast
          hideCloseButton
          title={t("channels.saved")}
        />
      )}
      {busy && <InlineLoading description={t("channels.loading")} />}
      {form && (
        <>
          <div className="result-reporting-workspace__summary">
            <div>
              <strong>{form.reports.length}</strong>
              <span>{t("summary.channels")}</span>
            </div>
            <div>
              <strong>
                {
                  form.reports.filter((channel) => channel.enabled === "enable")
                    .length
                }
              </strong>
              <span>{t("summary.enabled")}</span>
            </div>
            <div>
              <strong>
                {form.reports.reduce(
                  (count, channel) => count + Number(channel.backlogSize || 0),
                  0,
                )}
              </strong>
              <span>{t("summary.backlog")}</span>
            </div>
          </div>
          {form.reports.length === 0 && (
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title={t("channels.empty")}
            />
          )}
          <div className="result-reporting-workspace__channels">
            {form.reports.map((channel, index) => {
              const identity = channelIdentity(channel),
                titleId = CHANNEL_TITLES[channel.connectionTestIdentifier];
              return (
                <section
                  className="result-reporting-workspace__channel"
                  key={identity}
                >
                  <header>
                    <h3>
                      {titleId
                        ? intl.formatMessage({ id: titleId })
                        : channel.title || t("channel.other")}
                    </h3>
                    <Tag type={channel.enabled === "enable" ? "green" : "gray"}>
                      {t(channel.enabled === "enable" ? "enabled" : "disabled")}
                    </Tag>
                  </header>
                  <Toggle
                    id={`report-channel-${index}-enabled`}
                    labelText={t("channels.enable")}
                    labelA={t("disabled")}
                    labelB={t("enabled")}
                    toggled={channel.enabled === "enable"}
                    disabled={locked}
                    onToggle={(enabled) =>
                      change(identity, {
                        enabled: enabled ? "enable" : "disable",
                      })
                    }
                  />
                  <TextInput
                    id={`url-${index}`}
                    type="text"
                    labelText={t("config.url")}
                    placeholder={t("config.url.placeholder")}
                    value={channel.url}
                    disabled={locked}
                    onChange={(event) =>
                      change(identity, { url: event.target.value })
                    }
                  />
                  {channel.isScheduled && (
                    <p className="result-reporting-workspace__help">
                      {t("channels.schedule")}:{" "}
                      {channel.scheduleHours && channel.scheduleMin
                        ? `${channel.scheduleHours.padStart(2, "0")}:${channel.scheduleMin.padStart(2, "0")}`
                        : t("channels.scheduleNone")}
                    </p>
                  )}
                  {channel.showAuthentication && (
                    <p className="result-reporting-workspace__help">
                      {t("channels.authenticationReadonly")}
                    </p>
                  )}
                  {channel.showBacklog && (
                    <div className="result-reporting-workspace__backlog">
                      {intl.formatMessage({ id: "result.report.queue.size" })}{" "}
                      {channel.backlogSize || "0"}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
          <div className="result-reporting-workspace__actions">
            <Button
              data-cy="saveButton"
              disabled={locked || !dirty}
              onClick={() => void save()}
            >
              {intl.formatMessage({ id: "label.button.save" })}
            </Button>
            <Button
              data-cy="cancelButton"
              kind="tertiary"
              disabled={locked || !dirty}
              onClick={() => {
                setForm(copy(baseline));
                setError("");
                setSuccess(false);
              }}
            >
              {intl.formatMessage({ id: "label.button.cancel" })}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
