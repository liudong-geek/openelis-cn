import React, { useContext, useEffect, useState } from "react";
import {
  Button,
  Form,
  InlineLoading,
  InlineNotification,
  Search,
  Tile,
} from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import { getFromOpenElisServer, postToOpenElisServer } from "../utils/Utils";
import { ConfigurationContext } from "../layout/Layout";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import "./LandingPage.css";

interface DepartmentOption {
  id: string;
  value: string;
}

interface LandingConfigurationContext {
  configurationProperties: {
    REQUIRE_LAB_UNIT_AT_LOGIN?: string;
  };
}

interface LandingUserSessionContext {
  userSessionDetails: {
    loginLabUnit?: string | boolean;
  };
}

const getSafeReturnPath = (): string => {
  if (!document.referrer) return "/";

  try {
    const referrer = new URL(document.referrer);
    if (
      referrer.origin !== window.location.origin ||
      referrer.pathname === "/landing"
    ) {
      return "/";
    }
    return `${referrer.pathname}${referrer.search}${referrer.hash}`;
  } catch (_error) {
    return "/";
  }
};

const LandingPage: React.FC = () => {
  const intl = useIntl();
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const { configurationProperties } = useContext(
    ConfigurationContext,
  ) as LandingConfigurationContext;
  const { userSessionDetails } = useContext(
    UserSessionDetailsContext,
  ) as LandingUserSessionContext;

  useEffect(() => {
    if (
      configurationProperties.REQUIRE_LAB_UNIT_AT_LOGIN === "false" ||
      userSessionDetails.loginLabUnit
    ) {
      window.location.replace(getSafeReturnPath());
      return;
    }

    getFromOpenElisServer("/rest/user-test-sections/ALL", (response) => {
      if (Array.isArray(response)) {
        setDepartments(response);
        setLoadFailed(false);
      } else {
        setDepartments([]);
        setLoadFailed(true);
      }
      setIsLoading(false);
    });
  }, [
    configurationProperties.REQUIRE_LAB_UNIT_AT_LOGIN,
    userSessionDetails.loginLabUnit,
  ]);

  const filteredDepartments = departments.filter((department) =>
    department.value.toLowerCase().includes(searchTerm.trim().toLowerCase()),
  );

  const handleContinue = () => {
    if (!selectedDepartment || isSaving) return;

    setIsSaving(true);
    setSaveFailed(false);
    postToOpenElisServer(
      `/rest/setUserLoginLabUnit/${encodeURIComponent(selectedDepartment)}`,
      {},
      (status) => {
        if (status >= 200 && status < 300) {
          window.location.replace(getSafeReturnPath());
          return;
        }
        setIsSaving(false);
        setSaveFailed(true);
      },
    );
  };

  return (
    <main className="landing-page" aria-labelledby="landing-page-title">
      <Tile className="landing-card">
        <header className="landing-heading">
          <span className="landing-kicker">
            <FormattedMessage id="landing.kicker" />
          </span>
          <h1 id="landing-page-title">
            <FormattedMessage id="landing.title" />
          </h1>
          <p>
            <FormattedMessage id="landing.subtitle" />
          </p>
        </header>

        {loadFailed && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={intl.formatMessage({ id: "landing.load.error.title" })}
            subtitle={intl.formatMessage({ id: "landing.load.error.message" })}
          />
        )}
        {saveFailed && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={intl.formatMessage({ id: "landing.save.error.title" })}
            subtitle={intl.formatMessage({ id: "landing.save.error.message" })}
          />
        )}

        <Form
          className="landing-form"
          onSubmit={(event) => {
            event.preventDefault();
            handleContinue();
          }}
        >
          <Search
            id="department-search"
            labelText={intl.formatMessage({ id: "landing.search.label" })}
            placeholder={intl.formatMessage({
              id: "landing.search.placeholder",
            })}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            disabled={isLoading || loadFailed}
          />

          <div
            className="department-list"
            role="listbox"
            aria-label={intl.formatMessage({ id: "landing.list.label" })}
          >
            {isLoading ? (
              <InlineLoading
                description={intl.formatMessage({ id: "landing.loading" })}
              />
            ) : filteredDepartments.length > 0 ? (
              filteredDepartments.map((department) => (
                <button
                  key={department.id}
                  type="button"
                  role="option"
                  aria-selected={selectedDepartment === department.id}
                  className={`department-option ${
                    selectedDepartment === department.id ? "is-selected" : ""
                  }`}
                  onClick={() => setSelectedDepartment(department.id)}
                >
                  <span>{department.value}</span>
                  <span className="department-option-state" aria-hidden="true">
                    {selectedDepartment === department.id ? "✓" : ""}
                  </span>
                </button>
              ))
            ) : (
              !loadFailed && (
                <p className="landing-empty">
                  <FormattedMessage id="landing.empty" />
                </p>
              )
            )}
          </div>

          <Button
            type="submit"
            className="landing-continue"
            disabled={!selectedDepartment || isSaving || loadFailed}
          >
            {isSaving ? (
              <FormattedMessage id="landing.saving" />
            ) : (
              <FormattedMessage id="landing.continue" />
            )}
          </Button>
        </Form>
      </Tile>
    </main>
  );
};

export default LandingPage;
