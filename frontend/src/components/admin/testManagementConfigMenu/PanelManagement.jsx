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
  Select,
  SelectItem,
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

function PanelManagement() {
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
  const [form, setForm] = useState({
    name: "",
    sampleTypeId: "",
    loinc: "",
  });

  const loadPanels = useCallback(() => {
    setIsLoading(true);
    setLoadError(false);
    getFromOpenElisServer("/rest/PanelCreate", (response) => {
      if (!response || response.error) {
        setLoadError(true);
        setIsLoading(false);
        return;
      }
      setPayload(response);
      setIsLoading(false);
    });
  }, []);

  useEffect(() => loadPanels(), [loadPanels]);

  const panels = useMemo(() => {
    const byId = new Map();
    (payload?.existingPanelList || []).forEach((sampleType) => {
      (sampleType.panels || []).forEach((panel) => {
        const current = byId.get(panel.id) || {
          id: panel.id,
          name: panel.localization?.localizedValue || panel.panelName,
          sampleTypes: new Set(),
        };
        current.sampleTypes.add(sampleType.typeOfSampleName);
        byId.set(panel.id, current);
      });
    });
    const result = Array.from(byId.values()).map((panel) => ({
      ...panel,
      sampleTypes: Array.from(panel.sampleTypes),
    }));
    const query = searchText.trim().toLocaleLowerCase();
    return query
      ? result.filter((panel) =>
          [panel.name, ...panel.sampleTypes]
            .join(" ")
            .toLocaleLowerCase()
            .includes(query),
        )
      : result;
  }, [payload, searchText]);

  const closeCreate = () => {
    if (isSubmitting) return;
    setIsCreateOpen(false);
    setFormError("");
    setForm({ name: "", sampleTypeId: "", loinc: "" });
  };

  const createPanel = () => {
    const name = form.name.trim();
    const loinc = form.loinc.trim();
    if (!name || !form.sampleTypeId || !/^(?!-)(?:\d+-)*\d+$/.test(loinc)) {
      setFormError(intl.formatMessage({ id: "error.field.required" }));
      return;
    }
    setIsSubmitting(true);
    setFormError("");
    postToOpenElisServerJsonResponse(
      "/rest/PanelCreate",
      JSON.stringify({
        panelEnglishName: name,
        panelFrenchName: name,
        selectedSampleTypeId: form.sampleTypeId,
        sampleTypeId: form.sampleTypeId,
        panelLoinc: loinc,
      }),
      (response) => {
        setIsSubmitting(false);
        if (!response) {
          setFormError(intl.formatMessage({ id: "server.error.msg" }));
          return;
        }
        setIsCreateOpen(false);
        setForm({ name: "", sampleTypeId: "", loinc: "" });
        addNotification({
          kind: NotificationKinds.success,
          title: intl.formatMessage({ id: "notification.title" }),
          message: intl.formatMessage({
            id: "notification.user.post.save.success",
          }),
        });
        setNotificationVisible(true);
        loadPanels();
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
              label: "sidenav.china.configuration.panels",
              link: `${base}/PanelManagement`,
            },
          ]}
        />
        <ProductPageHeader
          title={<FormattedMessage id="sidenav.china.configuration.panels" />}
          subtitle={
            <FormattedMessage id="configuration.panel.manage.explain" />
          }
          actions={
            <Button renderIcon={Add} onClick={() => setIsCreateOpen(true)}>
              <FormattedMessage id="configuration.panel.create" />
            </Button>
          }
          titleId="panel-management-title"
        />

        <section className="admin-list-workspace__surface">
          <header className="admin-list-workspace__section-heading">
            <div>
              <h2>
                <FormattedMessage id="sidenav.china.configuration.panels" />
              </h2>
              <p>
                <FormattedMessage
                  id="organization.management.results"
                  values={{ count: panels.length }}
                />
              </p>
            </div>
            <div className="configuration-entity-workspace__actions">
              <Button
                as={Link}
                to={`${base}/PanelOrder`}
                kind="ghost"
                size="sm"
                renderIcon={List}
              >
                <FormattedMessage id="configuration.panel.order" />
              </Button>
              <Button
                as={Link}
                to={`${base}/PanelTestAssign`}
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
              id="panel-management-search"
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
                onClick={loadPanels}
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
                      <FormattedMessage id="panel.panelName" />
                    </TableHeader>
                    <TableHeader>
                      <FormattedMessage id="order.specimenLookup.type" />
                    </TableHeader>
                    <TableHeader>
                      <FormattedMessage id="label.sampleType.actions" />
                    </TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {panels.length ? (
                    panels.map((panel) => (
                      <TableRow key={panel.id}>
                        <TableCell>
                          <strong>{panel.name}</strong>
                        </TableCell>
                        <TableCell>
                          <div className="configuration-entity-workspace__tags">
                            {panel.sampleTypes.map((sampleType) => (
                              <Tag key={sampleType} type="cool-gray" size="sm">
                                {sampleType}
                              </Tag>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            as={Link}
                            to={`${base}/PanelRenameEntry`}
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
            title={intl.formatMessage({ id: "configuration.panel.create" })}
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
                id="panel-name"
                labelText={intl.formatMessage({ id: "panel.panelName" })}
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                required
              />
              <Select
                id="panel-sample-type"
                labelText={intl.formatMessage({
                  id: "order.specimenLookup.type",
                })}
                value={form.sampleTypeId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sampleTypeId: event.target.value,
                  }))
                }
              >
                <SelectItem
                  value=""
                  text={intl.formatMessage({ id: "sample.select.type" })}
                />
                {(payload?.existingSampleTypeList || []).map((sampleType) => (
                  <SelectItem
                    key={sampleType.id}
                    value={sampleType.id}
                    text={sampleType.value}
                  />
                ))}
              </Select>
              <TextInput
                id="panel-loinc"
                labelText={intl.formatMessage({ id: "label.loinc" })}
                value={form.loinc}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    loinc: event.target.value,
                  }))
                }
                helperText={intl.formatMessage({
                  id: "dictionary.loincCode.help",
                })}
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
            <Button onClick={createPanel} disabled={isSubmitting}>
              <FormattedMessage id="button.save" />
            </Button>
          </ModalFooter>
        </ComposedModal>
      </div>
    </>
  );
}

export default injectIntl(PanelManagement);
