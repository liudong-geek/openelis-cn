import React, { useContext } from "react";
import {
  Form,
  InlineNotification,
  Heading,
  TextInput,
  Button,
  Loading,
  Grid,
  Column,
  Section,
  Checkbox,
} from "@carbon/react";
import useMenuConfiguration from "./useMenuConfiguration";
import { NotificationContext } from "../../layout/Layout";
import { AlertDialog } from "../../common/CustomNotification";
import { FormattedMessage, useIntl } from "react-intl";
import PageBreadCrumb from "../../common/PageBreadCrumb";

let breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
  {
    label: "sidenav.label.admin.menu.billing",
    link: "/MasterListsPage/billingMenuManagement",
  },
];
function BillingMenuManagement({ embedded = false, onEditorStateChange } = {}) {
  const { notificationVisible } = useContext(NotificationContext);
  const intl = useIntl();
  const { menuItem, phase, updateMenuItem, submit } = useMenuConfiguration(
    "menu_billing",
    onEditorStateChange,
  );
  const isSubmitting = phase === "saving";
  const readFailed = phase === "error";
  const loading = phase === "loading";

  return (
    <>
      {notificationVisible === true ? <AlertDialog /> : ""}
      {loading && <Loading />}
      <div className="adminPageContent">
        {!embedded && <PageBreadCrumb breadcrumbs={breadcrumbs} />}
        {readFailed && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={intl.formatMessage({ id: "server.error.msg" })}
          />
        )}
        <Grid fullWidth={true}>
          <Column lg={16} md={8} sm={4}>
            {!embedded && (
              <Section>
                <Heading>
                  <FormattedMessage id="menu.billing.title" />
                </Heading>
              </Section>
            )}
            <br />
            <Section>
              <Form onSubmit={submit}>
                <div className="formInlineDiv">
                  <TextInput
                    id="billing_address"
                    labelText={intl.formatMessage({
                      id: "menu.billing.address",
                    })}
                    disabled={phase !== "ready"}
                    value={menuItem.menu.actionURL || ""}
                    onChange={(e) => {
                      updateMenuItem({
                        ...menuItem,
                        menu: { ...menuItem.menu, actionURL: e.target.value },
                      });
                    }}
                    type="url"
                    pattern="https?://.*"
                  />
                </div>
                <div className="formInlineDiv">
                  <Checkbox
                    id="billing_active"
                    labelText={intl.formatMessage({
                      id: "menu.billing.active",
                    })}
                    disabled={phase !== "ready"}
                    checked={menuItem.menu.isActive || false}
                    onChange={(_, { checked }) => {
                      updateMenuItem({
                        ...menuItem,
                        menu: { ...menuItem.menu, isActive: checked },
                      });
                    }}
                  />
                </div>
                <div>
                  <Button
                    type="submit"
                    disabled={phase !== "ready" || !menuItem.menu.elementId}
                  >
                    <FormattedMessage id="label.button.submit" />
                    {isSubmitting && <Loading small={true} />}
                  </Button>
                </div>
              </Form>
            </Section>
          </Column>
        </Grid>
      </div>
    </>
  );
}

export default BillingMenuManagement;
