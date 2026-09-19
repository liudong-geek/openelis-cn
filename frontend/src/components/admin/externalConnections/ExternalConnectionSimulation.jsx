import React, { useMemo, useState } from "react";
import {
  Button,
  CodeSnippet,
  ComposedModal,
  InlineNotification,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Tag,
  TextInput,
  Tile,
} from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import "./ExternalConnectionSimulation.css";

export const EXTERNAL_SIMULATION_SCENARIOS = {
  HIS_HL7_RESULT: {
    labelId: "externalconnections.simulation.scenario.hisResult",
    purposeId: "externalconnections.simulation.scenario.hisResult.purpose",
    expectedId: "externalconnections.simulation.scenario.hisResult.expected",
    protocol: "HL7 v2.5 ORU^R01",
    method: "POST",
    endpoint: "https://his.example.local/api/lab/results",
    contentType: "application/hl7-v2",
    payload:
      "MSH|^~\\&|LIS-SIM|LAB|HIS-SIM|HOSPITAL|20260919143000||ORU^R01|SIM-HIS-001|P|2.5\rPID|1||SIM-PATIENT-001||ZHANG^TEST\rOBR|1|SIM-ORDER-001||GLU^Glucose\rOBX|1|NM|GLU^Glucose||5.6|mmol/L|3.9-6.1|N|||F",
  },
  FHIR_OBSERVATION: {
    labelId: "externalconnections.simulation.scenario.fhirObservation",
    purposeId:
      "externalconnections.simulation.scenario.fhirObservation.purpose",
    expectedId:
      "externalconnections.simulation.scenario.fhirObservation.expected",
    protocol: "FHIR R4",
    method: "POST",
    endpoint: "https://fhir.example.local/fhir/Observation",
    contentType: "application/fhir+json",
    payload: JSON.stringify(
      {
        resourceType: "Observation",
        id: "SIM-OBS-001",
        status: "final",
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "2345-7",
              display: "Glucose [Mass/volume] in Serum or Plasma",
            },
          ],
        },
        subject: { reference: "Patient/SIM-PATIENT-001" },
        valueQuantity: { value: 5.6, unit: "mmol/L" },
      },
      null,
      2,
    ),
  },
  CRITICAL_VALUE_WEBHOOK: {
    labelId: "externalconnections.simulation.scenario.criticalWebhook",
    purposeId:
      "externalconnections.simulation.scenario.criticalWebhook.purpose",
    expectedId:
      "externalconnections.simulation.scenario.criticalWebhook.expected",
    protocol: "HTTPS JSON",
    method: "POST",
    endpoint: "https://his.example.local/api/lab/critical-values",
    contentType: "application/json",
    payload: JSON.stringify(
      {
        eventId: "SIM-CRITICAL-001",
        patientId: "SIM-PATIENT-001",
        accessionNumber: "SIM-ORDER-001",
        testCode: "K",
        value: 7.2,
        unit: "mmol/L",
        flag: "HH",
      },
      null,
      2,
    ),
  },
};

function payloadIsValid(scenario) {
  if (scenario.contentType.includes("json")) {
    try {
      JSON.parse(scenario.payload);
      return true;
    } catch {
      return false;
    }
  }
  return scenario.payload.includes("MSH|") && scenario.payload.includes("OBX|");
}

function payloadIsSynthetic(scenario) {
  return scenario.payload.includes("SIM-");
}

export default function ExternalConnectionSimulation({ open, onClose }) {
  const intl = useIntl();
  const [scenarioKey, setScenarioKey] = useState("HIS_HL7_RESULT");
  const [authentication, setAuthentication] = useState("NONE");
  const [retryPolicy, setRetryPolicy] = useState("NONE");
  const [result, setResult] = useState(null);
  const scenario = EXTERNAL_SIMULATION_SCENARIOS[scenarioKey];

  const requestPreview = useMemo(
    () =>
      [
        `${scenario.method} ${scenario.endpoint}`,
        `Content-Type: ${scenario.contentType}`,
        `Authentication: ${authentication}`,
        `Retry-Policy: ${retryPolicy}`,
        "",
        scenario.payload,
      ].join("\n"),
    [authentication, retryPolicy, scenario],
  );

  const resetResult = () => setResult(null);

  const runSimulation = () => {
    const checks = [
      {
        id: "externalconnections.simulation.check.endpoint",
        passed: /^https:\/\//.test(scenario.endpoint),
      },
      {
        id: "externalconnections.simulation.check.payload",
        passed: payloadIsValid(scenario),
      },
      {
        id: "externalconnections.simulation.check.synthetic",
        passed: payloadIsSynthetic(scenario),
      },
      {
        id: "externalconnections.simulation.check.noSend",
        passed: true,
      },
    ];
    setResult({ checks, passed: checks.every((check) => check.passed) });
  };

  return (
    <ComposedModal
      className="external-simulation"
      open={open}
      onClose={onClose}
      preventCloseOnClickOutside
      size="lg"
      data-testid="external-connection-simulation"
    >
      <ModalHeader
        title={intl.formatMessage({
          id: "externalconnections.simulation.title",
        })}
        label={intl.formatMessage({
          id: "externalconnections.simulation.subtitle",
        })}
      />
      <ModalBody className="external-simulation__body">
        <InlineNotification
          kind="info"
          title={intl.formatMessage({
            id: "externalconnections.simulation.safety.title",
          })}
          subtitle={intl.formatMessage({
            id: "externalconnections.simulation.safety.subtitle",
          })}
          lowContrast
          hideCloseButton
          data-testid="external-simulation-safety"
        />

        <section className="external-simulation__section">
          <div className="external-simulation__section-heading">
            <span>1</span>
            <div>
              <h3>
                <FormattedMessage id="externalconnections.simulation.configure.title" />
              </h3>
              <p>
                <FormattedMessage id="externalconnections.simulation.configure.subtitle" />
              </p>
            </div>
          </div>
          <div className="external-simulation__controls">
            <Select
              id="external-simulation-scenario"
              labelText={intl.formatMessage({
                id: "externalconnections.simulation.scenario",
              })}
              value={scenarioKey}
              onChange={(event) => {
                setScenarioKey(event.target.value);
                resetResult();
              }}
              data-testid="external-simulation-scenario"
            >
              {Object.entries(EXTERNAL_SIMULATION_SCENARIOS).map(
                ([key, option]) => (
                  <SelectItem
                    key={key}
                    value={key}
                    text={intl.formatMessage({ id: option.labelId })}
                  />
                ),
              )}
            </Select>
            <Select
              id="external-simulation-authentication"
              labelText={intl.formatMessage({
                id: "externalconnections.simulation.authentication",
              })}
              value={authentication}
              onChange={(event) => {
                setAuthentication(event.target.value);
                resetResult();
              }}
              data-testid="external-simulation-authentication"
            >
              <SelectItem value="NONE" text="NONE" />
              <SelectItem value="BASIC" text="BASIC" />
              <SelectItem value="BEARER" text="BEARER TOKEN" />
              <SelectItem value="MTLS" text="mTLS" />
            </Select>
            <Select
              id="external-simulation-retry"
              labelText={intl.formatMessage({
                id: "externalconnections.simulation.retryPolicy",
              })}
              value={retryPolicy}
              onChange={(event) => {
                setRetryPolicy(event.target.value);
                resetResult();
              }}
              data-testid="external-simulation-retry"
            >
              <SelectItem
                value="NONE"
                text={intl.formatMessage({
                  id: "externalconnections.simulation.retry.none",
                })}
              />
              <SelectItem
                value="3_TIMES_EXPONENTIAL"
                text={intl.formatMessage({
                  id: "externalconnections.simulation.retry.exponential",
                })}
              />
              <SelectItem
                value="MANUAL_REVIEW"
                text={intl.formatMessage({
                  id: "externalconnections.simulation.retry.manual",
                })}
              />
            </Select>
          </div>

          <Tile
            className="external-simulation__scenario"
            data-testid="external-simulation-goal"
          >
            <div>
              <strong>
                <FormattedMessage id="externalconnections.simulation.goal" />
              </strong>
              <p>{intl.formatMessage({ id: scenario.purposeId })}</p>
            </div>
            <div>
              <strong>
                <FormattedMessage id="externalconnections.simulation.expected" />
              </strong>
              <p>{intl.formatMessage({ id: scenario.expectedId })}</p>
            </div>
          </Tile>
        </section>

        <section className="external-simulation__section">
          <div className="external-simulation__section-heading">
            <span>2</span>
            <div>
              <h3>
                <FormattedMessage id="externalconnections.simulation.preview.title" />
              </h3>
              <p>
                <FormattedMessage id="externalconnections.simulation.preview.subtitle" />
              </p>
            </div>
          </div>
          <div className="external-simulation__metadata">
            <TextInput
              id="external-simulation-endpoint"
              labelText={intl.formatMessage({
                id: "externalconnections.simulation.endpointTemplate",
              })}
              value={scenario.endpoint}
              readOnly
              data-testid="external-simulation-endpoint"
            />
            <TextInput
              id="external-simulation-protocol"
              labelText={intl.formatMessage({
                id: "externalconnections.simulation.protocol",
              })}
              value={scenario.protocol}
              readOnly
            />
          </div>

          <div className="external-simulation__preview">
            <h4>
              <FormattedMessage id="externalconnections.simulation.requestPreview" />
            </h4>
            <CodeSnippet type="multi" feedback="已复制到剪贴板">
              {requestPreview}
            </CodeSnippet>
          </div>
        </section>

        {result && (
          <Tile
            className="external-simulation__result"
            data-testid="external-simulation-result"
          >
            <div className="external-simulation__result-heading">
              <strong>
                <FormattedMessage id="externalconnections.simulation.result" />
              </strong>
              <Tag
                type={result.passed ? "green" : "warm-gray"}
                data-testid="external-simulation-result-status"
              >
                <FormattedMessage
                  id={
                    result.passed
                      ? "externalconnections.simulation.result.passed"
                      : "externalconnections.simulation.result.attention"
                  }
                />
              </Tag>
            </div>
            <ul>
              {result.checks.map((check) => (
                <li key={check.id}>
                  <Tag type={check.passed ? "green" : "red"} size="sm">
                    <FormattedMessage
                      id={
                        check.passed
                          ? "externalconnections.simulation.check.pass"
                          : "externalconnections.simulation.check.fail"
                      }
                    />
                  </Tag>
                  <FormattedMessage id={check.id} />
                </li>
              ))}
            </ul>
          </Tile>
        )}
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={onClose}>
          <FormattedMessage id="button.close" />
        </Button>
        <Button
          kind="primary"
          onClick={runSimulation}
          data-testid="external-simulation-run"
        >
          <FormattedMessage id="externalconnections.simulation.run" />
        </Button>
      </ModalFooter>
    </ComposedModal>
  );
}
