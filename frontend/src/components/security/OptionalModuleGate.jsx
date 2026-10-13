import React, { Suspense, useContext } from "react";
import { Link } from "react-router-dom";
import { FormattedMessage } from "react-intl";
import { Tile } from "@carbon/react";
import config from "../../config.json";
import { ConfigurationContext } from "../layout/Layout";
import { resolveNavigationProfile } from "../layout/navigationProfile";
import { MENU_PROFILES } from "../layout/taskFocusedMenu";
import PageLoadingState from "../common/PageLoadingState";
import RouteErrorBoundary from "../common/RouteErrorBoundary";

// Render only inside SecureRoute. Product availability does not grant a role
// or replace the server's authorization. A closed route never mounts its child.
export default function OptionalModuleGate({ module, children }) {
  const configuration = useContext(ConfigurationContext);
  const profile = resolveNavigationProfile(
    configuration?.configurationProperties?.NAVIGATION_PROFILE,
    config.navigationProfile,
  );
  if (
    profile === MENU_PROFILES.CHINA &&
    config.optionalModules?.[module] !== true
  ) {
    return (
      <Tile>
        <h1>
          <FormattedMessage id="optionalModule.closed.title" />
        </h1>
        <p>
          <FormattedMessage id="optionalModule.closed.message" />
        </p>
        <Link to="/">
          <FormattedMessage id="home.label" />
        </Link>
      </Tile>
    );
  }
  const errorCopy =
    module === "storage"
      ? {
          titleKey: "errorBoundary.route.storage.title",
          messageKey: "errorBoundary.route.storage.message",
        }
      : {};
  return (
    <RouteErrorBoundary {...errorCopy}>
      <Suspense fallback={<PageLoadingState />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}
