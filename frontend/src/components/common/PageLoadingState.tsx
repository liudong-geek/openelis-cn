import React from "react";
import { Loading } from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";

/**
 * Visible, announced fallback for route-level code loading. A blank Suspense
 * fallback makes a healthy navigation look like a failed click on slower
 * clients and when a large analyzer or history bundle is first requested.
 */
const PageLoadingState = () => {
  const intl = useIntl();

  return (
    <div className="oe-page-loading" role="status" aria-live="polite">
      <Loading
        withOverlay={false}
        description={intl.formatMessage({ id: "loading.description" })}
      />
      <p>
        <FormattedMessage id="loading.description" />
      </p>
    </div>
  );
};

export default PageLoadingState;
