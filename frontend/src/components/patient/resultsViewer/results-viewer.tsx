import React, { useContext, useState, useEffect } from "react";
import {
  Button,
  Heading,
  Grid,
  Column,
  Section,
  InlineLoading,
  InlineNotification,
  Breadcrumb,
  BreadcrumbItem,
  Stack,
  Tag,
  Tile,
} from "@carbon/react";
import { DocumentPdf } from "@carbon/react/icons";
import { EmptyState, ErrorState } from "./commons";
import { useGetManyObstreeData } from "./grouped-timeline";
import "./results-viewer.styles.scss";
import { Link, useLocation, useParams } from "react-router-dom";
import { listReturnLocation } from "../../common/listWorkspace";
import TreeViewWrapper from "./tree-view";
import { FormattedMessage, useIntl } from "react-intl";
import config from "../../../config.json";
import { getFromOpenElisServer, hasRole, Roles } from "../../utils/Utils";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import PatientReportReleasePanel from "./PatientReportReleasePanel";

interface ResultsViewerProps {
  basePath: string;
  patientId?: string;
  loading?: boolean;
  roots?: unknown[];
}

interface Patient {
  firstName?: string;
  lastName?: string;
  gender?: string;
  birthDateForDisplay?: string;
  birthdate?: string;
  dob?: string;
  patientID?: string;
  stNumber?: string;
  STnumber?: string;
  subjectNumber?: string;
  nationalId?: string;
  patientPK?: string | number;
}
const RoutedResultsViewer: React.FC<ResultsViewerProps> = () => {
  const { patientId } = useParams();
  const location = useLocation();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [patientLoading, setPatientLoading] = useState(true);
  const [patientError, setPatientError] = useState<Error | null>(null);
  const { userSessionDetails } = useContext(UserSessionDetailsContext) as {
    userSessionDetails?: { roles?: string[] };
  };

  useEffect(() => {
    const controller = new AbortController();
    setPatient(null);
    setPatientError(null);
    setPatientLoading(true);

    getFromOpenElisServer(
      "/rest/patient-details?patientID=" + patientId,
      (response: Patient | undefined) => {
        if (!response || !response.patientPK) {
          setPatientError(new Error("Patient details request failed"));
          setPatientLoading(false);
          return;
        }

        setPatient(response);
        setPatientLoading(false);
      },
      controller.signal,
    );

    return () => controller.abort();
  }, [patientId]);
  const intl = useIntl();
  const canPreviewReport =
    hasRole(userSessionDetails, Roles.RESULTS) ||
    hasRole(userSessionDetails, Roles.REPORTS);
  const canManageReport = hasRole(userSessionDetails, Roles.REPORTS);
  const reportPreviewUrl = `${config.serverBaseUrl}/rest/reports/patient-results.pdf?${new URLSearchParams(
    { patientId: String(patientId || "") },
  ).toString()}`;

  const { roots, loading, error } = useGetManyObstreeData(patientId);

  if (error || patientError) {
    return (
      <ErrorState
        error={error || patientError}
        headerTitle={intl.formatMessage({
          id: "patient.resultsViewer.error.title",
        })}
      />
    );
  }

  if (loading || patientLoading) {
    return (
      <Grid fullWidth={true}>
        <Column lg={16} md={8} sm={4}>
          <InlineLoading
            description={intl.formatMessage({
              id: "patient.resultsViewer.loading",
            })}
          />
        </Column>
      </Grid>
    );
  }

  return (
    <>
      <Grid fullWidth={true}>
        <Column lg={16} md={8} sm={4}>
          <Breadcrumb>
            <BreadcrumbItem>
              <Link to="/">{intl.formatMessage({ id: "home.label" })}</Link>
            </BreadcrumbItem>
            <BreadcrumbItem>
              <Link
                to={listReturnLocation(location.state, "/PatientManagement")}
              >
                {intl.formatMessage({ id: "patient.management.title" })}
              </Link>
            </BreadcrumbItem>
          </Breadcrumb>
        </Column>
      </Grid>
      <Grid fullWidth={true} className="patient-results-page-header">
        <Column lg={canPreviewReport ? 12 : 16} md={6} sm={4}>
          <Section>
            <Section>
              <Heading>
                <FormattedMessage id="patient.history.title" />
              </Heading>
            </Section>
          </Section>
        </Column>
        {canPreviewReport && (
          <Column lg={4} md={2} sm={4} className="patient-results-page-actions">
            <Button
              as="a"
              href={reportPreviewUrl}
              target="_blank"
              rel="noreferrer"
              renderIcon={DocumentPdf}
            >
              <FormattedMessage
                id="patient.report.previewPdf"
                defaultMessage="预览中文检验报告"
              />
            </Button>
          </Column>
        )}
      </Grid>
      {patient && <PatientIdentity patient={patient} />}
      {canPreviewReport && patientId && (
        <PatientReportReleasePanel
          patientId={String(patientId)}
          canManage={canManageReport}
        />
      )}

      {roots?.length ? (
        <Grid fullWidth={true} className="orderLegendBody">
          <Column lg={16} md={8} sm={4}>
            <ResultsViewer
              patientId={patientId}
              basePath={config.serverBaseUrl}
              loading={false}
              roots={roots}
            />
          </Column>
        </Grid>
      ) : (
        <Grid fullWidth={true} className="orderLegendBody">
          <Column lg={16}>
            <EmptyState
              headerTitle={intl.formatMessage({ id: "patient.history.title" })}
              displayText={intl.formatMessage({
                id: "label.test.resultsData",
              })}
            />
          </Column>
        </Grid>
      )}
    </>
  );
};

const PatientIdentity: React.FC<{ patient: Patient }> = ({ patient }) => {
  const intl = useIntl();
  const notRecorded = intl.formatMessage({ id: "patient.merge.notRecorded" });
  const name = [patient.lastName, patient.firstName].filter(Boolean).join(" ");
  const identifier =
    patient.patientID ||
    patient.stNumber ||
    patient.STnumber ||
    patient.subjectNumber ||
    patient.nationalId;
  const dob =
    patient.birthDateForDisplay || patient.birthdate || patient.dob || null;
  const sex =
    patient.gender === "M"
      ? intl.formatMessage({ id: "patient.male" })
      : patient.gender === "F"
        ? intl.formatMessage({ id: "patient.female" })
        : notRecorded;

  return (
    <Grid fullWidth={true}>
      <Column lg={16} md={8} sm={4}>
        <Tile>
          <Stack gap={4}>
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title={intl.formatMessage({ id: "patient.label.info" })}
              subtitle={intl.formatMessage({
                id: "patient.history.identity.help",
                defaultMessage:
                  "Verify the patient's name, identifier, date of birth, and sex before using these results.",
              })}
            />
            <Grid condensed>
              <Column lg={4} md={4} sm={4}>
                <strong>
                  <FormattedMessage id="patient.label.name" />
                </strong>
                <p>{name || notRecorded}</p>
              </Column>
              <Column lg={4} md={4} sm={4}>
                <strong>
                  <FormattedMessage id="patient.id" />
                </strong>
                <p>
                  {identifier ? (
                    <Tag type="blue">{identifier}</Tag>
                  ) : (
                    notRecorded
                  )}
                </p>
              </Column>
              <Column lg={4} md={4} sm={4}>
                <strong>
                  <FormattedMessage id="patient.dob" />
                </strong>
                <p>{dob || notRecorded}</p>
              </Column>
              <Column lg={4} md={4} sm={4}>
                <strong>
                  <FormattedMessage id="patient.gender" />
                </strong>
                <p>{sex}</p>
              </Column>
            </Grid>
          </Stack>
        </Tile>
      </Column>
    </Grid>
  );
};

const ResultsViewer: React.FC<ResultsViewerProps> = ({
  patientId,
  basePath,
  roots = [],
}) => {
  const { type, testUuid } = useParams();
  return (
    <div className="resultsContainer">
      <div className="flex">
        <TreeViewWrapper
          patientUuid={patientId || ""}
          basePath={basePath}
          type={type}
          expanded={true}
          testUuid={testUuid}
          roots={roots}
          loading={false}
        />
      </div>
    </div>
  );
};

export default RoutedResultsViewer;
