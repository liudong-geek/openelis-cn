import React, { useContext, useState, useEffect, useRef } from "react";
import {
  Form,
  InlineNotification,
  Heading,
  Toggle,
  Button,
  Loading,
  Grid,
  Column,
  Section,
} from "@carbon/react";
import {
  getFromOpenElisServer,
  postToOpenElisServerFullResponse,
} from "../../utils/Utils";
import { MenuCheckBox } from "./MenuUtil";
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
    label: "sidenav.label.admin.menu.patient",
    link: "/MasterListsPage/patientMenuManagement",
  },
];
function PatientMenuManagement({ embedded = false, onEditorStateChange } = {}) {
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);

  const intl = useIntl();

  const componentMounted = useRef(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  useEffect(() => {
    onEditorStateChange?.({ dirty, busy: isSubmitting });
  }, [dirty, isSubmitting, onEditorStateChange]);
  const [showChildren, setShowChildren] = useState(false);
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
      "/rest/menu/menu_patient",
      JSON.stringify(menuItem),
      displayStatus,
    );
  }

  const handleMenuItems = (res) => {
    if (res?.menu?.elementId === "menu_patient") {
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
    getFromOpenElisServer("/rest/admin/menu/menu_patient", handleMenuItems);
    return () => {
      componentMounted.current = false;
    };
  }, []);

  return (
    <>
      {notificationVisible === true ? <AlertDialog /> : ""}
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
          <Column lg={16}>
            {!embedded && (
              <Section>
                <Heading>
                  <FormattedMessage id="menu.patient.title" />
                </Heading>
              </Section>
            )}
            <Section>
              <Form onSubmit={handleSubmit}>
                <br></br>
                <Toggle
                  id="toggleShowChildren"
                  labelText={intl.formatMessage({
                    id: "label.showChildren",
                  })}
                  size="md"
                  labelA={intl.formatMessage({
                    id: "config.workspace.boolean.false",
                  })}
                  labelB={intl.formatMessage({
                    id: "config.workspace.boolean.true",
                  })}
                  toggled={showChildren}
                  onToggle={() => {
                    setShowChildren(!showChildren);
                  }}
                />
                <br></br>
                <br></br>
                <MenuCheckBox
                  menuItem={menuItem}
                  curMenuItem={menuItem}
                  path="$"
                  setMenuItem={(next) => {
                    setDirty(true);
                    setMenuItem(next);
                  }}
                  labelKey="menu.patient.active"
                  recurse={showChildren}
                />
                <br></br>

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

export default PatientMenuManagement;
