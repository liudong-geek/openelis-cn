import React from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { useLocation } from "react-router-dom";
import { Tabs, Tab, TabList, TabPanels, TabPanel } from "@carbon/react";
import ExistingOrder from "./ExistingOrder";
import PrePrint from "./PrePrint";
import PageBreadCrumb from "../common/PageBreadCrumb";
import ProductPageHeader from "../common/ProductPageHeader";
import ListReturnButton from "../common/ListReturnButton";

export default function PrintBarcode() {
  const location = useLocation();
  const intl = useIntl();
  const params = new URLSearchParams(location.search);
  const labNumber =
    params.get("labNumber") || params.get("accessionNumber") || "";
  const preprint = params.get("mode") === "preprint";
  return (
    <div className="barcode-workspace">
      <PageBreadCrumb
        breadcrumbs={[
          { label: "home.label", link: "/" },
          { label: "sidenav.label.order.active", link: "/order" },
        ]}
      />
      <ProductPageHeader
        title={
          <FormattedMessage
            id={labNumber ? "workspace.order.reprint" : "barcode.print.title"}
          />
        }
        subtitle={<FormattedMessage id="workspace.barcode.helper" />}
        actions={<ListReturnButton fallback="/order" />}
      />
      {labNumber ? (
        <ExistingOrder key={labNumber} initialLabNumber={labNumber} />
      ) : (
        <Tabs
          key={preprint ? "preprint" : "existing"}
          defaultSelectedIndex={preprint ? 1 : 0}
        >
          <TabList
            aria-label={intl.formatMessage({ id: "barcode.print.title" })}
            contained
          >
            <Tab>
              <FormattedMessage id="workspace.order.reprint" />
            </Tab>
            <Tab>
              <FormattedMessage id="workspace.barcode.preprint" />
            </Tab>
          </TabList>
          <TabPanels>
            <TabPanel>
              <ExistingOrder />
            </TabPanel>
            <TabPanel>
              <PrePrint />
            </TabPanel>
          </TabPanels>
        </Tabs>
      )}
    </div>
  );
}
