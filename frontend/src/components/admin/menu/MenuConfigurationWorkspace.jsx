import React, { useCallback, useEffect, useRef, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { FormattedMessage, useIntl } from "react-intl";
import { InlineNotification, Modal, Select, SelectItem } from "@carbon/react";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import { LegacyGlobalMenuManagement } from "./GlobalMenuManagement";
import PatientMenuManagement from "./PatientMenuManagement";
import NonConformityMenuManagement from "./NonConformityMenuManagement";
import StudyMenuManagement from "./StudyMenuManagement";
import BillingMenuManagement from "./BillingMenuManagement";
import "../AdminEntryWorkspace.css";

export const MENU_CONFIGURATION_CATEGORIES = [
  {
    id: "global",
    label: "sidenav.label.admin.menu.global",
    Editor: LegacyGlobalMenuManagement,
  },
  {
    id: "patient",
    label: "sidenav.label.admin.menu.patient",
    Editor: PatientMenuManagement,
  },
  {
    id: "nonconformity",
    label: "sidenav.label.admin.menu.nonconform",
    Editor: NonConformityMenuManagement,
  },
  {
    id: "study",
    label: "sidenav.label.admin.menu.study",
    Editor: StudyMenuManagement,
  },
  {
    id: "billing",
    label: "sidenav.label.admin.menu.billing",
    Editor: BillingMenuManagement,
  },
];

export default function MenuConfigurationWorkspace() {
  const intl = useIntl();
  const history = useHistory();
  const { pathname } = useLocation();
  const base = pathname.startsWith("/admin") ? "/admin" : "/MasterListsPage";
  const [categoryId, setCategoryId] = useState("global");
  const [editorRevision, setEditorRevision] = useState(0);
  const [returnNotice, setReturnNotice] = useState(false);
  const [editorState, setEditorState] = useState({ dirty: false, busy: false });
  const [pending, setPending] = useState(null);
  const allowNavigation = useRef(false);
  const onEditorStateChange = useCallback((state) => setEditorState(state), []);
  useEffect(
    () =>
      history.block((next, action) => {
        if (allowNavigation.current) return undefined;
        if (editorState.busy) return false;
        if (editorState.dirty) {
          setPending({ location: next, action });
          return false;
        }
        return undefined;
      }),
    [history, editorState],
  );
  useEffect(() => {
    const beforeUnload = (event) => {
      if (editorState.dirty || editorState.busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [editorState]);
  const selectCategory = (id) => {
    if (editorState.busy || id === categoryId) return;
    if (editorState.dirty) setPending({ categoryId: id });
    else {
      setEditorState({ dirty: false, busy: false });
      setCategoryId(id);
    }
  };
  const discardAndContinue = () => {
    const destination = pending;
    setPending(null);
    setEditorState({ dirty: false, busy: false });
    setEditorRevision((revision) => revision + 1);
    if (destination?.location) {
      if (destination.action === "POP") {
        // history v4 does not expose the blocked POP delta. Keep its history
        // stack intact; the user's next Back/Forward repeats the original POP.
        setReturnNotice(true);
        return;
      }
      allowNavigation.current = true;
      try {
        if (destination.action === "REPLACE")
          history.replace(destination.location);
        else history.push(destination.location);
      } finally {
        allowNavigation.current = false;
      }
    } else if (destination?.categoryId) setCategoryId(destination.categoryId);
  };

  const { Editor } = MENU_CONFIGURATION_CATEGORIES.find(
    (item) => item.id === categoryId,
  );
  return (
    <div className="adminPageContent admin-entry-workspace">
      <PageBreadCrumb
        breadcrumbs={[
          { label: "home.label", link: "/" },
          { label: "breadcrums.admin.managment", link: base },
        ]}
      />
      <ProductPageHeader
        title={<FormattedMessage id="admin.entry.menu.title" />}
        subtitle={<FormattedMessage id="admin.entry.menu.description" />}
      />
      <div className="admin-entry-workspace__category">
        <Select
          id="menu-configuration-category"
          labelText={intl.formatMessage({ id: "admin.entry.category" })}
          value={categoryId}
          disabled={editorState.busy}
          onChange={(event) => selectCategory(event.target.value)}
        >
          {MENU_CONFIGURATION_CATEGORIES.map((item) => (
            <SelectItem
              key={item.id}
              value={item.id}
              text={intl.formatMessage({ id: item.label })}
            />
          ))}
        </Select>
      </div>
      {returnNotice && (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title={intl.formatMessage({ id: "admin.entry.unsaved.returnNotice" })}
        />
      )}
      <Editor
        key={`${categoryId}:${editorRevision}`}
        embedded
        onEditorStateChange={onEditorStateChange}
      />
      <Modal
        open={Boolean(pending)}
        size="sm"
        danger
        closeButtonLabel={intl.formatMessage({ id: "button.close" })}
        modalHeading={intl.formatMessage({ id: "admin.entry.unsaved.heading" })}
        primaryButtonText={intl.formatMessage({
          id:
            pending?.action === "POP"
              ? "admin.entry.unsaved.discardReturn"
              : "admin.entry.unsaved.discard",
        })}
        secondaryButtonText={intl.formatMessage({
          id: "admin.entry.unsaved.keep",
        })}
        onRequestClose={() => setPending(null)}
        onRequestSubmit={discardAndContinue}
      >
        <p>
          <FormattedMessage id="admin.entry.unsaved.message" />
        </p>
      </Modal>
    </div>
  );
}
