import React, { useContext, useState, useEffect, useRef } from "react";
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
import {
  getFromOpenElisServer,
  postToOpenElisServerFullResponse,
} from "../../utils/Utils";
import { NotificationContext } from "../../layout/Layout";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
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
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);

  const intl = useIntl();

  const componentMounted = useRef(false);

  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  useEffect(() => {
    onEditorStateChange?.({ dirty, busy: isSubmitting });
  }, [dirty, isSubmitting, onEditorStateChange]);
  const [menuItem, setMenuItem] = useState({ menu: {}, childMenus: [] });

  async function displayStatus(res) {
    setNotificationVisible(true);
    if (res?.status == "200") {
      var body;
      try {
        body = await res.json();
      } finally {
        setIsSubmitting(false);
      }
      addNotification({
        kind: NotificationKinds.success,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "success.add.edited.msg" }),
      });
      setMenuItem(body);
      setDirty(false);
    } else {
      setIsSubmitting(false);
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "error.add.edited.msg" }),
      });
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    postToOpenElisServerFullResponse(
      "/rest/menu/menu_billing",
      JSON.stringify(menuItem),
      displayStatus,
    );
  }

  const handleMenuItems = (res) => {
    setLoading(false);
    if (res?.menu?.elementId === "menu_billing") {
      setReadFailed(false);
      setMenuItem(res);
    } else {
      setReadFailed(true);
      setNotificationVisible(true);
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "server.error.msg" }),
      });
    }
  };

  useEffect(() => {
    componentMounted.current = true;
    setLoading(true);
    getFromOpenElisServer("/rest/admin/menu/menu_billing", handleMenuItems);
    return () => {
      componentMounted.current = false;
    };
  }, []);

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
              <Form onSubmit={handleSubmit}>
                <div className="formInlineDiv">
                  <TextInput
                    id="billing_address"
                    labelText={intl.formatMessage({
                      id: "menu.billing.address",
                    })}
                    value={menuItem.menu.actionURL || ""}
                    onChange={(e) => {
                      setDirty(true);
                      setMenuItem({
                        ...menuItem,
                        menu: { ...menuItem.menu, actionURL: e.target.value },
                      });
                    }}
                    type="url"
                    required
                    pattern="https?://.*"
                  />
                </div>
                <div className="formInlineDiv">
                  <Checkbox
                    id="billing_active"
                    labelText={intl.formatMessage({
                      id: "menu.billing.active",
                    })}
                    checked={menuItem.menu.isActive || false}
                    onChange={(_, { checked }) => {
                      setDirty(true);
                      setMenuItem({
                        ...menuItem,
                        menu: { ...menuItem.menu, isActive: checked },
                      });
                    }}
                  />
                </div>
                <div>
                  <Button
                    type="submit"
                    disabled={
                      isSubmitting || readFailed || !menuItem.menu.elementId
                    }
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
