import React, { useEffect, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  InlineLoading,
  InlineNotification,
  Stack,
  TextInput,
  Tile,
} from "@carbon/react";
import { useIntl } from "react-intl";
import {
  getReportRules,
  getReportTests,
  readRules,
  ReportApiError,
  saveReportRules,
} from "../../patient/resultsViewer/patient-report-release-api";
import type {
  GroupRules,
  ReportRequest,
} from "../../patient/resultsViewer/patient-report-release-api";
import {
  clearPendingReport,
  pendingReportKey,
  readPendingReport,
  rememberPendingReport,
  useReportSession,
} from "../../patient/resultsViewer/reportWorkspaceState";
export default function ReportGroupingConfiguration() {
  const session = useReportSession(true);
  const intl = useIntl();
  if (!session.valid || !session.stamp)
    return (
      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title={intl.formatMessage({ id: "report.groups.adminOnly" })}
      />
    );
  return (
    <Editor
      key={session.key}
      request={{ stamp: session.stamp, current: session.current }}
    />
  );
}
function Editor({ request }: { request: ReportRequest }) {
  const intl = useIntl();
  const t = (id: string) => intl.formatMessage({ id: `report.groups.${id}` });
  const [rules, setRules] = useState<
      (Omit<GroupRules, "ruleVersion"> & { ruleVersion: string | null }) | null
    >(null),
    [tests, setTests] = useState<{ id: string; value: string }[]>([]);
  const [canInitialize, setCanInitialize] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false),
    [query, setQuery] = useState("");
  const active = useRef(true),
    generation = useRef(0),
    writing = useRef(false),
    latest = useRef(request);
  latest.current = request;
  const key = pendingReportKey(request.stamp.identity, "groups");
  const [pending, setPending] = useState(!!readPendingReport(key));
  const context = (): ReportRequest => {
    const g = ++generation.current;
    return {
      ...request,
      current: () =>
        active.current && g === generation.current && latest.current.current(),
    };
  };
  const load = async () => {
    if (writing.current) return;
    const c = context();
    setRules(null);
    setTests([]);
    setCanInitialize(false);
    setError("");
    setSuccess(false);
    setBusy(true);
    try {
      const list = await getReportTests(c);
      if (c.current()) setTests(list);
      try {
        const r = await getReportRules(c);
        if (c.current()) setRules(r);
      } catch (e) {
        if (c.current()) {
          setCanInitialize(e instanceof ReportApiError && e.status === 409);
          setError(t("loadError"));
        }
      }
    } catch {
      if (c.current()) setError(t("loadError"));
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
      !rules ||
      writing.current ||
      pending ||
      !request.current() ||
      readPendingReport(key)
    )
      return;
    try {
      readRules({ ...rules, ruleVersion: rules.ruleVersion || "initial" });
    } catch {
      setError(t("invalid"));
      return;
    }
    const c = context();
    writing.current = true;
    setBusy(true);
    setError("");
    setSuccess(false);
    try {
      rememberPendingReport(key, { kind: "rules" }, c);
      setPending(true);
      const saved = await saveReportRules(rules, c);
      const current = await getReportRules(c);
      if (c.current()) {
        if (JSON.stringify(saved) !== JSON.stringify(current))
          throw new ReportApiError("unknown");
        clearPendingReport(key);
        setPending(false);
        setRules(current);
        setSuccess(true);
      }
    } catch (e) {
      if (c.current()) {
        if (e instanceof ReportApiError && e.kind === "rejected") {
          clearPendingReport(key);
          setPending(false);
          setRules(null);
        }
        setError(
          t(
            e instanceof ReportApiError && e.kind === "rejected"
              ? "conflict"
              : "unknown",
          ),
        );
      }
    } finally {
      writing.current = false;
      if (c.current()) setBusy(false);
    }
  };
  return (
    <Tile>
      <Stack gap={5}>
        <h3>{t("title")}</h3>
        <p>{t("help")}</p>
        {error && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={error}
          />
        )}{" "}
        {success && (
          <InlineNotification
            kind="success"
            lowContrast
            hideCloseButton
            title={t("saved")}
          />
        )}{" "}
        {pending && (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title={t("unknown")}
          />
        )}{" "}
        {busy && <InlineLoading description={t("loading")} />}
        <Button kind="tertiary" disabled={busy} onClick={() => void load()}>
          {t("reload")}
        </Button>
        {canInitialize && !rules && (
          <Button
            disabled={busy || pending}
            onClick={() => {
              setRules({
                ruleVersion: null,
                groups: [{ key: "", label: "", testIds: [] }],
              });
              setCanInitialize(false);
              setError("");
            }}
          >
            {t("initialize")}
          </Button>
        )}
        {rules && (
          <>
            <p>
              {t("version")}: {rules.ruleVersion || t("notConfigured")}
            </p>
            <TextInput
              id="report-groups-test-search"
              labelText={t("search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {rules.groups.map((group, index) => (
              <Tile key={index}>
                <Stack gap={4}>
                  <TextInput
                    id={`report-group-key-${index}`}
                    labelText={t("key")}
                    value={group.key}
                    disabled={busy || pending}
                    maxLength={128}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        groups: rules.groups.map((g, i) =>
                          i === index ? { ...g, key: e.target.value } : g,
                        ),
                      })
                    }
                  />
                  <TextInput
                    id={`report-group-label-${index}`}
                    labelText={t("label")}
                    value={group.label}
                    disabled={busy || pending}
                    maxLength={200}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        groups: rules.groups.map((g, i) =>
                          i === index ? { ...g, label: e.target.value } : g,
                        ),
                      })
                    }
                  />
                  <p>{t("tests")}</p>
                  {group.testIds.some(
                    (id) => !tests.some((test) => test.id === id),
                  ) && (
                    <InlineNotification
                      kind="warning"
                      lowContrast
                      hideCloseButton
                      title={t("missingTests")}
                    />
                  )}
                  {tests
                    .filter((test) =>
                      test.value.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((test) => (
                      <Checkbox
                        key={test.id}
                        id={`report-group-${index}-test-${test.id}`}
                        labelText={test.value}
                        checked={group.testIds.includes(test.id)}
                        disabled={busy || pending}
                        onChange={(_, data) =>
                          setRules({
                            ...rules,
                            groups: rules.groups.map((g, i) =>
                              i === index
                                ? {
                                    ...g,
                                    testIds: data.checked
                                      ? [...g.testIds, test.id]
                                      : g.testIds.filter(
                                          (id) => id !== test.id,
                                        ),
                                  }
                                : g,
                            ),
                          })
                        }
                      />
                    ))}
                  <Button
                    kind="danger--tertiary"
                    disabled={busy || pending || rules.groups.length === 1}
                    onClick={() =>
                      setRules({
                        ...rules,
                        groups: rules.groups.filter((_, i) => i !== index),
                      })
                    }
                  >
                    {t("remove")}
                  </Button>
                </Stack>
              </Tile>
            ))}
            <Button
              kind="tertiary"
              disabled={busy || pending || rules.groups.length >= 100}
              onClick={() =>
                setRules({
                  ...rules,
                  groups: [
                    ...rules.groups,
                    { key: "", label: "", testIds: [] },
                  ],
                })
              }
            >
              {t("add")}
            </Button>
            <Button disabled={busy || pending} onClick={() => void save()}>
              {t("save")}
            </Button>
          </>
        )}
      </Stack>
    </Tile>
  );
}
