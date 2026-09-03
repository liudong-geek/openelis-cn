import React, { useContext, useState } from "react";
import SearchForm from "./SearchForm";
import Validation from "./Validation";
import { AlertDialog } from "../common/CustomNotification";
import { NotificationContext } from "../layout/Layout";
import { FormattedMessage } from "react-intl";
import PageBreadCrumb from "../common/PageBreadCrumb";
import ProductPageHeader from "../common/ProductPageHeader";
import "./Validation.css";

let breadcrumbs = [{ label: "home.label", link: "/" }];

const Index = () => {
  const { notificationVisible } = useContext(NotificationContext);
  const [results, setResults] = useState({ resultList: [] });
  const [params, setParams] = useState("");
  return (
    <>
      <PageBreadCrumb breadcrumbs={breadcrumbs} />
      <ProductPageHeader
        titleId="validation-page-title"
        title={<FormattedMessage id="sidenav.label.validation" />}
        subtitle={<FormattedMessage id="validation.page.subtitle" />}
      />
      <div className="orderLegendBody">
        {notificationVisible === true ? <AlertDialog /> : ""}
        <SearchForm setParams={setParams} setResults={setResults} />
        <Validation params={params} results={results} />
      </div>
    </>
  );
};

export default Index;
