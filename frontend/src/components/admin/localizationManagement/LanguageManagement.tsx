import React, { useState, useEffect, useRef } from "react";
import {
  Button,
  InlineNotification,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  Modal,
  TextInput,
  Toggle,
  NumberInput,
  Loading,
  Search,
  Tag,
} from "@carbon/react";
import { Add, Edit, TrashCan, Star, StarFilled } from "@carbon/icons-react";
import { FormattedMessage, useIntl } from "react-intl";
import {
  getFromOpenElisServer,
  postToOpenElisServerFullResponse,
  putToOpenElisServerFullResponse,
  deleteFromOpenElisServerFullResponse,
} from "../../utils/Utils";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import "../AdminListWorkspace.css";
import "../AdminModal.css";

interface SupportedLocale {
  id: string;
  localeCode: string;
  displayName: string;
  active: boolean;
  fallback: boolean;
  sortOrder: number;
}

interface LocaleFormData {
  localeCode: string;
  displayName: string;
  active: boolean;
  fallback: boolean;
  sortOrder: number | string;
}

type LocaleFormErrors = Partial<Record<"localeCode" | "displayName", string>>;
type Notice = { kind: "success" | "error"; messageId: string } | null;
const emptyForm: LocaleFormData = {
  localeCode: "",
  displayName: "",
  active: true,
  fallback: false,
  sortOrder: 0,
};

const LanguageManagement = () => {
  const intl = useIntl();
  const [locales, setLocales] = useState<SupportedLocale[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const updateSaving = (value: boolean) => {
    savingRef.current = value;
    setSaving(value);
  };
  const [formError, setFormError] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLocale, setEditingLocale] = useState<SupportedLocale | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<SupportedLocale | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState(false);
  const [formData, setFormData] = useState<LocaleFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<LocaleFormErrors>({});

  const fetchLocales = () => {
    setLoading(true);
    setLoadError(false);
    getFromOpenElisServer(
      "/rest/supportedlocales",
      (response?: SupportedLocale[]) => {
        if (Array.isArray(response)) setLocales(response);
        else setLoadError(true);
        setLoading(false);
      },
    );
  };

  useEffect(() => {
    fetchLocales();
  }, []);

  const openEditor = (locale: SupportedLocale | null) => {
    setEditingLocale(locale);
    setFormData(
      locale ? { ...locale } : { ...emptyForm, sortOrder: locales.length + 1 },
    );
    setFormErrors({});
    setFormError(false);
    setNotice(null);
    setIsModalOpen(true);
  };

  const validateForm = () => {
    const errors: LocaleFormErrors = {};
    if (!formData.localeCode.trim()) {
      errors.localeCode = intl.formatMessage({ id: "error.field.required" });
    } else if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(formData.localeCode)) {
      errors.localeCode = intl.formatMessage({ id: "error.locale.format" });
    }
    if (!formData.displayName.trim()) {
      errors.displayName = intl.formatMessage({ id: "error.field.required" });
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = () => {
    if (savingRef.current || !validateForm()) return;
    updateSaving(true);
    setFormError(false);
    const callback = (response?: Response) => {
      updateSaving(false);
      if (!response?.ok) {
        setFormError(true);
        return;
      }
      setIsModalOpen(false);
      setNotice({
        kind: "success",
        messageId: editingLocale
          ? "locale.update.success"
          : "locale.create.success",
      });
      fetchLocales();
    };
    if (editingLocale) {
      putToOpenElisServerFullResponse(
        `/rest/supportedlocales/${editingLocale.id}`,
        JSON.stringify(formData),
        callback,
      );
    } else {
      postToOpenElisServerFullResponse(
        "/rest/supportedlocales",
        JSON.stringify(formData),
        callback,
      );
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget || deleteTarget.fallback || savingRef.current) return;
    updateSaving(true);
    setDeleteError(false);
    deleteFromOpenElisServerFullResponse(
      `/rest/supportedlocales/${deleteTarget.id}`,
      (response?: Response) => {
        updateSaving(false);
        if (!response?.ok) {
          setDeleteError(true);
          return;
        }
        setDeleteTarget(null);
        setNotice({ kind: "success", messageId: "locale.delete.success" });
        fetchLocales();
      },
    );
  };

  const handleSetFallback = (locale: SupportedLocale) => {
    if (savingRef.current || locale.fallback) return;
    updateSaving(true);
    setNotice(null);
    postToOpenElisServerFullResponse(
      `/rest/supportedlocales/${locale.id}/setFallback`,
      null,
      (response?: Response) => {
        updateSaving(false);
        if (response?.ok) {
          setNotice({ kind: "success", messageId: "locale.fallback.success" });
          fetchLocales();
        } else setNotice({ kind: "error", messageId: "locale.fallback.error" });
      },
    );
  };

  const query = search.trim().toLocaleLowerCase();
  const visibleLocales = locales.filter((locale) =>
    [locale.localeCode, locale.displayName].some((value) =>
      value.toLocaleLowerCase().includes(query),
    ),
  );

  return (
    <div className="adminPageContent admin-list-workspace admin-list-workspace--compact language-management-page">
      {loading && (
        <Loading
          description={intl.formatMessage({ id: "loading.description" })}
        />
      )}
      <PageBreadCrumb
        breadcrumbs={[
          { label: "home.label", link: "/" },
          { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
          {
            label: "locale.management.title",
            link: "/MasterListsPage/languageManagement",
          },
        ]}
      />
      <ProductPageHeader
        title={<FormattedMessage id="locale.management.title" />}
        subtitle={<FormattedMessage id="locale.management.description" />}
        actions={
          <Button
            renderIcon={Add}
            size="sm"
            disabled={saving || loadError}
            onClick={() => openEditor(null)}
          >
            <FormattedMessage id="locale.add" />
          </Button>
        }
      />
      {notice && (
        <InlineNotification
          lowContrast
          kind={notice.kind}
          title={intl.formatMessage({ id: notice.messageId })}
          onCloseButtonClick={() => setNotice(null)}
        />
      )}
      {loadError ? (
        <section className="admin-list-workspace__surface">
          <InlineNotification
            lowContrast
            hideCloseButton
            kind="error"
            title={intl.formatMessage({ id: "server.error.msg" })}
          />
          <Button kind="secondary" onClick={fetchLocales}>
            <FormattedMessage id="button.retry" />
          </Button>
        </section>
      ) : (
        <section className="admin-list-workspace__surface">
          <div className="admin-list-workspace__filters">
            <Search
              id="language-search"
              size="lg"
              labelText={intl.formatMessage({ id: "search.label" })}
              placeholder={intl.formatMessage({ id: "search.label" })}
              closeButtonLabelText={intl.formatMessage({
                id: "label.button.clear",
              })}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="admin-list-workspace__table-scroll">
            <TableContainer>
              <Table
                aria-label={intl.formatMessage({
                  id: "locale.management.title",
                })}
              >
                <TableHead>
                  <TableRow>
                    {[
                      "locale.code",
                      "locale.displayName",
                      "locale.status",
                      "locale.sortOrder",
                      "label.actions",
                    ].map((key) => (
                      <TableHeader key={key}>
                        <FormattedMessage id={key} />
                      </TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleLocales.map((locale) => (
                    <TableRow key={locale.id}>
                      <TableCell>
                        {locale.localeCode}
                        {locale.fallback && (
                          <Tag type="blue" size="sm">
                            <FormattedMessage id="locale.fallback" />
                          </Tag>
                        )}
                      </TableCell>
                      <TableCell>{locale.displayName}</TableCell>
                      <TableCell>
                        <Tag type={locale.active ? "green" : "gray"} size="sm">
                          <FormattedMessage
                            id={
                              locale.active ? "label.active" : "label.inactive"
                            }
                          />
                        </Tag>
                      </TableCell>
                      <TableCell>{locale.sortOrder}</TableCell>
                      <TableCell>
                        <Button
                          kind="ghost"
                          size="sm"
                          disabled={saving}
                          renderIcon={Edit}
                          onClick={() => openEditor(locale)}
                        >
                          <FormattedMessage id="label.edit" />
                        </Button>
                        <Button
                          kind="ghost"
                          size="sm"
                          hasIconOnly
                          renderIcon={locale.fallback ? StarFilled : Star}
                          iconDescription={intl.formatMessage({
                            id: "locale.setFallback",
                          })}
                          onClick={() => handleSetFallback(locale)}
                          disabled={saving || locale.fallback}
                        />
                        <Button
                          kind="danger--ghost"
                          size="sm"
                          hasIconOnly
                          renderIcon={TrashCan}
                          iconDescription={intl.formatMessage({
                            id: "label.delete",
                          })}
                          onClick={() => {
                            setDeleteTarget(locale);
                            setDeleteError(false);
                          }}
                          disabled={saving || locale.fallback}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {!visibleLocales.length && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <FormattedMessage id="label.no.options.available" />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </div>
        </section>
      )}
      <Modal
        open={isModalOpen}
        size="sm"
        className="oe-admin-modal"
        modalHeading={intl.formatMessage({
          id: editingLocale ? "locale.edit.title" : "locale.add.title",
        })}
        closeButtonLabel={intl.formatMessage({ id: "label.button.close" })}
        primaryButtonText={intl.formatMessage({ id: "label.save" })}
        secondaryButtonText={intl.formatMessage({ id: "label.cancel" })}
        primaryButtonDisabled={saving}
        loadingStatus={saving ? "active" : "inactive"}
        loadingDescription={intl.formatMessage({
          id: "config.workspace.saving",
        })}
        selectorPrimaryFocus={editingLocale ? "#displayName" : "#localeCode"}
        preventCloseOnClickOutside
        onRequestClose={() => {
          if (!savingRef.current) setIsModalOpen(false);
        }}
        onRequestSubmit={handleSave}
      >
        {formError && (
          <InlineNotification
            lowContrast
            hideCloseButton
            kind="error"
            title={intl.formatMessage({ id: "error.add.edited.msg" })}
          />
        )}
        <div className="oe-admin-modal__form-grid">
          <TextInput
            id="localeCode"
            labelText={intl.formatMessage({ id: "locale.code" })}
            helperText={intl.formatMessage({ id: "locale.code.helper" })}
            value={formData.localeCode}
            onChange={(event) =>
              setFormData({ ...formData, localeCode: event.target.value })
            }
            invalid={!!formErrors.localeCode}
            invalidText={formErrors.localeCode}
            disabled={saving || !!editingLocale}
          />
          <TextInput
            id="displayName"
            labelText={intl.formatMessage({ id: "locale.displayName" })}
            helperText={intl.formatMessage({ id: "locale.displayName.helper" })}
            value={formData.displayName}
            onChange={(event) =>
              setFormData({ ...formData, displayName: event.target.value })
            }
            invalid={!!formErrors.displayName}
            invalidText={formErrors.displayName}
            disabled={saving}
          />
          <NumberInput
            id="sortOrder"
            label={intl.formatMessage({ id: "locale.sortOrder" })}
            value={formData.sortOrder}
            onChange={(_event, { value }) =>
              setFormData({ ...formData, sortOrder: value })
            }
            min={0}
            disabled={saving}
          />
          <Toggle
            id="active"
            labelText={intl.formatMessage({ id: "locale.active" })}
            labelA={intl.formatMessage({ id: "label.no" })}
            labelB={intl.formatMessage({ id: "label.yes" })}
            toggled={formData.active}
            onToggle={(checked) =>
              setFormData({ ...formData, active: checked })
            }
            disabled={saving}
          />
        </div>
      </Modal>
      <Modal
        open={deleteTarget !== null}
        alert
        danger
        size="xs"
        className="oe-admin-modal oe-confirm-modal"
        closeButtonLabel={intl.formatMessage({ id: "label.button.close" })}
        modalHeading={intl.formatMessage({ id: "locale.delete.confirm.title" })}
        primaryButtonText={intl.formatMessage({ id: "label.delete" })}
        secondaryButtonText={intl.formatMessage({ id: "label.cancel" })}
        primaryButtonDisabled={saving}
        loadingStatus={saving ? "active" : "inactive"}
        loadingDescription={intl.formatMessage({
          id: "config.workspace.saving",
        })}
        preventCloseOnClickOutside
        onRequestClose={() => {
          if (!savingRef.current) setDeleteTarget(null);
        }}
        onRequestSubmit={confirmDelete}
      >
        <p className="oe-confirm-modal__message">
          <FormattedMessage id="locale.delete.confirm.message" />
        </p>
        {deleteTarget && (
          <p className="oe-confirm-modal__subject">
            <strong>
              {deleteTarget.displayName} ({deleteTarget.localeCode})
            </strong>
          </p>
        )}
        {deleteError && (
          <InlineNotification
            lowContrast
            hideCloseButton
            kind="error"
            title={intl.formatMessage({ id: "locale.delete.error" })}
          />
        )}
      </Modal>
    </div>
  );
};

export default LanguageManagement;
