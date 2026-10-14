import React, { useContext, useState, useEffect, useRef } from "react";
import {
  Form,
  Heading,
  Toggle,
  Button,
  Loading,
  Grid,
  Column,
  Section,
  InlineNotification,
  Tag,
} from "@carbon/react";
import { MenuCheckBox } from "./MenuUtil";
import {
  getFromOpenElisServer,
  Roles,
  postToOpenElisServerFullResponse,
} from "../../utils/Utils";
import { NotificationContext } from "../../layout/Layout";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
import { FormattedMessage, useIntl } from "react-intl";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import { navigationMenuOwner } from "../../layout/navigationMenuAvailability";
import "./StudyMenuManagement.css";

let breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
  {
    label: "sidenav.label.admin.menu.study",
    link: "/MasterListsPage/studyMenuManagement",
  },
];

const STUDY_MENU_IDS = [
  "menu_sample_create",
  "menu_patient_create",
  "menu_reports_study",
  "menu_reports_patients",
  "menu_reports_arv",
  "menu_reports_eid",
  "menu_reports_indeterminate",
  "menu_reports_indicator",
  "menu_reports_nonconformity.study",
  "menu_resultvalidation_study",
  "menu_reports_vl",
  "menu_resultvalidation_virology",
];
const validMenuItem = (item, expectedId) =>
  item?.menu?.elementId === expectedId &&
  typeof item.menu.isActive === "boolean" &&
  Array.isArray(item.childMenus);
const validStudyItems = (items) =>
  Array.isArray(items) &&
  items.length === STUDY_MENU_IDS.length &&
  new Set(items.map((item) => item?.menu?.elementId)).size ===
    STUDY_MENU_IDS.length &&
  STUDY_MENU_IDS.every((id) => items.some((item) => validMenuItem(item, id)));
const studyRoot = (items) => ({
  menu: {
    elementId: "menu_study",
    isActive: items.every((item) => item.menu.isActive === true),
  },
  childMenus: STUDY_MENU_IDS.map((id) =>
    items.find((item) => item.menu.elementId === id),
  ),
});
const studyMenuNodes = (items) =>
  items.flatMap((item) => [item, ...studyMenuNodes(item.childMenus)]);
const studyDisplayRoot = (items) => {
  // The twelve API records overlap: some configured roots are children of others.
  const nestedIds = new Set(
    items.flatMap((item) =>
      studyMenuNodes(item.childMenus).map((child) => child.menu.elementId),
    ),
  );
  const clone = (item) => ({
    ...item,
    menu: { ...item.menu },
    childMenus: item.childMenus.map(clone),
  });
  return {
    ...studyRoot(items),
    childMenus: items
      .filter((item) => !nestedIds.has(item.menu.elementId))
      .map(clone),
  };
};
const updateStudyItems = (items, displayRoot) => {
  const activeById = new Map(
    studyMenuNodes(displayRoot.childMenus).map((item) => [
      item.menu.elementId,
      item.menu.isActive,
    ]),
  );
  const update = (item) => ({
    ...item,
    menu: {
      ...item.menu,
      isActive: activeById.get(item.menu.elementId) ?? item.menu.isActive,
    },
    childMenus: item.childMenus.map(update),
  });
  return items.map(update);
};

function StudyMenuManagement({ embedded = false, onEditorStateChange } = {}) {
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);

  const intl = useIntl();

  const componentMounted = useRef(false);
  const { userSessionDetails } = useContext(UserSessionDetailsContext);
  const readOwner = navigationMenuOwner(userSessionDetails);
  const canManage =
    !!readOwner &&
    Array.isArray(userSessionDetails?.roles) &&
    userSessionDetails.roles.includes(Roles.GLOBAL_ADMIN);
  const ownerRef = useRef(readOwner);
  ownerRef.current = readOwner;
  const readGeneration = useRef(0);
  const [readVersion, setReadVersion] = useState(0);
  const [readState, setReadState] = useState({
    owner: null,
    loaded: 0,
    failed: false,
  });
  const readComplete =
    canManage &&
    readState.owner === readOwner &&
    readState.loaded === STUDY_MENU_IDS.length &&
    !readState.failed;
  const readFailed =
    !canManage || (readState.owner === readOwner && readState.failed);
  const loading = canManage && !readComplete && !readFailed;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    onEditorStateChange?.({ dirty, busy: isSubmitting });
  }, [dirty, isSubmitting, onEditorStateChange]);
  const [showChildren, setShowChildren] = useState(false);
  const [menuItem, setMenuItem] = useState({ menu: {}, childMenus: [] });
  const activeCount = readComplete
    ? menuItem.childMenus.filter((item) => item.menu.isActive === true).length
    : 0;
  const mixed =
    readComplete && activeCount > 0 && activeCount < STUDY_MENU_IDS.length;
  const reportSaveError = () => {
    setIsSubmitting(false);
    setNotificationVisible(true);
    addNotification({
      kind: NotificationKinds.error,
      title: intl.formatMessage({ id: "notification.title" }),
      message: intl.formatMessage({ id: "error.add.edited.msg" }),
    });
  };

  async function displayStatus(res, saveOwner) {
    if (!componentMounted.current || ownerRef.current !== saveOwner) return;
    if (res?.status != "200") {
      reportSaveError();
      return;
    }
    let body;
    try {
      body = await res.json();
    } catch (_error) {
      if (componentMounted.current && ownerRef.current === saveOwner)
        reportSaveError();
      return;
    }
    if (!componentMounted.current || ownerRef.current !== saveOwner) return;
    if (!validStudyItems(body)) {
      reportSaveError();
      return;
    }
    setIsSubmitting(false);
    setNotificationVisible(true);
    addNotification({
      kind: NotificationKinds.success,
      title: intl.formatMessage({ id: "notification.title" }),
      message: intl.formatMessage({ id: "success.add.edited.msg" }),
    });
    setMenuItem(studyRoot(body));
    setDirty(false);
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting || !readComplete || !validStudyItems(menuItem.childMenus))
      return;
    setIsSubmitting(true);
    postToOpenElisServerFullResponse(
      "/rest/menu",
      JSON.stringify(menuItem.childMenus),
      (response) => displayStatus(response, readOwner),
    );
  }

  useEffect(() => {
    componentMounted.current = true;
    let controller;
    let complete = false;
    let invalid = false;
    const load = () => {
      controller?.abort();
      const generation = ++readGeneration.current;
      controller = new AbortController();
      const received = new Map();
      complete = false;
      invalid = false;
      setMenuItem({ menu: {}, childMenus: [] });
      setDirty(false);
      setReadState({ owner: readOwner, loaded: 0, failed: !canManage });
      if (!canManage) return;
      const current = () =>
        componentMounted.current &&
        !controller.signal.aborted &&
        generation === readGeneration.current &&
        ownerRef.current === readOwner;
      STUDY_MENU_IDS.forEach((id) => {
        getFromOpenElisServer(
          `/rest/admin/menu/${id}`,
          (response) => {
            if (!current()) return;
            if (!validMenuItem(response, id)) {
              invalid = true;
              setReadState((state) => ({ ...state, failed: true }));
              return;
            }
            received.set(id, response);
            setReadState((state) => ({ ...state, loaded: received.size }));
            if (received.size === STUDY_MENU_IDS.length && !invalid) {
              complete = true;
              setMenuItem(
                studyRoot(STUDY_MENU_IDS.map((key) => received.get(key))),
              );
            }
          },
          controller.signal,
        );
      });
    };
    const hide = () => {
      controller?.abort();
      readGeneration.current += 1;
      if (!complete)
        setReadState({ owner: readOwner, loaded: 0, failed: true });
    };
    const show = (event) => {
      if (event.persisted && !complete) load();
    };
    load();
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    return () => {
      componentMounted.current = false;
      controller?.abort();
      readGeneration.current += 1;
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
    };
  }, [readOwner, canManage, readVersion]);

  return (
    <>
      {notificationVisible === true ? <AlertDialog /> : ""}
      {loading && <Loading />}
      {readFailed && (
        <div className="study-menu-read-error">
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={intl.formatMessage({ id: "server.error.msg" })}
          />
          {canManage && (
            <Button
              kind="tertiary"
              onClick={() => setReadVersion((value) => value + 1)}
            >
              <FormattedMessage id="button.retry" />
            </Button>
          )}
        </div>
      )}
      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title={intl.formatMessage({ id: "menu.study.configuration.scope" })}
      />
      <div className="adminPageContent">
        {!embedded && <PageBreadCrumb breadcrumbs={breadcrumbs} />}
        <Grid fullWidth={true}>
          <Column lg={16}>
            {!embedded && (
              <Section>
                <Heading>
                  <FormattedMessage id="menu.study.title" />
                </Heading>
              </Section>
            )}
            <Section>
              <Form className="study-menu-editor" onSubmit={handleSubmit}>
                <br></br>
                <Toggle
                  id="toggleShowChildren"
                  labelText={intl.formatMessage({
                    id: "menu.study.configuration.showItems",
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
                {readComplete && (
                  <MenuCheckBox
                    menuItem={studyDisplayRoot(menuItem.childMenus)}
                    path="$"
                    setMenuItem={(next) => {
                      setDirty(true);
                      setMenuItem(
                        studyRoot(updateStudyItems(menuItem.childMenus, next)),
                      );
                    }}
                    labelKey="menu.study.active"
                    recurse={showChildren}
                    indeterminate={mixed}
                    disabled={isSubmitting}
                  />
                )}
                {readComplete && (
                  <Tag type={mixed ? "cyan" : "gray"}>
                    <FormattedMessage
                      id="menu.study.configuration.activeCount"
                      values={{
                        count: activeCount,
                        total: STUDY_MENU_IDS.length,
                      }}
                    />
                  </Tag>
                )}
                <br></br>
                <div>
                  <Button
                    type="submit"
                    disabled={isSubmitting || !readComplete}
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

export default StudyMenuManagement;
