import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Dropdown,
  InlineLoading,
  Loading,
  Modal,
  Search,
  Tag,
} from "@carbon/react";
import { Add, Copy, Edit, Power } from "@carbon/icons-react";
import { FormattedMessage, useIntl } from "react-intl";
import {
  getFromOpenElisServer,
  postToOpenElisServerFullResponse,
} from "../../utils/Utils";
import { NotificationContext } from "../../layout/Layout";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import LabelPresetEditor from "./LabelPresetEditor";
import "./LabelPresetWorkspace.css";

const breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
  { label: "admin.labelPresets.title", link: "/MasterListsPage/labelPresets" },
];

const STATUS_FILTERS = [
  { id: "all", label: "admin.labelPresets.filter.all" },
  { id: "active", label: "admin.labelPresets.status.active" },
  { id: "inactive", label: "admin.labelPresets.status.inactive" },
];

const BarcodePreview = ({ type }) => (
  <div
    className={`label-preset-preview label-preset-preview--${type?.toLowerCase() || "code_128"}`}
    aria-hidden="true"
  >
    <div className="label-preset-preview__code" />
    <span>LIS · 240001</span>
  </div>
);

export default function LabelPresetList() {
  const intl = useIntl();
  const { notificationVisible, addNotification } =
    useContext(NotificationContext);
  const mounted = useRef(false);
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(STATUS_FILTERS[0]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState(null);
  const [togglePreset, setTogglePreset] = useState(null);

  const loadPresets = () => {
    setLoading(true);
    getFromOpenElisServer("/api/labelPresets", (data) => {
      if (!mounted.current) return;
      setPresets(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  };

  useEffect(() => {
    mounted.current = true;
    loadPresets();
    return () => {
      mounted.current = false;
    };
  }, []);

  const filteredPresets = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return presets.filter((preset) => {
      if (statusFilter.id === "active" && !preset.isActive) return false;
      if (statusFilter.id === "inactive" && preset.isActive) return false;
      if (!normalized) return true;
      return `${preset.name || ""} ${preset.barcodeType || ""}`
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [presets, query, statusFilter]);

  const metrics = useMemo(
    () => ({
      active: presets.filter((preset) => preset.isActive).length,
      system: presets.filter((preset) => preset.isSystem).length,
    }),
    [presets],
  );

  const notify = (success, successId, failureId) => {
    addNotification({
      kind: success ? NotificationKinds.success : NotificationKinds.error,
      title: intl.formatMessage({ id: success ? successId : failureId }),
    });
  };

  const duplicatePreset = (preset) => {
    setActionPending(true);
    const name = intl.formatMessage(
      { id: "admin.labelPresets.duplicateName" },
      { name: preset.name },
    );
    postToOpenElisServerFullResponse(
      `/api/labelPresets/${preset.id}/duplicate`,
      JSON.stringify({ name }),
      (response) => {
        const success = response?.status === 201;
        notify(
          success,
          "admin.labelPresets.duplicated",
          "admin.labelPresets.duplicateFailed",
        );
        setActionPending(false);
        if (success) loadPresets();
      },
    );
  };

  const applyStatusChange = () => {
    const preset = togglePreset;
    if (!preset) return;
    setTogglePreset(null);
    setActionPending(true);
    const isActive = !preset.isActive;
    postToOpenElisServerFullResponse(
      `/api/labelPresets/${preset.id}/activate`,
      JSON.stringify({ isActive }),
      (response) => {
        const success = Boolean(
          response && (response.status === 200 || response.ok),
        );
        notify(
          success,
          isActive
            ? "admin.labelPresets.activated"
            : "admin.labelPresets.deactivated",
          "admin.labelPresets.toggleFailed",
        );
        setActionPending(false);
        if (success) loadPresets();
      },
    );
  };

  const scopeText = (preset) =>
    [
      preset.printsPerOrder &&
        intl.formatMessage({ id: "admin.labelPresets.scope.order" }),
      preset.printsPerSample &&
        intl.formatMessage({ id: "admin.labelPresets.scope.sample" }),
    ]
      .filter(Boolean)
      .join("、");

  return (
    <>
      {notificationVisible && <AlertDialog />}
      {loading && <Loading />}
      <div className="adminPageContent label-presets-workspace">
        <PageBreadCrumb breadcrumbs={breadcrumbs} />
        <ProductPageHeader
          title={<FormattedMessage id="admin.labelPresets.title" />}
          subtitle={
            <FormattedMessage id="admin.labelPresets.workspace.subtitle" />
          }
          actions={
            <Button
              renderIcon={Add}
              disabled={actionPending}
              onClick={() => {
                setEditingPreset(null);
                setEditorOpen(true);
              }}
              data-testid="add-preset-btn"
            >
              <FormattedMessage id="admin.labelPresets.addButton" />
            </Button>
          }
        />

        <section
          className="label-presets-workspace__metrics"
          aria-label={intl.formatMessage({
            id: "admin.labelPresets.workspace.summary",
          })}
        >
          <article>
            <span>
              <FormattedMessage id="admin.labelPresets.workspace.total" />
            </span>
            <strong>{presets.length}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="admin.labelPresets.workspace.active" />
            </span>
            <strong>{metrics.active}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="admin.labelPresets.workspace.system" />
            </span>
            <strong>{metrics.system}</strong>
          </article>
        </section>

        <section className="label-presets-workspace__panel">
          <div className="label-presets-workspace__filters">
            <Search
              id="label-preset-search"
              labelText={intl.formatMessage({
                id: "admin.labelPresets.workspace.searchLabel",
              })}
              placeholder={intl.formatMessage({
                id: "admin.labelPresets.search.placeholder",
              })}
              closeButtonLabelText={intl.formatMessage({
                id: "admin.labelPresets.workspace.clearSearch",
              })}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Dropdown
              id="label-preset-status"
              titleText={intl.formatMessage({
                id: "admin.labelPresets.workspace.statusFilter",
              })}
              label={intl.formatMessage({
                id: "admin.labelPresets.workspace.statusFilter",
              })}
              items={STATUS_FILTERS}
              selectedItem={statusFilter}
              itemToString={(item) =>
                item ? intl.formatMessage({ id: item.label }) : ""
              }
              onChange={({ selectedItem }) =>
                setStatusFilter(selectedItem || STATUS_FILTERS[0])
              }
            />
          </div>
          <div className="label-presets-workspace__result-line" role="status">
            <FormattedMessage
              id="admin.labelPresets.workspace.results"
              values={{ count: filteredPresets.length }}
            />
            {actionPending && (
              <InlineLoading
                description={intl.formatMessage({
                  id: "admin.labelPresets.workspace.updating",
                })}
              />
            )}
          </div>

          {filteredPresets.length === 0 && !loading ? (
            <div className="label-presets-workspace__empty">
              <h2>
                <FormattedMessage id="admin.labelPresets.workspace.emptyTitle" />
              </h2>
              <p>
                <FormattedMessage id="admin.labelPresets.workspace.emptyHelper" />
              </p>
              <Button
                kind="tertiary"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setStatusFilter(STATUS_FILTERS[0]);
                }}
              >
                <FormattedMessage id="label.clear" />
              </Button>
            </div>
          ) : (
            <div className="label-presets-workspace__grid">
              {filteredPresets.map((preset) => (
                <article className="label-preset-card" key={preset.id}>
                  <header>
                    <div>
                      <div className="label-preset-card__tags">
                        <Tag
                          type={preset.isActive ? "green" : "gray"}
                          size="sm"
                        >
                          <FormattedMessage
                            id={
                              preset.isActive
                                ? "admin.labelPresets.status.active"
                                : "admin.labelPresets.status.inactive"
                            }
                          />
                        </Tag>
                        {preset.isSystem && (
                          <Tag type="blue" size="sm">
                            <FormattedMessage id="admin.labelPresets.systemTag" />
                          </Tag>
                        )}
                      </div>
                      <h2>{preset.name}</h2>
                    </div>
                    <BarcodePreview type={preset.barcodeType} />
                  </header>
                  <dl>
                    <div>
                      <dt>
                        <FormattedMessage id="admin.labelPresets.col.barcodeType" />
                      </dt>
                      <dd>{preset.barcodeType}</dd>
                    </div>
                    <div>
                      <dt>
                        <FormattedMessage id="admin.labelPresets.col.dimensions" />
                      </dt>
                      <dd>
                        {preset.widthMm} × {preset.heightMm} mm
                      </dd>
                    </div>
                    <div>
                      <dt>
                        <FormattedMessage id="admin.labelPresets.col.scope" />
                      </dt>
                      <dd>{scopeText(preset) || "—"}</dd>
                    </div>
                  </dl>
                  <footer>
                    <Button
                      kind="tertiary"
                      size="sm"
                      renderIcon={Edit}
                      onClick={() => {
                        setEditingPreset(preset);
                        setEditorOpen(true);
                      }}
                    >
                      <FormattedMessage id="admin.labelPresets.action.edit" />
                    </Button>
                    <Button
                      kind="ghost"
                      size="sm"
                      renderIcon={Copy}
                      disabled={actionPending}
                      onClick={() => duplicatePreset(preset)}
                    >
                      <FormattedMessage id="admin.labelPresets.action.duplicate" />
                    </Button>
                    {!preset.isSystem && (
                      <Button
                        kind="ghost"
                        size="sm"
                        renderIcon={Power}
                        disabled={actionPending}
                        onClick={() => setTogglePreset(preset)}
                      >
                        <FormattedMessage
                          id={
                            preset.isActive
                              ? "admin.labelPresets.action.deactivate"
                              : "admin.labelPresets.action.activate"
                          }
                        />
                      </Button>
                    )}
                  </footer>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {editorOpen && (
        <LabelPresetEditor
          preset={editingPreset}
          onClose={(saved) => {
            setEditorOpen(false);
            setEditingPreset(null);
            if (saved) loadPresets();
          }}
        />
      )}

      <Modal
        open={Boolean(togglePreset)}
        modalHeading={intl.formatMessage({
          id: togglePreset?.isActive
            ? "admin.labelPresets.workspace.deactivateTitle"
            : "admin.labelPresets.workspace.activateTitle",
        })}
        primaryButtonText={intl.formatMessage({
          id: togglePreset?.isActive
            ? "admin.labelPresets.action.deactivate"
            : "admin.labelPresets.action.activate",
        })}
        secondaryButtonText={intl.formatMessage({ id: "label.button.cancel" })}
        onRequestClose={() => setTogglePreset(null)}
        onRequestSubmit={applyStatusChange}
      >
        <p>
          <FormattedMessage
            id="admin.labelPresets.workspace.statusConfirm"
            values={{ name: togglePreset?.name || "" }}
          />
        </p>
      </Modal>
    </>
  );
}
