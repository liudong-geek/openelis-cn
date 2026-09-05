import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  createRef,
} from "react";
import config from "../config.json";
import "./Style.css";
import qs from "qs";
import { FormattedMessage, injectIntl } from "react-intl";
import { HardwareSecurityModule } from "@carbon/icons-react";
import {
  Form,
  Heading,
  TextInput,
  PasswordInput,
  Button,
  Stack,
  Loading,
} from "@carbon/react";
import { Formik } from "formik";
import { AlertDialog, NotificationKinds } from "./common/CustomNotification";
import UserSessionDetailsContext from "../UserSessionDetailsContext";
import { ConfigurationContext, NotificationContext } from "./layout/Layout";
import { getBranding } from "./utils/BrandingUtils";
import { getRequestLocale } from "./utils/LocaleUtils";

function Login(props) {
  const { notificationVisible, addNotification, setNotificationVisible } =
    useContext(NotificationContext);
  const { configurationProperties } = useContext(ConfigurationContext);

  const { userSessionDetails, refresh } = useContext(UserSessionDetailsContext);
  const [submitting, setSubmitting] = useState(false);
  const [samlRedirectInitiated, setSamlRedirectInitiated] = useState(false);
  const [loginLogoUrl, setLoginLogoUrl] = useState(null);
  const [logoVersion, setLogoVersion] = useState(0); // Version counter for cache-busting
  const userIsActiveRef = useRef(false); // Track if user is actively typing without triggering re-renders
  const activityResetTimerRef = useRef(null);
  const markUserActive = useCallback(() => {
    userIsActiveRef.current = true;
    if (activityResetTimerRef.current) {
      clearTimeout(activityResetTimerRef.current);
    }
    activityResetTimerRef.current = setTimeout(() => {
      userIsActiveRef.current = false;
    }, 5000);
  }, []);
  const firstInput = createRef();

  // Auto-redirect to SAML if configured to bypass login page
  useEffect(() => {
    if (
      configurationProperties?.useSaml === "true" &&
      configurationProperties?.useSamlLoginPage === "false" &&
      !samlRedirectInitiated &&
      !userSessionDetails.authenticated
    ) {
      // Mark as initiated to prevent multiple redirects
      setSamlRedirectInitiated(true);

      // Use full-page redirect instead of popup to avoid popup blockers
      // Add 'redirect=true' parameter to tell backend to redirect to dashboard after auth
      window.location.href =
        config.serverBaseUrl + "/LoginPage?useSAML=true&redirect=true";
    }
  }, [
    configurationProperties,
    samlRedirectInitiated,
    userSessionDetails.authenticated,
  ]);

  useEffect(() => {
    firstInput?.current?.focus();

    // Poll every 10s, but skip polling while the user is actively typing.
    // Using a ref (not state) keeps a single stable interval alive across renders.
    const interval = setInterval(() => {
      if (!userIsActiveRef.current) {
        checkLogin();
      }
    }, 1000 * 10);

    return () => {
      clearInterval(interval);
      if (activityResetTimerRef.current) {
        clearTimeout(activityResetTimerRef.current);
      }
    };
  }, []);

  // Load branding configuration for login logo
  // Colors are handled by App.js
  useEffect(() => {
    getBranding((response) => {
      if (response) {
        // Check useHeaderLogoForLogin flag
        if (response.useHeaderLogoForLogin && response.headerLogoUrl) {
          setLoginLogoUrl(response.headerLogoUrl);
          setLogoVersion((prev) => prev + 1);
        } else if (response.loginLogoUrl) {
          setLoginLogoUrl(response.loginLogoUrl);
          setLogoVersion((prev) => prev + 1);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (userSessionDetails.authenticated) {
      window.location.href = "/";
    }
  }, [userSessionDetails]);

  const checkLogin = () => {
    refresh();
  };

  const loginMessage = () => {
    // Add cache-busting parameter to prevent stale logo display after upload
    const logoSrc = loginLogoUrl
      ? `${config.serverBaseUrl}${loginLogoUrl}?v=${logoVersion}`
      : `images/openelis_logo_full.png`;

    return (
      <div className="oe-login-brand">
        <picture>
          <img
            src={logoSrc}
            alt={props.intl.formatMessage({ id: "login.logo.alt" })}
            onError={(e) => {
              e.target.src = `images/openelis_logo_full.png`;
            }}
          />
        </picture>
        <p className="oe-login-notice">
          <FormattedMessage id="login.notice.message" />
        </p>
      </div>
    );
  };

  const doLogin = (data) => {
    setSubmitting(true);
    fetch(config.serverBaseUrl + "/ValidateLogin?apiCall=true", {
      //includes the browser sessionId in the Header for Authentication on the backend server
      credentials: "include",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept-Language": getRequestLocale(),
      },
      body: qs.stringify(data),
    })
      .then(async (response) => {
        setSubmitting(false);
        // get json response here
        let data = await response.json();
        if (response.status === 200) {
          window.location.href = "/";
        } else {
          addNotification({
            title: props.intl.formatMessage({
              id: "notification.title",
            }),
            message: props.intl.formatMessage({
              id: data.error,
            }),
            kind: NotificationKinds.error,
          });
          setNotificationVisible(true);
        }
      })
      .catch((error) => {
        setSubmitting(false);
        console.error(error);
        if (error instanceof SyntaxError) {
          addNotification({
            title: props.intl.formatMessage({
              id: "notification.title",
            }),
            message: props.intl.formatMessage({
              id: "notification.login.syntax.error",
            }),
            kind: NotificationKinds.error,
          });
          setNotificationVisible(true);
        } else {
          addNotification({
            title: props.intl.formatMessage({
              id: "notification.title",
            }),
            message: props.intl.formatMessage({
              id: "notification.login.generic.error",
            }),
            kind: NotificationKinds.error,
          });
          setNotificationVisible(true);
        }
      });
  };

  const renderOauthButtons = () => {
    return (
      <span id="oauth-buttons">
        {configurationProperties?.oauthUrls?.map((url) => (
          <Button
            key={url.key}
            type="button"
            renderIcon={HardwareSecurityModule}
            onClick={() => {
              window.location.href = config.serverBaseUrl + "/" + url.value;
            }}
          >
            <FormattedMessage id="label.button.login.sso" />
          </Button>
        ))}
      </span>
    );
  };

  return (
    <>
      <div
        data-cy="login-Page-Content"
        className="loginPageContent oe-loginPageContent"
      >
        {notificationVisible === true ? <AlertDialog /> : ""}
        <div className="oe-loginPageCenter">
          {loginMessage()}
          <div className="oe-login-form">
            {samlRedirectInitiated ? (
              <Stack gap={5}>
                <Heading>
                  <FormattedMessage id="login.title" />
                </Heading>
                <div className="oe-login-redirecting">
                  <Loading
                    description={props.intl.formatMessage({
                      id: "login.redirecting.sso",
                    })}
                    withOverlay={false}
                  />
                  <p>
                    <FormattedMessage id="login.redirecting.sso" />
                  </p>
                </div>
              </Stack>
            ) : (
              <Formik
                initialValues={{
                  loginName: "",
                  password: "",
                }}
                onSubmit={(values) => doLogin(values)}
              >
                {({ isValid, handleChange, handleSubmit }) => (
                  <Form onSubmit={handleSubmit} onChange={handleChange}>
                    <Stack gap={5}>
                      <div className="oe-login-heading">
                        <Heading>
                          <FormattedMessage id="login.title" />
                        </Heading>
                      </div>
                      {configurationProperties?.useFormLogin == "true" && (
                        <>
                          <TextInput
                            id="loginName"
                            name="loginName"
                            invalidText={props.intl.formatMessage({
                              id: "login.msg.username.missing",
                            })}
                            labelText={props.intl.formatMessage({
                              id: "login.msg.username",
                            })}
                            placeholder={props.intl.formatMessage({
                              id: "login.msg.username",
                            })}
                            autoComplete="username"
                            ref={firstInput}
                            onFocus={markUserActive}
                            onChange={markUserActive}
                          />
                          <PasswordInput
                            id="password"
                            name="password"
                            invalidText={props.intl.formatMessage({
                              id: "login.msg.password.missing",
                            })}
                            labelText={props.intl.formatMessage({
                              id: "login.msg.password",
                            })}
                            placeholder={props.intl.formatMessage({
                              id: "login.msg.password",
                            })}
                            showPasswordLabel={props.intl.formatMessage({
                              id: "login.password.show",
                            })}
                            hidePasswordLabel={props.intl.formatMessage({
                              id: "login.password.hide",
                            })}
                            autoComplete="current-password"
                            onFocus={markUserActive}
                            onChange={markUserActive}
                          />
                          <div className="oe-login-actions">
                            <Button
                              type="submit"
                              disabled={!isValid || submitting}
                              data-cy="loginButton"
                            >
                              <FormattedMessage id="label.button.login" />
                              <Loading
                                small={true}
                                withOverlay={false}
                                className={submitting ? "show" : "hidden"}
                              />
                            </Button>

                            <Button
                              kind="tertiary"
                              data-cy="changePassword"
                              type="button"
                              onClick={() => {
                                window.location.href = "/ChangePasswordLogin";
                              }}
                            >
                              <FormattedMessage id="label.button.changepassword" />
                            </Button>
                          </div>
                        </>
                      )}
                      {configurationProperties?.useSaml == "true" &&
                        configurationProperties?.useSamlLoginPage !==
                          "false" && (
                          <Button
                            type="button"
                            renderIcon={HardwareSecurityModule}
                            onClick={() => {
                              window.location.href =
                                config.serverBaseUrl +
                                "/LoginPage?useSAML=true&redirect=true";
                            }}
                          >
                            <FormattedMessage id="label.button.login.sso" />
                          </Button>
                        )}
                      {configurationProperties?.useOauth == "true" &&
                        renderOauthButtons()}
                    </Stack>
                  </Form>
                )}
              </Formik>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default injectIntl(Login);
