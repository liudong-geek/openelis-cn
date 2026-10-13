import React, { useContext, useState, useEffect, useRef } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  Loading,
  InlineLoading,
  InlineNotification,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableBody,
  TableHeader,
  TableCell,
  TableSelectRow,
  TableContainer,
  Pagination,
  Search,
  Modal,
  TextInput,
  Select,
  SelectItem,
  Button,
  Tag,
} from "@carbon/react";
import {
  getFromOpenElisServer,
  postToOpenElisServerFullResponse,
} from "../../utils/Utils";
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
import { FormattedMessage, injectIntl, useIntl } from "react-intl";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import { getPhoneFormatHint } from "../../patient/phoneFormatHint";
import "../AdminListWorkspace.css";
import "../AdminModal.css";

interface ProviderPerson {
  lastName?: string;
  firstName?: string;
  workPhone?: string;
  fax?: string;
  email?: string;
}

interface ProviderRecord {
  id: string;
  fhirUuid: string;
  person: ProviderPerson;
  active: boolean | string;
}

interface ProviderDraft {
  person: ProviderPerson;
  active: boolean;
  fhirUuid?: string;
}

interface PendingProviderSave {
  draft: ProviderDraft;
  identity?: Pick<ProviderRecord, "id" | "fhirUuid">;
}

interface ProviderMenuResponse {
  providers?: ProviderRecord[];
  fromRecordCount?: string;
  toRecordCount?: string;
  totalRecordCount?: string;
}

interface ProviderTableRow {
  id: string;
  fhirUuid: string;
  lastName: string;
  firstName: string;
  displayName: string;
  active: boolean | string;
  telephone?: string;
  fax?: string;
  email?: string;
  actions: string;
}

interface YesNoOption {
  id: "yes" | "no";
  value: string;
}

interface ValidationResult {
  body: string;
  status: boolean;
}

interface CarbonTableCell {
  id: string;
  value: ReactNode;
  info: { header: string };
}

interface CarbonTableRow {
  id: string;
}

interface NotificationContextValue {
  notificationVisible: boolean;
  setNotificationVisible: (visible: boolean) => void;
  addNotification: (notification: {
    kind: string;
    title: string;
    message: string;
  }) => void;
}

interface ConfigurationContextValue {
  reloadConfiguration: () => void;
  configurationProperties: Record<string, string>;
}

// eslint-disable-next-line prefer-const -- preserve the original JavaScript runtime declaration
let breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
  {
    label: "provider.browse.title",
    link: "/MasterListsPage/providerMenu",
  },
];

const isEnabledValue = (value: ReactNode) =>
  value === true ||
  ["true", "y", "yes", "1"].includes(String(value).toLowerCase());

const isProviderUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const matchesSavedProvider = (
  value: unknown,
  pending: PendingProviderSave,
): value is ProviderRecord => {
  const record = value as ProviderRecord | undefined;
  if (
    !record ||
    !/^[1-9]\d*$/.test(String(record.id)) ||
    !isProviderUuid(record.fhirUuid) ||
    !record.person ||
    !["true", "false", "y", "n", "yes", "no", "1", "0"].includes(
      String(record.active).toLowerCase(),
    )
  )
    return false;
  if (
    pending.identity &&
    (String(record.id) !== String(pending.identity.id) ||
      record.fhirUuid !== pending.identity.fhirUuid)
  )
    return false;
  return (
    isEnabledValue(record.active) === pending.draft.active &&
    (["lastName", "firstName", "workPhone", "fax", "email"] as const).every(
      (field) =>
        (record.person[field] || "") === (pending.draft.person[field] || ""),
    )
  );
};

function ProviderMenu() {
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext) as unknown as NotificationContextValue;
  const { reloadConfiguration, configurationProperties } = useContext(
    ConfigurationContext,
  ) as unknown as ConfigurationContextValue;

  const intl = useIntl();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [panelSearchTerm, setPanelSearchTerm] = useState("");
  const [appliedSearchTerm, setAppliedSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);
  const [saving, setSavingState] = useState(false);
  const savingRef = useRef(false);
  const setSaving = (value: boolean) => {
    savingRef.current = value;
    setSavingState(value);
  };
  const [reloadKey, setReloadKey] = useState(0);
  const [providerMenuList, setProviderMenuList] =
    useState<ProviderMenuResponse>({});
  const [providerMenuListShow, setProviderMenuListShow] = useState<
    ProviderTableRow[]
  >([]);
  const [totalRecordCount, setTotalRecordCount] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"add" | "update">("add");
  const editorVersion = useRef(0);
  const phoneValidationVersion = useRef(0);
  const pendingSaveRef = useRef<PendingProviderSave | null>(null);
  const [pendingSave, setPendingSaveState] =
    useState<PendingProviderSave | null>(null);
  const [matchingProviders, setMatchingProviders] = useState<ProviderRecord[]>(
    [],
  );
  const [editorMessage, setEditorMessage] = useState("");
  const [nextCandidateStart, setNextCandidateStart] = useState<number | null>(
    null,
  );
  const setPendingSave = (pending: PendingProviderSave | null) => {
    pendingSaveRef.current = pending;
    setPendingSaveState(pending);
  };
  useEffect(
    () => () => {
      editorVersion.current += 1;
      phoneValidationVersion.current += 1;
    },
    [],
  );
  const [currentProvider, setCurrentProvider] =
    useState<ProviderTableRow | null>(null);
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [telephone, setTelephone] = useState<string | undefined>("");
  const [fax, setFax] = useState<string | undefined>("");
  const [email, setEmail] = useState("");
  const [isActive, setIsActive] = useState<YesNoOption>({
    id: "yes",
    value: intl.formatMessage({ id: "label.yes" }),
  });
  const [phoneValidation, setPhoneValidation] = useState<ValidationResult>({
    body: "",
    status: true,
  });
  const [emailValidation, setEmailValidation] = useState<ValidationResult>({
    body: "",
    status: true,
  });

  const handleMenuItems = (res?: ProviderMenuResponse) => {
    if (!res) {
      setLoading(false);
      setRefreshing(false);
      setNotificationVisible(true);
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "server.error.msg" }),
      });
      return;
    }
    setProviderMenuList(res);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    const debounce = window.setTimeout(() => {
      setPage(1);
      setAppliedSearchTerm(panelSearchTerm.trim());
    }, 300);
    return () => window.clearTimeout(debounce);
  }, [panelSearchTerm]);

  useEffect(() => {
    if (providerMenuList.providers) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    const endpoint = appliedSearchTerm
      ? `/rest/SearchProviderMenu?search=Y&startingRecNo=1&searchString=${encodeURIComponent(
          appliedSearchTerm,
        )}`
      : "/rest/ProviderMenu?paging=1&startingRecNo=1";
    getFromOpenElisServer(endpoint, handleMenuItems);
  }, [appliedSearchTerm, reloadKey]);

  useEffect(() => {
    if (providerMenuList.providers) {
      const newProviderMenuList = providerMenuList.providers.map((item) => {
        const displayName = [item.person.lastName, item.person.firstName]
          .filter(Boolean)
          .join(" ");
        return {
          id: item.id,
          fhirUuid: item.fhirUuid,
          lastName: item.person.lastName || "",
          firstName: item.person.firstName || "",
          displayName,
          active: item.active,
          telephone: item.person.workPhone,
          fax: item.person.fax,
          email: item.person.email,
          actions: item.id,
        };
      });
      setTotalRecordCount(providerMenuList.totalRecordCount || "0");
      setProviderMenuListShow(newProviderMenuList);
    }
  }, [providerMenuList]);

  function finishSave(verified = false) {
    setSaving(false);
    setPendingSave(null);
    setMatchingProviders([]);
    setEditorMessage("");
    setEditorOpen(false);
    setNotificationVisible(true);
    addNotification({
      kind: NotificationKinds.success,
      title: intl.formatMessage({ id: "notification.title" }),
      message: intl.formatMessage({
        id: verified ? "provider.save.confirmed" : "save.config.success.msg",
      }),
    });
    reloadConfiguration();
    setSelectedRowIds([]);
    setReloadKey((value) => value + 1);
  }

  async function displayStatus(
    res: Response | undefined,
    submitted: PendingProviderSave,
    version: number,
  ) {
    if (editorVersion.current !== version) return;
    // A rejection is retryable. Timeouts, server failures and malformed replies
    // can arrive after a write committed, so those require read-back instead.
    if (
      res &&
      !res.redirected &&
      res.status >= 400 &&
      res.status < 500 &&
      res.status !== 408
    ) {
      setSaving(false);
      setEditorMessage("server.error.msg");
      return;
    }
    if (res && !res.redirected && [200, 201].includes(res.status)) {
      try {
        const record: unknown = await res.json();
        if (editorVersion.current !== version) return;
        if (matchesSavedProvider(record, submitted)) {
          finishSave();
          return;
        }
      } catch {
        // Preserve the submitted draft if the response cannot prove the write.
      }
    }
    if (editorVersion.current !== version) return;
    setPendingSave(submitted);
    setEditorMessage("");
    setSaving(false);
  }

  function checkSavedProvider(candidate?: ProviderRecord, startingRecNo = 1) {
    const pending = pendingSaveRef.current;
    if (!pending || savingRef.current) return;
    const version = editorVersion.current;
    const identity =
      pending.identity ||
      (candidate && {
        id: candidate.id,
        fhirUuid: candidate.fhirUuid,
      });
    setSaving(true);
    setEditorMessage("");
    if (identity) {
      getFromOpenElisServer<unknown>(
        `/rest/Provider/raw/${encodeURIComponent(identity.id)}`,
        (record) => {
          if (editorVersion.current !== version) return;
          if (matchesSavedProvider(record, { ...pending, identity })) {
            finishSave(true);
          } else {
            setSaving(false);
            setMatchingProviders([]);
            setEditorMessage("provider.save.checkFailed");
          }
        },
      );
    } else {
      setNextCandidateStart(null);
      // The menu endpoint searches first-name + surname. The returned record
      // must still be chosen by the user and read back by its own identity.
      const name = `${pending.draft.person.firstName} ${pending.draft.person.lastName}`;
      getFromOpenElisServer<ProviderMenuResponse>(
        `/rest/SearchProviderMenu?search=Y&startingRecNo=${startingRecNo}&searchString=${encodeURIComponent(name)}`,
        (response) => {
          if (editorVersion.current !== version) return;
          const providers = Array.isArray(response?.providers)
            ? response.providers
            : [];
          const from = Number(response?.fromRecordCount);
          const to = Number(response?.toRecordCount);
          // This legacy service includes lookahead rows and reports the whole
          // directory count, even for a search. Use its window, not that count.
          const windowSize =
            Number.isSafeInteger(from) &&
            Number.isSafeInteger(to) &&
            from === startingRecNo &&
            to >= from
              ? to - from + 1
              : providers.length;
          const hasNext = windowSize > 0 && providers.length > windowSize;
          setNextCandidateStart(hasNext ? to + 1 : null);
          const matches = providers
            .slice(0, windowSize)
            .filter((record) => matchesSavedProvider(record, pending));
          setMatchingProviders(matches);
          setEditorMessage(
            matches.length
              ? "provider.save.matches"
              : "provider.save.checkFailed",
          );
          setSaving(false);
        },
      );
    }
  }

  function deleteDeactivateProvider() {
    setConfirmDeactivateOpen(false);
    setRefreshing(true);
    postToOpenElisServerFullResponse(
      `/rest/DeleteProvider?ID=${selectedRowIds.join(",")}&startingRecNo=1`,
      JSON.stringify({ selectedIDs: selectedRowIds }),
      (res) => {
        setRefreshing(false);
        setNotificationVisible(true);
        if (res?.ok) {
          addNotification({
            kind: NotificationKinds.success,
            title: intl.formatMessage({ id: "notification.title" }),
            message: intl.formatMessage({
              id: "provider.management.deactivate.success",
            }),
          });
          setSelectedRowIds([]);
          setReloadKey((value) => value + 1);
        } else {
          addNotification({
            kind: NotificationKinds.error,
            title: intl.formatMessage({ id: "notification.title" }),
            message: intl.formatMessage({ id: "server.error.msg" }),
          });
        }
      },
    );
  }

  const handlePageChange = ({
    page: nextPage,
    pageSize: nextPageSize,
  }: {
    page: number;
    pageSize: number;
  }) => {
    setPage(nextPage);
    setPageSize(nextPageSize);
    setSelectedRowIds([]);
  };

  const handlePanelSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    setPanelSearchTerm(query);
    setSelectedRowIds([]);
  };

  const openProviderModal = (provider?: ProviderTableRow) => {
    // Returning to an unresolved save reopens its frozen draft, not a new POST.
    if (pendingSaveRef.current || savingRef.current) {
      setEditorOpen(true);
      return;
    }
    editorVersion.current += 1;
    phoneValidationVersion.current += 1;
    setCurrentProvider(provider || null);
    setEditorMode(provider ? "update" : "add");
    setLastName(provider?.lastName || "");
    setFirstName(provider?.firstName || "");
    setTelephone(provider?.telephone || "");
    setFax(provider?.fax || "");
    setEmail(provider?.email || "");
    setPhoneValidation({ body: "", status: true });
    setEmailValidation({ body: "", status: true });
    setEditorMessage(
      provider && !isProviderUuid(provider.fhirUuid)
        ? "provider.save.identityUnavailable"
        : "",
    );
    setMatchingProviders([]);
    setNextCandidateStart(null);
    const active = !provider || isEnabledValue(provider.active);
    setIsActive({
      id: active ? "yes" : "no",
      value: intl.formatMessage({ id: active ? "label.yes" : "label.no" }),
    });
    setEditorOpen(true);
  };

  const closeProviderModal = () => {
    if (savingRef.current) return;
    setEditorOpen(false);
    phoneValidationVersion.current += 1;
  };

  const openAddModal = () => openProviderModal();
  const openUpdateModal = (providerId: string) => {
    const provider = providerMenuListShow.find((p) => p.id === providerId);
    if (provider) openProviderModal(provider);
  };

  const handleSaveProvider = () => {
    if (savingRef.current || pendingSaveRef.current || !formValid) return;
    if (
      editorMode === "update" &&
      (!currentProvider || !isProviderUuid(currentProvider.fhirUuid))
    ) {
      setEditorMessage("provider.save.identityUnavailable");
      return;
    }
    setSaving(true);
    setEditorMessage("");
    const submitted: PendingProviderSave = {
      draft: {
        ...(currentProvider ? { fhirUuid: currentProvider.fhirUuid } : {}),
        person: { lastName, firstName, workPhone: telephone, fax, email },
        active: isActive.id === "yes",
      },
      ...(currentProvider
        ? {
            identity: {
              id: currentProvider.id,
              fhirUuid: currentProvider.fhirUuid,
            },
          }
        : {}),
    };
    const version = editorVersion.current;
    postToOpenElisServerFullResponse(
      `/rest/Provider/FhirUuid?fhirUuid=${encodeURIComponent(currentProvider?.fhirUuid || "")}`,
      JSON.stringify(submitted.draft),
      (response) => displayStatus(response, submitted, version),
    );
  };

  const handleLastNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (value === "" || /^[\p{L}\p{M}.'·\-\s]+$/u.test(value)) {
      setLastName(value);
    }
  };

  const handleFirstNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (value === "" || /^[\p{L}\p{M}.'·\-\s]+$/u.test(value)) {
      setFirstName(value);
    }
  };

  const handleTelephoneChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    phoneValidationVersion.current += 1;
    setTelephone(value);
    setPhoneValidation({ body: "", status: !value });
  };

  const handlePhoneValidation = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const version = ++phoneValidationVersion.current;
    if (!value) {
      setPhoneValidation({ body: "", status: true });
      return;
    }
    getFromOpenElisServer(
      "/rest/PhoneNumberValidationProvider?fieldId=patientPhone&value=" +
        encodeURIComponent(value),
      (resp?: ValidationResult) => {
        if (phoneValidationVersion.current !== version) return;
        setPhoneValidation(
          resp || {
            body: intl.formatMessage({ id: "server.error.msg" }),
            status: false,
          },
        );
      },
    );
  };

  const handleEmailValidation = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (!value) {
      setEmailValidation({ body: "", status: true });
      return;
    }
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    setEmailValidation({
      body: valid ? "" : intl.formatMessage({ id: "error.invalid.email" }),
      status: valid,
    });
  };

  const renderCell = (cell: CarbonTableCell, row: CarbonTableRow) => {
    if (cell.info.header === "select") {
      return (
        <TableSelectRow
          key={cell.id}
          id={cell.id}
          checked={selectedRowIds.includes(row.id)}
          name="selectRowCheckbox"
          ariaLabel={intl.formatMessage({ id: "provider.select" })}
          onSelect={(e) => {
            e.stopPropagation();
            if (selectedRowIds.includes(row.id)) {
              setSelectedRowIds(selectedRowIds.filter((id) => id !== row.id));
            } else {
              setSelectedRowIds([...selectedRowIds, row.id]);
            }
          }}
        />
      );
    } else if (cell.info.header === "active") {
      return (
        <TableCell key={cell.id}>
          <Tag
            type={isEnabledValue(cell.value) ? "green" : "cool-gray"}
            size="sm"
          >
            <FormattedMessage
              id={isEnabledValue(cell.value) ? "label.yes" : "label.no"}
            />
          </Tag>
        </TableCell>
      );
    } else if (cell.info.header === "actions") {
      return (
        <TableCell key={cell.id}>
          <Button
            kind="ghost"
            size="sm"
            onClick={() => openUpdateModal(row.id)}
          >
            <FormattedMessage id="externalconnections.action.edit" />
          </Button>
        </TableCell>
      );
    } else {
      return <TableCell key={cell.id}>{cell.value || "—"}</TableCell>;
    }
  };

  if (loading) {
    return (
      <>
        <Loading />
      </>
    );
  }

  const totalProviders = Number(
    totalRecordCount || providerMenuListShow.length || 0,
  );
  const activeProviders = providerMenuListShow.filter((provider) =>
    isEnabledValue(provider.active),
  ).length;
  const inactiveProviders = Math.max(
    providerMenuListShow.length - activeProviders,
    0,
  );
  const visibleProviders = providerMenuListShow.filter(
    (provider) =>
      statusFilter === "all" ||
      (statusFilter === "active"
        ? isEnabledValue(provider.active)
        : !isEnabledValue(provider.active)),
  );
  const selectedCount = selectedRowIds.length;
  const formValid =
    String(lastName || "").trim().length > 0 &&
    String(firstName || "").trim().length > 0 &&
    phoneValidation.status &&
    (email === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  const editorPrefix = `provider-${editorMode}`;
  const fieldsLocked = saving || !!pendingSave;
  const identityUnavailable =
    editorMode === "update" && !isProviderUuid(currentProvider?.fhirUuid);

  return (
    <>
      {notificationVisible === true ? <AlertDialog /> : ""}
      <Modal
        className="oe-admin-modal"
        open={confirmDeactivateOpen}
        danger
        modalHeading={intl.formatMessage({
          id: "provider.management.deactivate.confirm.title",
        })}
        closeButtonLabel={intl.formatMessage({ id: "label.button.close" })}
        primaryButtonText={intl.formatMessage({
          id: "externalconnections.action.deactivate",
        })}
        secondaryButtonText={intl.formatMessage({ id: "label.button.cancel" })}
        onRequestClose={() => setConfirmDeactivateOpen(false)}
        onRequestSubmit={deleteDeactivateProvider}
        preventCloseOnClickOutside
      >
        <FormattedMessage
          id="provider.management.deactivate.confirm.message"
          values={{ count: selectedCount }}
        />
      </Modal>
      <div className="adminPageContent admin-list-workspace admin-list-workspace--compact provider-management-page">
        <PageBreadCrumb breadcrumbs={breadcrumbs} />
        <ProductPageHeader
          title={<FormattedMessage id="provider.browse.title" />}
          subtitle={<FormattedMessage id="provider.management.subtitle" />}
          actions={
            <Button size="sm" onClick={openAddModal}>
              <FormattedMessage id="provider.management.action.add" />
            </Button>
          }
        />

        {pendingSave && !editorOpen && (
          <section
            aria-label={intl.formatMessage({ id: "provider.save.resume" })}
          >
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title={intl.formatMessage({ id: "provider.save.unconfirmed" })}
            />
            <Button kind="ghost" size="sm" onClick={() => setEditorOpen(true)}>
              <FormattedMessage id="provider.save.resume" />
            </Button>
          </section>
        )}
        <section className="admin-list-workspace__overview">
          <article>
            <span>
              <FormattedMessage id="provider.management.metric.total" />
            </span>
            <strong>{totalProviders}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="provider.management.metric.active" />
            </span>
            <strong>{activeProviders}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="provider.management.metric.inactive" />
            </span>
            <strong>{inactiveProviders}</strong>
          </article>
        </section>

        <section className="admin-list-workspace__surface">
          <div className="admin-list-workspace__section-heading">
            <div>
              <h2>
                <FormattedMessage id="provider.management.list.title" />
              </h2>
              <p>
                <FormattedMessage id="provider.management.list.subtitle" />
              </p>
            </div>
            <div className="admin-list-workspace__selection-actions">
              <span>
                <FormattedMessage
                  id="provider.management.selected"
                  values={{ count: selectedCount }}
                />
              </span>
              <Button
                kind="danger--ghost"
                size="sm"
                disabled={selectedCount === 0 || refreshing}
                onClick={() => setConfirmDeactivateOpen(true)}
              >
                <FormattedMessage id="externalconnections.action.deactivate" />
              </Button>
            </div>
          </div>

          <div className="admin-list-workspace__filters admin-list-workspace__filters--organization">
            <Search
              size="lg"
              id="provider-search-bar"
              labelText={<FormattedMessage id="provider.search" />}
              placeholder={intl.formatMessage({
                id: "provider.search.placeholder",
              })}
              closeButtonLabelText={intl.formatMessage({
                id: "provider.management.search.clear",
              })}
              onChange={handlePanelSearchChange}
              value={panelSearchTerm}
            />
            <Select
              id="provider-status-filter"
              labelText={intl.formatMessage({
                id: "provider.management.filter.status",
              })}
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setSelectedRowIds([]);
                setStatusFilter(event.target.value);
              }}
            >
              <SelectItem
                value="all"
                text={intl.formatMessage({
                  id: "provider.management.filter.all",
                })}
              />
              <SelectItem
                value="active"
                text={intl.formatMessage({
                  id: "provider.management.filter.active",
                })}
              />
              <SelectItem
                value="inactive"
                text={intl.formatMessage({
                  id: "provider.management.filter.inactive",
                })}
              />
            </Select>
            <p role="status">
              <FormattedMessage
                id="provider.management.results"
                values={{ count: visibleProviders.length }}
              />
            </p>
            {refreshing && (
              <InlineLoading
                className="admin-list-workspace__refreshing"
                description={intl.formatMessage({
                  id: "admin.list.refreshing",
                })}
              />
            )}
          </div>

          {visibleProviders.length === 0 ? (
            <div className="admin-list-workspace__empty" role="status">
              <div aria-hidden="true">0</div>
              <h3>
                <FormattedMessage
                  id={
                    appliedSearchTerm || statusFilter !== "all"
                      ? "provider.management.empty.filtered.title"
                      : "provider.management.empty.title"
                  }
                />
              </h3>
              <p>
                <FormattedMessage
                  id={
                    appliedSearchTerm || statusFilter !== "all"
                      ? "provider.management.empty.filtered.subtitle"
                      : "provider.management.empty.subtitle"
                  }
                />
              </p>
              {!appliedSearchTerm && statusFilter === "all" && (
                <Button size="sm" onClick={openAddModal}>
                  <FormattedMessage id="provider.management.action.add" />
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="admin-list-workspace__table-scroll">
                <DataTable
                  rows={visibleProviders.slice(
                    (page - 1) * pageSize,
                    page * pageSize,
                  )}
                  headers={[
                    {
                      key: "select",
                      header: intl.formatMessage({ id: "provider.select" }),
                    },
                    {
                      key: "displayName",
                      header: intl.formatMessage({
                        id: "provider.management.column.name",
                      }),
                    },
                    {
                      key: "active",
                      header: intl.formatMessage({ id: "provider.isActive" }),
                    },
                    {
                      key: "telephone",
                      header: intl.formatMessage({ id: "provider.telephone" }),
                    },
                    {
                      key: "email",
                      header: intl.formatMessage({ id: "provider.email" }),
                    },
                    {
                      key: "actions",
                      header: intl.formatMessage({
                        id: "admin.list.column.actions",
                      }),
                    },
                  ]}
                >
                  {({ rows, headers, getHeaderProps, getTableProps }) => (
                    <TableContainer className="admin-list-workspace__table">
                      <Table {...getTableProps()}>
                        <TableHead>
                          <TableRow>
                            {headers.map((header) => (
                              <TableHeader
                                {...getHeaderProps({ header })}
                                key={header.key}
                              >
                                {header.header}
                              </TableHeader>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {rows.map((row) => (
                            <TableRow key={row.id}>
                              {row.cells.map((cell) => renderCell(cell, row))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </DataTable>
              </div>
              <Pagination
                className="admin-list-workspace__pagination"
                onChange={handlePageChange}
                page={page}
                pageSize={pageSize}
                pageSizes={[10, 20]}
                totalItems={visibleProviders.length}
                forwardText={intl.formatMessage({ id: "pagination.forward" })}
                backwardText={intl.formatMessage({ id: "pagination.backward" })}
                itemRangeText={(min, max, total) =>
                  intl.formatMessage(
                    { id: "pagination.item-range" },
                    { min: min, max: max, total: total },
                  )
                }
                itemsPerPageText={intl.formatMessage({
                  id: "pagination.items-per-page",
                })}
                itemText={(min, max) =>
                  intl.formatMessage(
                    { id: "pagination.item" },
                    { min: min, max: max },
                  )
                }
                pageNumberText={intl.formatMessage({
                  id: "pagination.page-number",
                })}
                pageRangeText={(_current, total) =>
                  intl.formatMessage(
                    { id: "pagination.page-range" },
                    { total: total },
                  )
                }
                pageText={(currentPage, pagesUnknown) =>
                  intl.formatMessage(
                    { id: "pagination.page" },
                    { page: pagesUnknown ? "" : currentPage },
                  )
                }
              />
            </>
          )}
        </section>
      </div>
      <Modal
        className="oe-admin-modal oe-admin-modal--large"
        open={editorOpen}
        modalHeading={intl.formatMessage({
          id:
            editorMode === "add"
              ? "provider.modal.add.heading"
              : "provider.modal.update.heading",
        })}
        closeButtonLabel={intl.formatMessage({ id: "label.button.close" })}
        selectorPrimaryFocus={`#${editorPrefix}-last-name`}
        primaryButtonText={intl.formatMessage({
          id: pendingSave
            ? "provider.save.check"
            : editorMode === "add"
              ? "label.button.add"
              : "label.button.update",
        })}
        secondaryButtonText={intl.formatMessage({
          id: pendingSave
            ? "provider.save.returnToList"
            : "label.button.cancel",
        })}
        primaryButtonDisabled={
          saving || (!pendingSave && (!formValid || identityUnavailable))
        }
        onRequestSubmit={() =>
          pendingSave ? checkSavedProvider() : handleSaveProvider()
        }
        onRequestClose={closeProviderModal}
        preventCloseOnClickOutside
      >
        {(pendingSave || editorMessage) && (
          <InlineNotification
            kind={pendingSave ? "warning" : "error"}
            lowContrast
            hideCloseButton
            title={intl.formatMessage({
              id: pendingSave ? "provider.save.unconfirmed" : editorMessage,
            })}
            subtitle={
              pendingSave && editorMessage
                ? intl.formatMessage({ id: editorMessage })
                : undefined
            }
          />
        )}
        {saving && (
          <InlineLoading
            description={intl.formatMessage({ id: "loading.description" })}
          />
        )}
        <div className="provider-editor-form">
          <TextInput
            id={`${editorPrefix}-last-name`}
            disabled={fieldsLocked}
            labelText={intl.formatMessage({ id: "provider.providerLastName" })}
            value={lastName}
            onChange={(e) => handleLastNameChange(e)}
            required
          />
          <TextInput
            id={`${editorPrefix}-first-name`}
            disabled={fieldsLocked}
            labelText={intl.formatMessage({ id: "provider.providerFirstName" })}
            value={firstName}
            onChange={(e) => handleFirstNameChange(e)}
            required
          />
          <TextInput
            id={`${editorPrefix}-telephone`}
            disabled={fieldsLocked}
            labelText={intl.formatMessage(
              { id: "patient.label.primaryphone" },
              { PHONE_FORMAT: "" },
            )}
            helperText={getPhoneFormatHint(intl, configurationProperties)}
            value={telephone}
            onChange={(e) => handleTelephoneChange(e)}
            onBlur={(e) => handlePhoneValidation(e)}
            invalid={!phoneValidation.status && !!phoneValidation.body}
            invalidText={phoneValidation.status ? "" : phoneValidation.body}
          />
          <TextInput
            id={`${editorPrefix}-email`}
            disabled={fieldsLocked}
            labelText={intl.formatMessage({ id: "provider.email" })}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              handleEmailValidation(e);
            }}
            onBlur={(e) => handleEmailValidation(e)}
            invalid={!emailValidation.status}
            invalidText={emailValidation.status ? "" : emailValidation.body}
          />
          <Select
            id={`${editorPrefix}-active`}
            disabled={fieldsLocked}
            labelText={intl.formatMessage({ id: "label.active" })}
            value={isActive.id}
            onChange={(event) =>
              setIsActive({
                id: event.target.value as "yes" | "no",
                value: intl.formatMessage({
                  id: event.target.value === "yes" ? "label.yes" : "label.no",
                }),
              })
            }
          >
            <SelectItem
              value="yes"
              text={intl.formatMessage({ id: "label.yes" })}
            />
            <SelectItem
              value="no"
              text={intl.formatMessage({ id: "label.no" })}
            />
          </Select>
          <TextInput
            id={`${editorPrefix}-fax`}
            disabled={fieldsLocked}
            labelText={intl.formatMessage({ id: "provider.fax" })}
            value={fax}
            onChange={(e) => setFax(e.target.value)}
          />
        </div>
        {matchingProviders.length > 0 && (
          <Table
            size="sm"
            aria-label={intl.formatMessage({ id: "provider.save.matches" })}
          >
            <TableHead>
              <TableRow>
                <TableHeader>
                  <FormattedMessage id="provider.save.providerId" />
                </TableHeader>
                <TableHeader>
                  <FormattedMessage id="provider.management.column.name" />
                </TableHeader>
                <TableHeader>
                  <FormattedMessage id="provider.email" />
                </TableHeader>
                <TableHeader>
                  <FormattedMessage id="label.button.select" />
                </TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {matchingProviders.map((provider) => (
                <TableRow key={provider.id}>
                  <TableCell>{provider.id}</TableCell>
                  <TableCell>
                    {provider.person.lastName} {provider.person.firstName}
                  </TableCell>
                  <TableCell>{provider.person.email || "—"}</TableCell>
                  <TableCell>
                    <Button
                      kind="ghost"
                      size="sm"
                      disabled={saving}
                      onClick={() => checkSavedProvider(provider)}
                    >
                      <FormattedMessage id="provider.save.confirmRecord" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {nextCandidateStart !== null && (
          <Button
            kind="ghost"
            size="sm"
            disabled={saving}
            onClick={() => checkSavedProvider(undefined, nextCandidateStart)}
          >
            <FormattedMessage id="provider.save.nextCandidates" />
          </Button>
        )}
      </Modal>
    </>
  );
}

export default injectIntl(ProviderMenu);
