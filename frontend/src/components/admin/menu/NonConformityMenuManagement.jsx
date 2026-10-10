import React, { useContext, useState } from "react";
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
import useMenuConfiguration from "./useMenuConfiguration";
import { MenuCheckBox } from "./MenuUtil";
import { NotificationContext } from "../../layout/Layout";
import { AlertDialog } from "../../common/CustomNotification";
import { FormattedMessage, useIntl } from "react-intl";
import PageBreadCrumb from "../../common/PageBreadCrumb";

let breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
  {
    label: "sidenav.label.admin.menu.nonconform",
    link: "/MasterListsPage/nonConformityMenuManagement",
  },
];
function NonConformityMenuManagement({
  embedded = false,
  onEditorStateChange,
} = {}) {
  const { notificationVisible } = useContext(NotificationContext);
  const intl = useIntl();
  const { menuItem, phase, updateMenuItem, submit } = useMenuConfiguration(
    "menu_nonconformity",
    onEditorStateChange,
  );
  const isSubmitting = phase === "saving";
  const readFailed = phase === "error";
  const loading = phase === "loading";
  const [showChildren, setShowChildren] = useState(false);

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
          <Column lg={16}>
            {!embedded && (
              <Section>
                <Heading>
                  <FormattedMessage id="menu.nonconform.title" />
                </Heading>
              </Section>
            )}
            <Section>
              <Form onSubmit={submit}>
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
                  disabled={isSubmitting}
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
                  setMenuItem={updateMenuItem}
                  disabled={phase !== "ready"}
                  labelKey="menu.nonconform.active"
                  recurse={showChildren}
                />
                <br></br>
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

export default NonConformityMenuManagement;
