/**
 * QCDashboard Component
 *
 * Main dashboard with summary tiles and tabbed layout:
 * - Summary tiles (In Control, Warning, Out of Control, Pass Rate)
 * - Instruments tab (DataTable with search + pagination)
 * - Alerts tab (active violations + acknowledged table)
 *
 * Auto-refreshes every 5 minutes.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Loading,
  InlineNotification,
  Button,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
} from "@carbon/react";
import { Renew } from "@carbon/icons-react";
import { useIntl } from "react-intl";
import { getFromOpenElisServer } from "../../utils/Utils";
import QCSummaryTiles from "./QCSummaryTiles";
import InstrumentsTab from "./InstrumentsTab";
import AlertsTab from "./AlertsTab";
import PageTitle from "../../common/PageTitle/PageTitle";
import "./QCDashboard.css";

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

const EMPTY_SUMMARY = {
  totalInstruments: 0,
  compliantInstruments: 0,
  warningInstruments: 0,
  nonCompliantInstruments: 0,
};

const normalizeSummary = (response) => {
  const value = response?.data ?? response;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const hasSummaryField = Object.keys(EMPTY_SUMMARY).some((field) =>
    Object.prototype.hasOwnProperty.call(value, field),
  );
  if (!hasSummaryField) return null;

  return { ...EMPTY_SUMMARY, ...value };
};

const normalizeInstruments = (response) => {
  const value = response?.data ?? response;
  return Array.isArray(value)
    ? value.filter(
        (instrument) =>
          instrument &&
          typeof instrument === "object" &&
          !Array.isArray(instrument),
      )
    : null;
};

const QCDashboard = () => {
  const intl = useIntl();
  const intlRef = useRef(intl);
  intlRef.current = intl;

  const [summary, setSummary] = useState(null);
  const [instruments, setInstruments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const requestIdRef = useRef(0);

  const loadDashboardData = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setRefreshVersion((version) => version + 1);

    let completed = 0;
    const total = 2;
    let hasError = false;

    const checkDone = () => {
      if (requestId !== requestIdRef.current) return;
      completed++;
      if (completed >= total) {
        setLoading(false);
        setInitialLoadComplete(true);
        if (!hasError) {
          setLastUpdated(new Date());
        }
      }
    };

    // Load summary data
    getFromOpenElisServer("/rest/qc/dashboard/summary", (response) => {
      if (requestId !== requestIdRef.current) return;
      const nextSummary = normalizeSummary(response);
      if (nextSummary) {
        setSummary(nextSummary);
      } else {
        hasError = true;
        setError(
          intlRef.current.formatMessage({
            id: "qc.dashboard.error.loadFailed",
          }),
        );
      }
      checkDone();
    });

    // Load instruments data
    getFromOpenElisServer("/rest/qc/dashboard/instruments", (response) => {
      if (requestId !== requestIdRef.current) return;
      const nextInstruments = normalizeInstruments(response);
      if (nextInstruments) {
        setInstruments(nextInstruments);
      } else {
        hasError = true;
        setError(
          intlRef.current.formatMessage({
            id: "qc.dashboard.error.loadFailed",
          }),
        );
      }
      checkDone();
    });
  }, []);

  useEffect(() => {
    loadDashboardData();
    const intervalId = setInterval(loadDashboardData, REFRESH_INTERVAL);
    return () => {
      clearInterval(intervalId);
      requestIdRef.current++;
    };
  }, [loadDashboardData]);

  const handleRefresh = () => {
    loadDashboardData();
  };

  const formatLastUpdated = () => {
    if (!lastUpdated) return "";
    return intl.formatDate(lastUpdated, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="qc-dashboard" data-testid="qc-dashboard">
      {/* Header */}
      <div className="qc-dashboard-header" data-testid="qc-dashboard-header">
        <div className="qc-dashboard-header-title">
          <PageTitle
            breadcrumbs={[
              {
                label: intl.formatMessage({
                  id: "analyzer.page.hierarchy.root",
                }),
                link: "/analyzers",
              },
              {
                label: intl.formatMessage({ id: "qc.dashboard.title" }),
              },
            ]}
            subtitle={intl.formatMessage({ id: "qc.dashboard.subtitle" })}
          />
        </div>
        <div className="qc-dashboard-header-actions">
          {lastUpdated && (
            <span
              className="qc-dashboard-last-updated"
              data-testid="qc-dashboard-last-updated"
            >
              {intl.formatMessage({ id: "qc.dashboard.lastUpdated" })}:{" "}
              {formatLastUpdated()}
            </span>
          )}
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Renew}
            iconDescription={intl.formatMessage({
              id: "qc.dashboard.refresh",
            })}
            onClick={handleRefresh}
            disabled={loading}
            data-testid="qc-dashboard-refresh-button"
          >
            {intl.formatMessage({ id: "qc.dashboard.refresh" })}
          </Button>
        </div>
      </div>

      {/* Error notification */}
      {error && (
        <InlineNotification
          aria-label={intl.formatMessage({ id: "button.close" })}
          statusIconDescription={intl.formatMessage({
            id: "carbon.notification.error",
          })}
          kind="error"
          title={intl.formatMessage({ id: "qc.dashboard.error.title" })}
          subtitle={error}
          onClose={() => setError(null)}
          data-testid="qc-dashboard-error"
        />
      )}

      {!initialLoadComplete ? (
        <div
          className="qc-dashboard-loading"
          data-testid="qc-dashboard-loading"
          role="status"
          aria-live="polite"
        >
          <Loading
            description={intl.formatMessage({ id: "qc.dashboard.loading" })}
            withOverlay={false}
          />
          <p aria-hidden="true">
            {intl.formatMessage({ id: "qc.dashboard.loading" })}
          </p>
        </div>
      ) : (
        <>
          {/* Summary Tiles */}
          <QCSummaryTiles
            summary={summary || EMPTY_SUMMARY}
            loading={loading}
          />

          {/* Tabbed Content */}
          <Tabs>
            <TabList
              contained
              aria-label={intl.formatMessage({
                id: "qc.dashboard.tabs.ariaLabel",
              })}
            >
              <Tab data-testid="qc-tab-instruments">
                {intl.formatMessage({ id: "qc.dashboard.tab.instruments" })}
              </Tab>
              <Tab data-testid="qc-tab-alerts">
                {intl.formatMessage({ id: "qc.dashboard.tab.alerts" })}
              </Tab>
            </TabList>
            <TabPanels>
              <TabPanel>
                <InstrumentsTab instruments={instruments} loading={loading} />
              </TabPanel>
              <TabPanel>
                <AlertsTab refreshToken={refreshVersion} />
              </TabPanel>
            </TabPanels>
          </Tabs>
        </>
      )}
    </div>
  );
};

export default QCDashboard;
