import { React, useRef, useState } from "react";
import EOrderSearch from "./EOrderSearch";
import EOrder from "./EOrder";
import PageBreadCrumb from "../common/PageBreadCrumb";
import ProductPageHeader from "../common/ProductPageHeader";
import { Grid } from "@carbon/react";
import { FormattedMessage } from "react-intl";
import "./EOrderSearch.scss";
let breadcrumbs = [{ label: "home.label", link: "/" }];

export { default as EOrderSearch } from "./EOrderSearch";
export { default as EOrder } from "./EOrder";

const EOrderPage = () => {
  const eOrderRef = useRef(null);
  const [eOrders, setEOrders] = useState([]);
  return (
    <>
      <PageBreadCrumb breadcrumbs={breadcrumbs} />
      <ProductPageHeader
        titleId="eorder-page-title"
        title={<FormattedMessage id="eorder.header" />}
        subtitle={<FormattedMessage id="eorder.page.subtitle" />}
      />
      <div className="orderLegendBody eorder-workspace">
        <Grid fullWidth={true}>
          <EOrderSearch setEOrders={setEOrders} eOrderRef={eOrderRef} />
        </Grid>
        <EOrder
          eOrderRef={eOrderRef}
          eOrders={eOrders}
          setEOrders={setEOrders}
        />
      </div>
    </>
  );
};

export default EOrderPage;
