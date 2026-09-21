import React, { useMemo, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  InlineNotification,
  NumberInput,
  Select,
  SelectItem,
  Tag,
  TextInput,
  Toggle,
} from "@carbon/react";
import { Download, Play, Renew, Save, Upload } from "@carbon/icons-react";
import { FormattedMessage, useIntl } from "react-intl";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import "./DeliveryReadinessWorkspace.css";

const STORAGE_KEY = "openelis.cn.delivery-readiness.v1";
const defaultConfig = {
  his: {
    protocol: "FHIR_R4",
    direction: "BIDIRECTIONAL",
    endpoint: "",
    auth: "OAUTH2",
    timeout: 15,
    retry: 3,
  },
  analyzer: {
    transport: "TCP_SERVER",
    protocol: "ASTM",
    address: "0.0.0.0",
    port: 5000,
    encoding: "UTF-8",
    ackTimeout: 10,
  },
  print: {
    reportPaper: "A4",
    labelSize: "50x30",
    reportPrinter: "",
    labelPrinter: "",
    autoPrint: false,
  },
  policy: {
    criticalAckMinutes: 10,
    routineTatMinutes: 480,
    emergencyTatMinutes: 60,
    dualReview: true,
  },
  checklist: {
    roles: false,
    critical: false,
    reports: false,
    interfaces: false,
    backup: false,
    uat: false,
  },
};

const loadDraft = () => {
  try {
    return {
      ...defaultConfig,
      ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"),
    };
  } catch (_error) {
    return defaultConfig;
  }
};

const sections = [
  ["his", "delivery.section.his"],
  ["analyzer", "delivery.section.analyzer"],
  ["print", "delivery.section.print"],
  ["policy", "delivery.section.policy"],
];

export const validateDeliveryConfig = (config) => ({
  his: Boolean(
    config.his.endpoint &&
    /^https?:\/\//i.test(config.his.endpoint) &&
    config.his.timeout > 0,
  ),
  analyzer: Boolean(
    config.analyzer.address &&
    Number(config.analyzer.port) > 0 &&
    Number(config.analyzer.port) <= 65535,
  ),
  print: Boolean(config.print.reportPaper && config.print.labelSize),
  policy: Boolean(
    config.policy.criticalAckMinutes > 0 &&
    config.policy.routineTatMinutes > 0 &&
    config.policy.emergencyTatMinutes > 0,
  ),
});

export default function DeliveryReadinessWorkspace() {
  const intl = useIntl();
  const inputRef = useRef(null);
  const [active, setActive] = useState("his");
  const [config, setConfig] = useState(loadDraft);
  const [savedAt, setSavedAt] = useState(null);
  const [simulation, setSimulation] = useState(null);
  const [importError, setImportError] = useState(false);
  const validation = useMemo(() => validateDeliveryConfig(config), [config]);
  const checklistDone = Object.values(config.checklist).filter(Boolean).length;
  const configured = Object.values(validation).filter(Boolean).length;

  const update = (section, key, value) =>
    setConfig((current) => ({
      ...current,
      [section]: { ...current[section], [key]: value },
    }));
  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    setSavedAt(new Date());
  };
  const reset = () => {
    setConfig(defaultConfig);
    setSimulation(null);
    localStorage.removeItem(STORAGE_KEY);
  };
  const simulate = () =>
    setSimulation({
      section: active,
      ok: validation[active],
      time: new Date(),
    });
  const exportConfig = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          { version: 1, exportedAt: new Date().toISOString(), config },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "openelis-cn-readiness.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const importConfig = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const value = parsed.config || parsed;
        setConfig({ ...defaultConfig, ...value });
        setImportError(false);
      } catch (_error) {
        setImportError(true);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  return (
    <div className="adminPageContent delivery-readiness">
      <PageBreadCrumb
        breadcrumbs={[
          { label: "home.label", link: "/" },
          { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
          {
            label: "workspace.delivery.title",
            link: "/MasterListsPage/deliveryReadiness",
          },
        ]}
      />
      <ProductPageHeader
        title={<FormattedMessage id="workspace.delivery.title" />}
        subtitle={<FormattedMessage id="workspace.delivery.subtitle" />}
        actions={
          <div className="delivery-readiness__actions">
            <input
              ref={inputRef}
              type="file"
              accept="application/json"
              hidden
              onChange={importConfig}
            />
            <Button
              kind="ghost"
              renderIcon={Upload}
              onClick={() => inputRef.current?.click()}
            >
              <FormattedMessage id="delivery.import" />
            </Button>
            <Button kind="ghost" renderIcon={Download} onClick={exportConfig}>
              <FormattedMessage id="delivery.export" />
            </Button>
            <Button renderIcon={Save} onClick={save}>
              <FormattedMessage id="delivery.save" />
            </Button>
          </div>
        }
      />
      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title={intl.formatMessage({ id: "delivery.mock.title" })}
        subtitle={intl.formatMessage({ id: "delivery.mock.body" })}
      />
      {importError && (
        <InlineNotification
          kind="error"
          lowContrast
          title={intl.formatMessage({ id: "delivery.import.error" })}
        />
      )}
      <section
        className="delivery-readiness__overview"
        aria-label={intl.formatMessage({ id: "delivery.overview" })}
      >
        <div>
          <strong>{configured}/4</strong>
          <span>
            <FormattedMessage id="delivery.configured" />
          </span>
        </div>
        <div>
          <strong>{checklistDone}/6</strong>
          <span>
            <FormattedMessage id="delivery.checklistProgress" />
          </span>
        </div>
        <div>
          <strong>{savedAt ? savedAt.toLocaleTimeString() : "—"}</strong>
          <span>
            <FormattedMessage id="delivery.lastSaved" />
          </span>
        </div>
        <Button kind="tertiary" size="sm" renderIcon={Renew} onClick={reset}>
          <FormattedMessage id="delivery.reset" />
        </Button>
      </section>
      <nav
        className="delivery-readiness__tabs"
        aria-label={intl.formatMessage({ id: "delivery.sections" })}
      >
        {sections.map(([id, label]) => (
          <button
            key={id}
            className={active === id ? "is-active" : ""}
            onClick={() => {
              setActive(id);
              setSimulation(null);
            }}
          >
            <FormattedMessage id={label} />
            <Tag type={validation[id] ? "green" : "gray"}>
              <FormattedMessage
                id={validation[id] ? "delivery.valid" : "delivery.incomplete"}
              />
            </Tag>
          </button>
        ))}
      </nav>

      <section className="delivery-readiness__panel">
        {active === "his" && (
          <>
            <header>
              <div>
                <h2>
                  <FormattedMessage id="delivery.his.title" />
                </h2>
                <p>
                  <FormattedMessage id="delivery.his.help" />
                </p>
              </div>
              <Tag type="purple">
                <FormattedMessage id="delivery.mockMode" />
              </Tag>
            </header>
            <div className="delivery-readiness__form">
              <Select
                id="delivery-his-protocol"
                labelText={intl.formatMessage({ id: "delivery.protocol" })}
                value={config.his.protocol}
                onChange={(e) => update("his", "protocol", e.target.value)}
              >
                <SelectItem value="FHIR_R4" text="FHIR R4" />
                <SelectItem value="HL7_V2" text="HL7 v2" />
                <SelectItem value="REST_JSON" text="REST JSON" />
              </Select>
              <Select
                id="delivery-his-direction"
                labelText={intl.formatMessage({ id: "delivery.direction" })}
                value={config.his.direction}
                onChange={(e) => update("his", "direction", e.target.value)}
              >
                <SelectItem
                  value="BIDIRECTIONAL"
                  text={intl.formatMessage({ id: "delivery.direction.bi" })}
                />
                <SelectItem
                  value="INBOUND"
                  text={intl.formatMessage({ id: "delivery.direction.in" })}
                />
                <SelectItem
                  value="OUTBOUND"
                  text={intl.formatMessage({ id: "delivery.direction.out" })}
                />
              </Select>
              <TextInput
                id="delivery-his-endpoint"
                labelText={intl.formatMessage({ id: "delivery.endpoint" })}
                placeholder="https://his.example.org/fhir"
                value={config.his.endpoint}
                onChange={(e) => update("his", "endpoint", e.target.value)}
              />
              <Select
                id="delivery-his-auth"
                labelText={intl.formatMessage({ id: "delivery.auth" })}
                value={config.his.auth}
                onChange={(e) => update("his", "auth", e.target.value)}
              >
                <SelectItem value="OAUTH2" text="OAuth 2.0" />
                <SelectItem value="BASIC" text="Basic" />
                <SelectItem value="MTLS" text="mTLS" />
                <SelectItem
                  value="NONE"
                  text={intl.formatMessage({ id: "delivery.none" })}
                />
              </Select>
              <NumberInput
                id="delivery-his-timeout"
                label={intl.formatMessage({ id: "delivery.timeout" })}
                min={1}
                max={120}
                value={config.his.timeout}
                onChange={(_e, state) =>
                  update("his", "timeout", Number(state.value))
                }
              />
              <NumberInput
                id="delivery-his-retry"
                label={intl.formatMessage({ id: "delivery.retry" })}
                min={0}
                max={10}
                value={config.his.retry}
                onChange={(_e, state) =>
                  update("his", "retry", Number(state.value))
                }
              />
            </div>
          </>
        )}
        {active === "analyzer" && (
          <>
            <header>
              <div>
                <h2>
                  <FormattedMessage id="delivery.analyzer.title" />
                </h2>
                <p>
                  <FormattedMessage id="delivery.analyzer.help" />
                </p>
              </div>
              <Tag type="purple">
                <FormattedMessage id="delivery.mockMode" />
              </Tag>
            </header>
            <div className="delivery-readiness__form">
              <Select
                id="delivery-analyzer-protocol"
                labelText={intl.formatMessage({ id: "delivery.protocol" })}
                value={config.analyzer.protocol}
                onChange={(e) => update("analyzer", "protocol", e.target.value)}
              >
                <SelectItem value="ASTM" text="ASTM E1381/E1394" />
                <SelectItem value="HL7" text="HL7 v2" />
                <SelectItem
                  value="FILE"
                  text={intl.formatMessage({ id: "delivery.fileMode" })}
                />
              </Select>
              <Select
                id="delivery-analyzer-transport"
                labelText={intl.formatMessage({ id: "delivery.transport" })}
                value={config.analyzer.transport}
                onChange={(e) =>
                  update("analyzer", "transport", e.target.value)
                }
              >
                <SelectItem value="TCP_SERVER" text="TCP Server" />
                <SelectItem value="TCP_CLIENT" text="TCP Client" />
                <SelectItem value="SERIAL" text="Serial" />
                <SelectItem
                  value="FILE"
                  text={intl.formatMessage({ id: "delivery.fileMode" })}
                />
              </Select>
              <TextInput
                id="delivery-analyzer-address"
                labelText={intl.formatMessage({ id: "delivery.address" })}
                value={config.analyzer.address}
                onChange={(e) => update("analyzer", "address", e.target.value)}
              />
              <NumberInput
                id="delivery-analyzer-port"
                label={intl.formatMessage({ id: "delivery.port" })}
                min={1}
                max={65535}
                value={config.analyzer.port}
                onChange={(_e, state) =>
                  update("analyzer", "port", Number(state.value))
                }
              />
              <Select
                id="delivery-analyzer-encoding"
                labelText={intl.formatMessage({ id: "delivery.encoding" })}
                value={config.analyzer.encoding}
                onChange={(e) => update("analyzer", "encoding", e.target.value)}
              >
                <SelectItem value="UTF-8" text="UTF-8" />
                <SelectItem value="GB18030" text="GB18030" />
                <SelectItem value="ASCII" text="ASCII" />
              </Select>
              <NumberInput
                id="delivery-analyzer-ack"
                label={intl.formatMessage({ id: "delivery.ackTimeout" })}
                min={1}
                max={60}
                value={config.analyzer.ackTimeout}
                onChange={(_e, state) =>
                  update("analyzer", "ackTimeout", Number(state.value))
                }
              />
            </div>
          </>
        )}
        {active === "print" && (
          <>
            <header>
              <div>
                <h2>
                  <FormattedMessage id="delivery.print.title" />
                </h2>
                <p>
                  <FormattedMessage id="delivery.print.help" />
                </p>
              </div>
            </header>
            <div className="delivery-readiness__form">
              <Select
                id="delivery-report-paper"
                labelText={intl.formatMessage({ id: "delivery.reportPaper" })}
                value={config.print.reportPaper}
                onChange={(e) => update("print", "reportPaper", e.target.value)}
              >
                <SelectItem value="A4" text="A4" />
                <SelectItem value="A5" text="A5" />
                <SelectItem value="LETTER" text="Letter" />
              </Select>
              <Select
                id="delivery-label-size"
                labelText={intl.formatMessage({ id: "delivery.labelSize" })}
                value={config.print.labelSize}
                onChange={(e) => update("print", "labelSize", e.target.value)}
              >
                <SelectItem value="50x30" text="50 × 30 mm" />
                <SelectItem value="60x40" text="60 × 40 mm" />
                <SelectItem value="80x50" text="80 × 50 mm" />
              </Select>
              <TextInput
                id="delivery-report-printer"
                labelText={intl.formatMessage({ id: "delivery.reportPrinter" })}
                placeholder={intl.formatMessage({ id: "delivery.optional" })}
                value={config.print.reportPrinter}
                onChange={(e) =>
                  update("print", "reportPrinter", e.target.value)
                }
              />
              <TextInput
                id="delivery-label-printer"
                labelText={intl.formatMessage({ id: "delivery.labelPrinter" })}
                placeholder={intl.formatMessage({ id: "delivery.optional" })}
                value={config.print.labelPrinter}
                onChange={(e) =>
                  update("print", "labelPrinter", e.target.value)
                }
              />
              <Toggle
                id="delivery-auto-print"
                labelText={intl.formatMessage({ id: "delivery.autoPrint" })}
                toggled={config.print.autoPrint}
                onToggle={(value) => update("print", "autoPrint", value)}
              />
            </div>
            <div className="delivery-readiness__preview">
              <div className="delivery-readiness__report">
                <span>检验报告</span>
                <strong>LAB-2026-0001</strong>
                <hr />
                <p>示例项目　12.3 mmol/L　↑</p>
              </div>
              <div className="delivery-readiness__label">
                <strong>LAB-2026-0001</strong>
                <span>张** · 血清</span>
                <i>|||| ||| ||||</i>
              </div>
            </div>
          </>
        )}
        {active === "policy" && (
          <>
            <header>
              <div>
                <h2>
                  <FormattedMessage id="delivery.policy.title" />
                </h2>
                <p>
                  <FormattedMessage id="delivery.policy.help" />
                </p>
              </div>
            </header>
            <div className="delivery-readiness__form">
              <NumberInput
                id="delivery-critical-minutes"
                label={intl.formatMessage({ id: "delivery.criticalMinutes" })}
                min={1}
                max={120}
                value={config.policy.criticalAckMinutes}
                onChange={(_e, state) =>
                  update("policy", "criticalAckMinutes", Number(state.value))
                }
              />
              <NumberInput
                id="delivery-routine-tat"
                label={intl.formatMessage({ id: "delivery.routineTat" })}
                min={1}
                max={2880}
                value={config.policy.routineTatMinutes}
                onChange={(_e, state) =>
                  update("policy", "routineTatMinutes", Number(state.value))
                }
              />
              <NumberInput
                id="delivery-emergency-tat"
                label={intl.formatMessage({ id: "delivery.emergencyTat" })}
                min={1}
                max={1440}
                value={config.policy.emergencyTatMinutes}
                onChange={(_e, state) =>
                  update("policy", "emergencyTatMinutes", Number(state.value))
                }
              />
              <Toggle
                id="delivery-dual-review"
                labelText={intl.formatMessage({ id: "delivery.dualReview" })}
                toggled={config.policy.dualReview}
                onToggle={(value) => update("policy", "dualReview", value)}
              />
            </div>
            <div className="delivery-readiness__checklist">
              <h3>
                <FormattedMessage id="delivery.checklist" />
              </h3>
              {Object.keys(config.checklist).map((key) => (
                <Checkbox
                  key={key}
                  id={`delivery-check-${key}`}
                  labelText={intl.formatMessage({
                    id: `delivery.check.${key}`,
                  })}
                  checked={config.checklist[key]}
                  onChange={(_e, state) =>
                    update("checklist", key, state.checked)
                  }
                />
              ))}
            </div>
          </>
        )}
        <footer>
          <div>
            {simulation?.section === active && (
              <InlineNotification
                kind={simulation.ok ? "success" : "warning"}
                lowContrast
                hideCloseButton
                title={intl.formatMessage({
                  id: simulation.ok
                    ? "delivery.simulation.ok"
                    : "delivery.simulation.failed",
                })}
                subtitle={simulation.time.toLocaleTimeString()}
              />
            )}
          </div>
          <Button kind="tertiary" renderIcon={Play} onClick={simulate}>
            <FormattedMessage id="delivery.simulate" />
          </Button>
        </footer>
      </section>
    </div>
  );
}
