import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Button,
  ComposedModal,
  InlineNotification,
  Loading,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Search,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextInput,
} from "@carbon/react";
import { Add, Edit, List, Renew } from "@carbon/icons-react";
import { FormattedMessage, injectIntl, useIntl } from "react-intl";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import { NotificationContext } from "../../layout/Layout";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
import {
  getFromOpenElisServer,
  postToOpenElisServerJsonResponse,
} from "../../utils/Utils";
import "../AdminListWorkspace.css";
import "../AdminModal.css";
import "./ConfigurationEntityWorkspace.css";

function TestSectionManagement() {
  const intl = useIntl();
  const location = useLocation();
  const base = location.pathname.startsWith("/admin")
    ? "/admin"
    : "/MasterListsPage";
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);

  const [payload, setPayload] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [name, setName] = useState("");

  const loadSections = useCallback(() => {
    setIsLoading(true);
    setLoadError(false);
    getFromOpenElisServer("/rest/TestSectionCreate", (response) => {
      if (!response || response.error) {
        setLoadError(true);
        setIsLoading(false);
        return;
      }
      setPayload(response);
      setIsLoading(false);
    });
  }, []);

  useEffect(() => loadSections(), [loadSections]);

  const sections = useMemo(() => {
    const active = (payload?.existingTestUnitList || []).map((item) => ({
      ...item,
      active: true,
    }));
    const inactive = (payload?.inactiveTestUnitList || []).map((item) => ({
      ...item,
      active: false,
    }));
    const query = searchText.trim().toLocaleLowerCase();
    return [...active, ...inactive].filter(
      (item) => !query || item.value.toLocaleLowerCase().includes(query),
    );
  }, [payload, searchText]);

  const closeCreate = () => {
    if (isSubmitting) return;
    setIsCreateOpen(false);
    setFormError("");
    setName("");
  };

  const createSection = () => {
    const normalizedName = name.trim();
    if (!normalizedName) {
      setFormError(intl.formatMessage({ id: "error.field.required" }));
      return;
    }
    setIsSubmitting(true);
    setFormError("");
    postToOpenElisServerJsonResponse(
      "/rest/TestSectionCreate",
      JSON.stringify({
        testUnitEnglishName: normalizedName,
        testUnitFrenchName: normalizedName,
      }),
      (response) => {
        setIsSubmitting(false);
        if (!response) {
          setFormError(intl.formatMessage({ id: "server.error.msg" }));
          return;
        }
        setIsCreateOpen(false);
        setName("");
        addNotification({
          kind: NotificationKinds.success,
          title: intl.formatMessage({ id: "notification.title" }),
          message: intl.formatMessage({
            id: "notification.user.post.save.success",
          }),
        });
        setNotificationVisible(true);
        loadSections();
      },
    );
  };

  return (
    <>
      {notificationVisible && <AlertDialog />}
      <div className="adminPageContent admin-list-workspace admin-list-workspace--compact configuration-entity-workspace">
        <PageBreadCrumb
          breadcrumbs={[
            { label: "home.label", link: "/" },
            { label: "breadcrums.admin.managment", link: base },
            {
              label: "sidenav.china.configuration.testSections",
              link: `${base}/TestSectionManagement`,
            },
          ]}
        />
        <ProductPageHeader
          title={
            <FormattedMessage id="sidenav.china.configuration.testSections" />
          }
          subtitle={
            <FormattedMessage id="configuration.testUnit.manage.explain" />
          }
          actions={
            <Button renderIcon={Add} onClick={() => setIsCreateOpen(true)}>
              <FormattedMessage id="configuration.testUnit.create" />
            </Button>
          }
          titleId="test-section-management-title"
        />

        <section className="admin-list-workspace__surface">
          <header className="admin-list-workspace__section-heading">
            <div>
              <h2>
                <FormattedMessage id="sidenav.china.configuration.testSections" />
              </h2>
              <p>
                <FormattedMessage
                  id="organization.management.results"
                  values={{ count: sections.length }}
                />
              </p>
            </div>
            <div className="configuration-entity-workspace__actions">
              <Button
                as={Link}
                to={`${base}/TestSectionOrder`}
                kind="ghost"
                size="sm"
                renderIcon={List}
              >
                <FormattedMessage id="configuration.testUnit.order" />
              </Button>
              <Button
                as={Link}
                to={`${base}/TestSectionTestAssign`}
                kind="ghost"
                size="sm"
                renderIcon={Edit}
              >
                <FormattedMessage id="configuration.panel.assign" />
              </Button>
            </div>
          </header>
          <div className="admin-list-workspace__filters admin-list-workspace__filters--search-only">
            <Search
              id="test-section-management-search"
              labelText={intl.formatMessage({
                id: "config.workspace.search.placeholder",
              })}
              placeholder={intl.formatMessage({
                id: "config.workspace.search.placeholder",
              })}
              closeButtonLabelText={intl.formatMessage({
                id: "button.sampleType.clearFilters",
              })}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="configuration-entity-workspace__state">
              <Loading small withOverlay={false} />
            </div>
          ) : loadError ? (
            <div className="configuration-entity-workspace__state">
              <InlineNotification
                kind="error"
                lowContrast
                hideCloseButton
                title=""
                subtitle={intl.formatMessage({ id: "server.error.msg" })}
              />
              <Button
                kind="tertiary"
                size="sm"
                renderIcon={Renew}
                onClick={loadSections}
              >
                <FormattedMessage id="button.retry" />
              </Button>
            </div>
          ) : (
            <div className="admin-list-workspace__table-scroll">
              <Table className="admin-list-workspace__table configuration-entity-workspace__table">
                <TableHead>
                  <TableRow>
                    <TableHeader>
                      <FormattedMessage id="systemAudit.field.testSectionName" />
                    </TableHeader>
                    <TableHeader>
                      <FormattedMessage id="label.sampleType.status" />
                    </TableHeader>
                    <TableHeader>
                      <FormattedMessage id="label.sampleType.actions" />
                    </TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sections.length ? (
                    sections.map((section) => (
                      <TableRow key={section.id}>
                        <TableCell>
                          <strong>{section.value}</strong>
                        </TableCell>
                        <TableCell>
                          <Tag
                            type={section.active ? "green" : "gray"}
                            size="sm"
                          >
                            <FormattedMessage
                              id={
                                section.active
                                  ? "label.active"
                                  : "label.inactive"
                              }
                            />
                          </Tag>
                        </TableCell>
                        <TableCell>
                          <Button
                            as={Link}
                            to={`${base}/TestSectionRenameEntry`}
                            kind="ghost"
                            size="sm"
                          >
                            <FormattedMessage id="button.edit" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="configuration-entity-workspace__empty"
                      >
                        <FormattedMessage id="config.workspace.empty.title" />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <ComposedModal
          open={isCreateOpen}
          onClose={closeCreate}
          size="sm"
          className="oe-admin-modal"
        >
          <ModalHeader
            title={intl.formatMessage({ id: "configuration.testUnit.create" })}
            iconDescription={intl.formatMessage({ id: "button.close" })}
          />
          <ModalBody>
            <div className="configuration-entity-workspace__form">
              {formError && (
                <InlineNotification
                  kind="error"
                  lowContrast
                  title=""
                  subtitle={formError}
                  hideCloseButton
                />
              )}
              <TextInput
                id="test-section-name"
                labelText={intl.formatMessage({
                  id: "systemAudit.field.testSectionName",
                })}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              kind="secondary"
              onClick={closeCreate}
              disabled={isSubmitting}
            >
              <FormattedMessage id="button.cancel" />
            </Button>
            <Button onClick={createSection} disabled={isSubmitting}>
              <FormattedMessage id="button.save" />
            </Button>
          </ModalFooter>
        </ComposedModal>
      </div>
    </>
  );
}

export default injectIntl(TestSectionManagement);
