import React, { useEffect, useState } from "react";
import "../Style.css";
import { injectIntl, FormattedMessage } from "react-intl";
import ResultSearchPage from "./SearchResultForm";
import PageBreadCrumb from "../common/PageBreadCrumb";
import ProductPageHeader from "../common/ProductPageHeader";

function ResultSearch() {
  const [source, setSource] = useState("");
  useEffect(() => {
    let sourceFromUrl = new URLSearchParams(window.location.search).get(
      "source",
    );
    let sources = [
      "WorkPlanByTest",
      "WorkPlanByPanel",
      "WorkPlanByTestSection",
      "WorkPlanByPriority",
    ];
    sourceFromUrl = sources.includes(sourceFromUrl) ? sourceFromUrl : "";
    setSource(sourceFromUrl);
  }, []);
  return (
    <>
      <PageBreadCrumb
        breadcrumbs={
          source
            ? [
                { label: "home.label", link: "/" },
                {
                  label: "banner.menu.workplan",
                  link: `/${source}`,
                },
              ]
            : [{ label: "home.label", link: "/" }]
        }
      />

      <ProductPageHeader
        titleId="results-page-title"
        title={<FormattedMessage id="sidenav.label.results" />}
        subtitle={<FormattedMessage id="label.results.search" />}
      />
      <div className="orderLegendBody">
        <ResultSearchPage />
      </div>
    </>
  );
}

export default injectIntl(ResultSearch);
