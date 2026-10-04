/**
 * S-04: Sample Type Domain Classification — React/Carbon Implementation
 *
 * Addendum to OGC-296 (Sample Type Management Module).
 * Shows:
 * - Sample Type list with Domain column and domain filter
 * - Basic Info tab with new Domain dropdown
 * - Real-time test count display for each sample type
 *
 * Dependencies: @carbon/react, @carbon/icons-react
 */

import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import { useHistory, useLocation, useParams } from "react-router-dom";
import {
  Grid,
  Column,
  Stack,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TextInput,
  Select,
  SelectItem,
  Toggle,
  Button,
  InlineNotification,
  Tag,
  Tile,
  Loading,
  Pagination,
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Modal,
} from "@carbon/react";
import {
  DEFAULT_SAMPLE_TYPE_SECTION,
  isValidSampleTypeSection,
} from "./sectionConfig";
import TerminologySection from "./sections/TerminologySection";
import DisplayOrderSection from "./sections/DisplayOrderSection";
import DisposalSection from "./sections/DisposalSection";
import AssociatedTestsSection from "./sections/AssociatedTestsSection";
import {
  Add,
  Edit,
  Save,
  Renew,
  CheckmarkFilled,
  WarningFilled,
} from "@carbon/react/icons";
import { injectIntl, FormattedMessage } from "react-intl";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import useDomains from "../../common/useDomains";
import {
  getFromOpenElisServer,
  postToOpenElisServerJsonResponse,
  putToOpenElisServerFullResponse,
} from "../../utils/Utils";
import "../AdminListWorkspace.css";
import "../AdminModal.css";
import "./SampleTypeManagement.css";

// Breadcrumbs
let breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
  {
    label: "configuration.sampleType.manage",
    link: "/MasterListsPage/SampleTypeManagement",
  },
];

// ─── Domain Config ────────────────────────────────────────────────
// Domain values come from the single /rest/domains source (useDomains); only
// the tag color palette is presentational and assigned by list position.
const DOMAIN_TAG_COLORS = ["green", "purple", "teal", "cyan", "magenta"];

// ─── Main Component ───────────────────────────────────────────────

import {
  readSampleTypeListContext,
  sampleTypeListUrl,
  safeSampleTypeReturnTo,
  mapSampleType,
  sampleTypeDraft,
  emptySampleTypeDraft,
  sampleTypeDraftSnapshot,
  sampleTypeUpdatePayload,
  sampleTypeCreatePayload,
  createdSampleTypeId,
  isCompleteSampleTypeDetail,
  sampleTypeUpdateMatchesDetail,
} from "./basicEditorHelpers";

function SampleTypeManagement({ intl }) {
  const history = useHistory();
  const location = useLocation();
  const { sampleTypeId, section } = useParams();
  const basePath = location.pathname.startsWith("/admin")
    ? "/admin"
    : "/MasterListsPage";
  const listUrl = `${basePath}/SampleTypeManagement`;
  const view = !sampleTypeId
    ? "list"
    : sampleTypeId === "new"
      ? "add"
      : "editor";
  const activeSection = isValidSampleTypeSection(section)
    ? section
    : DEFAULT_SAMPLE_TYPE_SECTION;
  const routeReturnTo = safeSampleTypeReturnTo(
    new URLSearchParams(location.search).get("returnTo"),
    listUrl,
  );
  const initialContext = readSampleTypeListContext(
    view === "editor" ? routeReturnTo.split("?")[1] : location.search,
  );
  const [searchText, setSearchText] = useState(initialContext.searchText);
  const [domainFilter, setDomainFilter] = useState(initialContext.domainFilter);
  const [page, setPage] = useState(initialContext.page);
  const [pageSize, setPageSize] = useState(initialContext.pageSize);
  const listReturnTo = sampleTypeListUrl(listUrl, {
    searchText,
    domainFilter,
    page,
    pageSize,
  });
  const [sampleTypes, setSampleTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadRevision, setLoadRevision] = useState(0);
  const [modalId, setModalId] = useState(null);
  const [editingType, setEditingType] = useState(null);
  const [initialDraft, setInitialDraft] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [detailRevision, setDetailRevision] = useState(0);
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedState, setSavedState] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const mounted = useRef(true);
  const requestScope = useRef(0);
  const listScope = useRef(0);
  const savingRef = useRef(false);
  const allowNavigation = useRef(false);
  const pendingNavigation = useRef(null);
  const nameInputRef = useRef(null);
  const closeRequestRef = useRef(null);
  const domains = useDomains();
  const domainColor = useCallback(
    (id) => {
      const index = domains.findIndex((d) => d.id === id);
      return index >= 0
        ? DOMAIN_TAG_COLORS[index % DOMAIN_TAG_COLORS.length]
        : "gray";
    },
    [domains],
  );
  const domainLabel = useCallback(
    (id) => {
      const match = domains.find((d) => d.id === id);
      return match ? intl.formatMessage({ id: match.labelKey }) : id;
    },
    [domains, intl],
  );
  const effectiveModalId = view === "add" ? "new" : modalId;
  const requestedId =
    effectiveModalId || (view === "editor" ? sampleTypeId : null);
  const isCreate = effectiveModalId === "new";
  const modalOpen = !!effectiveModalId;
  const isDirty =
    !!editingType &&
    sampleTypeDraftSnapshot(editingType) !==
      sampleTypeDraftSnapshot(initialDraft) &&
    !savedState;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestScope.current += 1;
      listScope.current += 1;
    };
  }, []);

  const readList = useCallback(
    () =>
      new Promise((resolve, reject) => {
        const scope = ++listScope.current;
        getFromOpenElisServer("/rest/sample-types", (response) => {
          if (!mounted.current || scope !== listScope.current) {
            resolve(null);
            return;
          }
          const data = Array.isArray(response)
            ? response
            : response?.success && Array.isArray(response.data)
              ? response.data
              : null;
          if (!data || data.some((record) => !record?.id)) {
            reject(new Error("Invalid list response"));
            return;
          }
          const mapped = data.map(mapSampleType);
          setSampleTypes(mapped);
          setLoadError(false);
          resolve(mapped);
        });
      }),
    [],
  );

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setLoadError(false);
    readList()
      .catch(() => {
        if (active && mounted.current) setLoadError(true);
      })
      .finally(() => {
        if (active && mounted.current) setIsLoading(false);
      });
    return () => {
      active = false;
      listScope.current += 1;
    };
  }, [loadRevision, readList]);
  const retryLoad = () => setLoadRevision((revision) => revision + 1);

  useEffect(() => {
    const scope = ++requestScope.current;
    setEditingType(null);
    setInitialDraft(null);
    setFormErrors({});
    setSavedState(null);
    savingRef.current = false;
    setIsSubmitting(false);
    setDetailError(false);
    setConfirmLeave(false);
    if (!requestedId) {
      setDetailLoading(false);
      return undefined;
    }
    if (requestedId === "new") {
      const draft = emptySampleTypeDraft();
      setEditingType(draft);
      setInitialDraft(draft);
      setDetailLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    getFromOpenElisServer(
      `/rest/sample-types/${encodeURIComponent(requestedId)}`,
      (response) => {
        if (!mounted.current || scope !== requestScope.current) return;
        if (
          response?.success &&
          isCompleteSampleTypeDetail(response.data, requestedId)
        ) {
          const draft = sampleTypeDraft(mapSampleType(response.data));
          setEditingType(draft);
          setInitialDraft(draft);
        } else setDetailError(true);
        setDetailLoading(false);
      },
      controller.signal,
    );
    return () => {
      controller.abort();
      requestScope.current += 1;
    };
  }, [requestedId, detailRevision]);

  useEffect(() => {
    if (sampleTypeId && (!section || !isValidSampleTypeSection(section))) {
      history.replace(
        `${listUrl}/${sampleTypeId}/${DEFAULT_SAMPLE_TYPE_SECTION}${location.search}`,
      );
    }
  }, [sampleTypeId, section, history, listUrl, location.search]);

  useEffect(
    () =>
      history.block((next) => {
        if (allowNavigation.current) return undefined;
        if (savingRef.current) return false;
        if (isDirty) {
          pendingNavigation.current = next;
          setConfirmLeave(true);
          return false;
        }
        return undefined;
      }),
    [history, isDirty],
  );
  useEffect(() => {
    const beforeUnload = (event) => {
      if (savingRef.current || isDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [isDirty]);

  const filteredTypes = useMemo(
    () =>
      sampleTypes.filter((st) => {
        const search = searchText.toLowerCase();
        return (
          (!search ||
            st.name.toLowerCase().includes(search) ||
            st.description.toLowerCase().includes(search)) &&
          (!domainFilter || st.domain === domainFilter)
        );
      }),
    [sampleTypes, searchText, domainFilter],
  );
  const paginatedTypes = filteredTypes.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );
  const domainCounts = useMemo(() => {
    const counts = {};
    domains.forEach((d) => {
      counts[d.id] = 0;
    });
    sampleTypes.forEach((st) => {
      if (counts[st.domain] !== undefined) counts[st.domain] += 1;
    });
    return counts;
  }, [sampleTypes, domains]);
  useEffect(() => {
    if (!isLoading && !loadError)
      setPage((current) =>
        Math.min(
          current,
          Math.max(1, Math.ceil(filteredTypes.length / pageSize)),
        ),
      );
  }, [isLoading, loadError, filteredTypes.length, pageSize]);
  const handlePageChange = (info) => {
    setPage(info.page);
    setPageSize(info.pageSize);
  };
  const updateSearch = (value) => {
    setSearchText(value);
    setPage(1);
  };
  const updateDomain = (value) => {
    setDomainFilter(value);
    setPage(1);
  };
  const openEditor = (st) => {
    if (!savingRef.current) {
      setShowSuccess(false);
      setModalId(String(st.id));
    }
  };
  const openAddForm = () => {
    if (!savingRef.current) {
      setShowSuccess(false);
      setModalId("new");
    }
  };
  const goToList = () => history.push(routeReturnTo);
  const closeEditor = (savedDetail = null) => {
    setModalId(null);
    setConfirmLeave(false);
    if (view !== "editor") {
      setEditingType(null);
      setInitialDraft(null);
    } else {
      const restored = savedDetail || initialDraft;
      setEditingType(restored);
      setInitialDraft(restored);
    }
    setSavedState(null);
    requestScope.current += 1;
    if (view === "add") history.replace(listReturnTo);
  };
  const requestClose = () => {
    if (savingRef.current) return false;
    if (isDirty) {
      pendingNavigation.current = null;
      setConfirmLeave(true);
    } else closeEditor();
    return false;
  };
  closeRequestRef.current = requestClose;
  const discardChanges = () => {
    const next = pendingNavigation.current;
    allowNavigation.current = true;
    closeEditor();
    if (next) history.push(next);
    allowNavigation.current = false;
  };
  const openConfiguration = (st) =>
    history.push(
      `${listUrl}/${encodeURIComponent(st.id)}/associated-tests?returnTo=${encodeURIComponent(listReturnTo)}`,
    );
  const changeDraft = (key, value) => {
    if (savingRef.current || savedState) return;
    setEditingType((previous) => ({ ...previous, [key]: value }));
    setFormErrors((previous) => ({ ...previous, [key]: "", submit: "" }));
  };

  const validateForm = (draft) => {
    const errors = {};
    if ((isCreate || initialDraft?.nameZh) && !draft.nameZh.trim())
      errors.nameZh = intl.formatMessage({
        id: "sampleType.basic.validation.nameZh",
      });

    if (!draft.domain)
      errors.domain = intl.formatMessage({
        id: "validation.sampleType.domain.required",
      });
    if (draft.abbreviation?.length > 10)
      errors.abbreviation = intl.formatMessage({
        id: "validation.sampleType.abbreviation.maxLength",
      });
    if (isCreate) {
      if (
        !draft.identifyingName.trim() ||
        draft.identifyingName.trim().length > 40
      )
        errors.identifyingName = intl.formatMessage({
          id: "sampleType.basic.validation.internalName",
        });
      ["nameEn", "nameFr"].forEach((key) => {
        if (!draft[key].trim())
          errors[key] = intl.formatMessage({
            id: "sampleType.basic.validation.translation",
          });
      });
    }
    return errors;
  };

  const readSavedRecord = async (id, scope, verificationPayload = null) => {
    const record = await new Promise((resolve, reject) =>
      getFromOpenElisServer(
        `/rest/sample-types/${encodeURIComponent(id)}`,
        (response) => {
          if (
            response?.success &&
            isCompleteSampleTypeDetail(response.data, id)
          )
            resolve(response.data);
          else reject(new Error("Invalid saved detail"));
        },
      ),
    );
    if (!mounted.current || scope !== requestScope.current) return;
    if (
      verificationPayload &&
      !sampleTypeUpdateMatchesDetail(record, verificationPayload)
    ) {
      setSavedState(null);
      setFormErrors({
        submit: intl.formatMessage({
          id: "sampleType.basic.update.notConfirmed",
        }),
      });
      return;
    }
    const detail = sampleTypeDraft(mapSampleType(record));
    setSavedState({ id: String(id) });
    setEditingType(detail);
    setInitialDraft(detail);
    try {
      await readList();
    } catch {
      const error = new Error("Verified detail but failed list refresh");
      error.confirmed = true;
      throw error;
    }
    if (!mounted.current || scope !== requestScope.current) return;
    setFormErrors({});
    setShowSuccess(true);
    savingRef.current = false;
    setIsSubmitting(false);
    closeEditor(detail);
  };
  const retrySavedRead = async () => {
    if (savingRef.current || !savedState?.id) return;
    savingRef.current = true;
    setIsSubmitting(true);
    const scope = requestScope.current;
    try {
      await readSavedRecord(
        savedState.id,
        scope,
        savedState.verificationPayload,
      );
    } catch (error) {
      if (mounted.current && scope === requestScope.current)
        setFormErrors({
          submit: intl.formatMessage({
            id:
              savedState.verificationPayload && !error?.confirmed
                ? "sampleType.basic.update.verificationFailed"
                : "sampleType.basic.saved.refreshFailed",
          }),
        });
    } finally {
      if (mounted.current && scope === requestScope.current) {
        savingRef.current = false;
        setIsSubmitting(false);
      }
    }
  };
  const saveEditor = async () => {
    if (
      !editingType ||
      detailLoading ||
      detailError ||
      savingRef.current ||
      savedState
    )
      return;
    savingRef.current = true;
    const errors = validateForm(editingType);
    setFormErrors(errors);
    if (Object.keys(errors).length) {
      savingRef.current = false;
      return;
    }
    setIsSubmitting(true);
    const scope = requestScope.current;
    let committedId = null;
    let uncertainUpdate = false;
    try {
      if (isCreate) {
        const response = await new Promise((resolve) =>
          postToOpenElisServerJsonResponse(
            "/rest/SampleTypeCreate",
            JSON.stringify(sampleTypeCreatePayload(editingType)),
            resolve,
          ),
        );
        if (!mounted.current || scope !== requestScope.current) return;
        if (
          !response ||
          response.status === 0 ||
          (response.error && !(response.status > 0))
        ) {
          setSavedState({ unconfirmed: true });
          setFormErrors({
            submit: intl.formatMessage({
              id: "sampleType.basic.create.unconfirmed",
            }),
          });
          return;
        }
        if (
          response?.error ||
          response?.success === false ||
          (response?.status &&
            (response.status < 200 || response.status >= 300))
        )
          throw new Error("Create rejected");
        committedId = createdSampleTypeId(response);
        if (!committedId) {
          setSavedState({ unconfirmed: true });
          setFormErrors({
            submit: intl.formatMessage({
              id: "sampleType.basic.create.unconfirmed",
            }),
          });
          return;
        }
      } else {
        const payload = sampleTypeUpdatePayload(editingType, initialDraft);
        const response = await new Promise((resolve) =>
          putToOpenElisServerFullResponse(
            `/rest/sample-types/${encodeURIComponent(editingType.id)}`,
            JSON.stringify(payload),
            resolve,
          ),
        );
        if (!mounted.current || scope !== requestScope.current) return;
        if (
          !response ||
          !Number.isInteger(response.status) ||
          response.status === 0 ||
          response.redirected
        ) {
          uncertainUpdate = true;
          setSavedState({
            id: String(editingType.id),
            verificationPayload: payload,
          });
          await readSavedRecord(String(editingType.id), scope, payload);
          return;
        }
        if (!response.ok) throw new Error("Update rejected");
        // Consume the response before navigating; the status confirms the write,
        // while a failed body/read-back is a refresh failure, not a second PUT.
        committedId = String(editingType.id);
        setSavedState({ id: committedId });
        if (response.json) await response.json();
      }
      if (!mounted.current || scope !== requestScope.current) return;
      setSavedState({ id: committedId });
      await readSavedRecord(committedId, scope);
    } catch (error) {
      if (!mounted.current || scope !== requestScope.current) return;
      setFormErrors({
        submit: intl.formatMessage({
          id:
            uncertainUpdate && !error?.confirmed
              ? "sampleType.basic.update.verificationFailed"
              : committedId || error?.confirmed
                ? "sampleType.basic.saved.refreshFailed"
                : isCreate
                  ? "message.sampleType.create.error"
                  : "message.sampleType.update.error",
        }),
      });
    } finally {
      if (mounted.current && scope === requestScope.current) {
        savingRef.current = false;
        setIsSubmitting(false);
      }
    }
  };
  const basicFields =
    editingType && !detailLoading && !detailError ? (
      <div className="oe-admin-modal__form-grid">
        <TextInput
          ref={nameInputRef}
          id="st-name-zh"
          labelText={intl.formatMessage({ id: "sampleType.basic.nameZh" })}
          value={editingType.nameZh}
          onChange={(event) => changeDraft("nameZh", event.target.value)}
          invalid={!!formErrors.nameZh}
          invalidText={formErrors.nameZh}
          helperText={intl.formatMessage({
            id: "sampleType.basic.nameZh.helper",
          })}
          disabled={isSubmitting || !!savedState}
          autoComplete="off"
        />
        <TextInput
          id="st-identifying-name"
          labelText={intl.formatMessage({
            id: "sampleType.basic.internalName",
          })}
          value={editingType.identifyingName}
          readOnly={!isCreate}
          disabled={isSubmitting || !!savedState}
          onChange={(event) =>
            changeDraft("identifyingName", event.target.value)
          }
          invalid={!!formErrors.identifyingName}
          invalidText={formErrors.identifyingName}
          helperText={intl.formatMessage({
            id: "sampleType.basic.internalName.helper",
          })}
          autoComplete="off"
        />
        <TextInput
          id="st-name-en"
          labelText={intl.formatMessage({ id: "sampleType.basic.nameEn" })}
          value={editingType.nameEn}
          readOnly={!isCreate}
          disabled={isSubmitting || !!savedState}
          onChange={(event) => changeDraft("nameEn", event.target.value)}
          invalid={!!formErrors.nameEn}
          invalidText={formErrors.nameEn}
          helperText={
            !isCreate
              ? intl.formatMessage({
                  id: "sampleType.basic.translation.helper",
                })
              : undefined
          }
          autoComplete="off"
        />
        <TextInput
          id="st-name-fr"
          labelText={intl.formatMessage({ id: "sampleType.basic.nameFr" })}
          value={editingType.nameFr}
          readOnly={!isCreate}
          disabled={isSubmitting || !!savedState}
          onChange={(event) => changeDraft("nameFr", event.target.value)}
          invalid={!!formErrors.nameFr}
          invalidText={formErrors.nameFr}
          autoComplete="off"
        />
        {!isCreate && (
          <TextInput
            id="st-abbreviation"
            labelText={intl.formatMessage({
              id: "sampleType.basic.abbreviation",
            })}
            value={editingType.abbreviation}
            onChange={(event) =>
              changeDraft("abbreviation", event.target.value)
            }
            invalid={!!formErrors.abbreviation}
            invalidText={formErrors.abbreviation}
            disabled={isSubmitting || !!savedState}
          />
        )}
        <Select
          id="st-domain"
          labelText={intl.formatMessage({ id: "label.sampleType.domain" })}
          value={editingType.domain}
          onChange={(event) => changeDraft("domain", event.target.value)}
          invalid={!!formErrors.domain}
          invalidText={formErrors.domain}
          disabled={isSubmitting || !!savedState}
        >
          {!domains.some((domain) => domain.id === editingType.domain) && (
            <SelectItem value={editingType.domain} text={editingType.domain} />
          )}
          {domains.map((domain) => (
            <SelectItem
              key={domain.id}
              value={domain.id}
              text={domainLabel(domain.id)}
            />
          ))}
        </Select>
        <Toggle
          id="st-active"
          labelText={intl.formatMessage({ id: "label.sampleType.active" })}
          labelA={intl.formatMessage({ id: "label.inactive" })}
          labelB={intl.formatMessage({ id: "label.active" })}
          toggled={!!editingType.active}
          onToggle={(checked) => changeDraft("active", checked)}
          disabled={isSubmitting || !!savedState}
        />
        {!isCreate && !editingType.active && editingType.testCount > 0 && (
          <InlineNotification
            className="oe-admin-modal__field--wide"
            kind="warning"
            lowContrast
            hideCloseButton
            title={intl.formatMessage(
              { id: "warning.sampleType.deactivateInUse" },
              { count: editingType.testCount },
            )}
          />
        )}
      </div>
    ) : null;

  const basicModal = (
    <>
      <ComposedModal
        open={modalOpen}
        onClose={() => closeRequestRef.current()}
        size="md"
        className="oe-admin-modal sample-type-basic-modal"
        data-testid="sample-type-basic-modal"
      >
        <ModalHeader
          title={intl.formatMessage({
            id: isCreate
              ? "heading.sampleType.add"
              : "sampleType.basic.edit.title",
          })}
          iconDescription={intl.formatMessage({ id: "button.close" })}
        />
        <ModalBody hasScrollingContent>
          <Stack gap={5}>
            {detailLoading && (
              <div className="sample-type-basic-modal__loading">
                <Loading small withOverlay={false} />
                <FormattedMessage id="label.sampleType.loading" />
              </div>
            )}
            {detailError && (
              <>
                <InlineNotification
                  kind="error"
                  title=""
                  subtitle={intl.formatMessage({
                    id: "sampleType.basic.detail.failed",
                  })}
                  lowContrast
                  hideCloseButton
                />
                <div>
                  <Button
                    kind="tertiary"
                    onClick={() => setDetailRevision((value) => value + 1)}
                  >
                    <FormattedMessage id="button.retry" />
                  </Button>
                </div>
              </>
            )}
            {formErrors.submit && (
              <InlineNotification
                kind={savedState ? "warning" : "error"}
                title=""
                subtitle={formErrors.submit}
                lowContrast
                hideCloseButton
              />
            )}
            {savedState && isSubmitting && (
              <p role="status">
                <FormattedMessage id="sampleType.basic.saved.refreshing" />
              </p>
            )}
            {basicFields}
            {!isCreate && (
              <p className="sample-type-basic-modal__helper">
                <FormattedMessage id="sampleType.basic.configure.helper" />
              </p>
            )}
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button
            kind="secondary"
            disabled={isSubmitting}
            onClick={requestClose}
          >
            <FormattedMessage id="button.cancel" />
          </Button>
          {savedState ? (
            <Button
              kind="primary"
              disabled={isSubmitting}
              onClick={
                savedState.id
                  ? retrySavedRead
                  : () => {
                      retryLoad();
                      closeEditor();
                    }
              }
            >
              <FormattedMessage
                id={savedState.id ? "sampleType.basic.refresh" : "button.retry"}
              />
            </Button>
          ) : (
            <Button
              kind="primary"
              disabled={
                isSubmitting ||
                detailLoading ||
                detailError ||
                !editingType ||
                (isCreate &&
                  (!editingType.nameZh.trim() ||
                    !editingType.identifyingName.trim() ||
                    !editingType.nameEn.trim() ||
                    !editingType.nameFr.trim()))
              }
              onClick={saveEditor}
            >
              <FormattedMessage
                id={
                  isSubmitting
                    ? "button.saving"
                    : isCreate
                      ? "button.sampleType.create"
                      : "button.save"
                }
              />
            </Button>
          )}
        </ModalFooter>
      </ComposedModal>
      {confirmLeave && (
        <Modal
          open={confirmLeave}
          className="oe-admin-modal"
          modalHeading={intl.formatMessage({ id: "workspace.leave.title" })}
          closeButtonLabel={intl.formatMessage({ id: "button.close" })}
          primaryButtonText={intl.formatMessage({
            id: "workspace.leave.confirm",
          })}
          secondaryButtonText={intl.formatMessage({
            id: "workspace.leave.cancel",
          })}
          onRequestClose={() => setConfirmLeave(false)}
          onSecondarySubmit={() => setConfirmLeave(false)}
          onRequestSubmit={discardChanges}
          danger={false}
        >
          <p>
            <FormattedMessage id="workspace.leave.helper" />
          </p>
        </Modal>
      )}
    </>
  );

  if (view === "editor") {
    return (
      <div className="adminPageContent admin-list-workspace sample-type-management-page">
        <PageBreadCrumb breadcrumbs={breadcrumbs} />
        <ProductPageHeader
          title={<FormattedMessage id="heading.sampleType.management" />}
          subtitle={
            editingType?.name || (
              <FormattedMessage id="heading.sampleType.editingGeneric" />
            )
          }
          actions={
            <Button kind="tertiary" onClick={goToList}>
              <FormattedMessage id="button.back" />
            </Button>
          }
        />
        {showSuccess && (
          <InlineNotification
            kind="success"
            title=""
            subtitle={intl.formatMessage({
              id: "message.sampleType.edit.success",
            })}
            lowContrast
            hideCloseButton
          />
        )}
        {detailLoading ? (
          <div className="sample-type-basic-modal__loading">
            <Loading small withOverlay={false} />
            <FormattedMessage id="label.sampleType.loading" />
          </div>
        ) : detailError ? (
          <Tile>
            <Stack gap={4}>
              <InlineNotification
                kind="error"
                title={intl.formatMessage({
                  id: "message.sampleType.notFound.title",
                })}
                subtitle={intl.formatMessage({
                  id: "sampleType.basic.detail.failed",
                })}
                lowContrast
                hideCloseButton
              />
              <div>
                <Button
                  kind="tertiary"
                  onClick={() => setDetailRevision((value) => value + 1)}
                >
                  <FormattedMessage id="button.retry" />
                </Button>
              </div>
            </Stack>
          </Tile>
        ) : (
          editingType && (
            <Tile className="sample-type-management-page__configuration">
              {activeSection === "basic-info" && (
                <Stack gap={5}>
                  <p>
                    <FormattedMessage id="sampleType.basic.configure.helper" />
                  </p>
                  <div className="sample-type-management-page__actions">
                    <Button
                      kind="primary"
                      onClick={() => openEditor(editingType)}
                    >
                      <FormattedMessage id="button.edit" />
                    </Button>
                    <Button
                      kind="tertiary"
                      onClick={() => openConfiguration(editingType)}
                    >
                      <FormattedMessage id="common.action.relatedConfiguration" />
                    </Button>
                  </div>
                </Stack>
              )}
              {activeSection === "associated-tests" && (
                <AssociatedTestsSection sampleTypeId={sampleTypeId} />
              )}
              {activeSection === "display-order" && (
                <DisplayOrderSection sampleTypeId={sampleTypeId} />
              )}
              {activeSection === "disposal" && (
                <DisposalSection sampleTypeId={sampleTypeId} />
              )}
              {activeSection === "terminology" && (
                <TerminologySection sampleTypeId={sampleTypeId} />
              )}
            </Tile>
          )
        )}
        {basicModal}
      </div>
    );
  }
  return (
    <div className="adminPageContent admin-list-workspace admin-list-workspace--compact sample-type-management-page">
      <PageBreadCrumb breadcrumbs={breadcrumbs} />
      <ProductPageHeader
        title={
          <FormattedMessage
            id="heading.sampleType.management"
            defaultMessage="Sample Type Management"
          />
        }
        subtitle={
          <FormattedMessage
            id="heading.sampleType.subtitle"
            defaultMessage="Configure sample types, display order, test associations, and domain classification."
          />
        }
        actions={
          <Button
            kind="primary"
            size="md"
            renderIcon={Add}
            onClick={openAddForm}
          >
            <FormattedMessage
              id="button.sampleType.add"
              defaultMessage="Add Sample Type"
            />
          </Button>
        }
        titleId="sample-type-management-title"
      />
      <Stack gap={5}>
        {showSuccess && (
          <InlineNotification
            kind="success"
            title=""
            subtitle={intl.formatMessage({
              id: "message.sampleType.edit.success",
            })}
            lowContrast
            hideCloseButton
          />
        )}

        {/* Loading State */}
        {isLoading && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "var(--cds-spacing-07)",
              alignItems: "center",
              gap: "var(--cds-spacing-03)",
            }}
          >
            <Loading small withOverlay={false} />
            <FormattedMessage id="label.sampleType.list.loading" />
          </div>
        )}

        {/* Error State */}
        {loadError && (
          <Tile>
            <Stack gap={4}>
              <InlineNotification
                kind="error"
                title={intl.formatMessage({
                  id: "message.sampleType.load.error.title",
                })}
                subtitle={intl.formatMessage({
                  id: "message.sampleType.load.error.description",
                })}
                lowContrast
                hideCloseButton
              />
              <div>
                <Button
                  kind="tertiary"
                  size="sm"
                  renderIcon={Renew}
                  onClick={retryLoad}
                >
                  <FormattedMessage id="button.retry" />
                </Button>
              </div>
            </Stack>
          </Tile>
        )}

        {!isLoading && !loadError && (
          <>
            <div className="sample-type-management-page__summary" role="status">
              <p>
                {searchText || domainFilter ? (
                  <FormattedMessage
                    id="heading.sampleType.filtered"
                    defaultMessage="Showing {filtered} of {total} sample types"
                    values={{
                      filtered: filteredTypes.length,
                      total: sampleTypes.length,
                    }}
                  />
                ) : (
                  <FormattedMessage
                    id="heading.sampleType.total"
                    defaultMessage="Total: {total} sample types"
                    values={{ total: sampleTypes.length }}
                  />
                )}
              </p>
              <div className="sample-type-management-page__domain-counts">
                {domains.map((domain) => (
                  <span key={domain.id}>
                    <Tag type={domainColor(domain.id)} size="sm">
                      {domainCounts[domain.id] || 0}
                    </Tag>
                    {domainLabel(domain.id)}
                  </span>
                ))}
              </div>
            </div>

            {/* Sample Type Table */}
            <TableContainer
              className="admin-list-workspace__surface"
              style={{ marginBottom: 0 }}
            >
              {/* Enhanced Toolbar */}
              <div className="sample-type-management-page__filters">
                <TextInput
                  id="sample-type-search"
                  labelText={intl.formatMessage({
                    id: "placeholder.sampleType.search",
                    defaultMessage: "Search sample types...",
                  })}
                  hideLabel
                  placeholder={intl.formatMessage({
                    id: "placeholder.sampleType.search",
                    defaultMessage: "Search sample types...",
                  })}
                  value={searchText}
                  onChange={(e) => updateSearch(e.target.value)}
                  size="sm"
                  className="sample-type-management-page__search"
                />
                <div className="sample-type-management-page__filter-actions">
                  <Select
                    id="domain-filter"
                    labelText={intl.formatMessage({
                      id: "label.sampleType.filterDomain",
                      defaultMessage: "Filter by domain",
                    })}
                    hideLabel
                    value={domainFilter}
                    onChange={(e) => updateDomain(e.target.value)}
                  >
                    <SelectItem
                      value=""
                      text={intl.formatMessage({
                        id: "placeholder.sampleType.filter.domain",
                        defaultMessage: "All domains",
                      })}
                    />
                    {domains.map((d) => (
                      <SelectItem
                        key={d.id}
                        value={d.id}
                        text={domainLabel(d.id)}
                      />
                    ))}
                  </Select>
                </div>
              </div>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>
                      <FormattedMessage
                        id="label.sampleType.name"
                        defaultMessage="Name"
                      />
                    </TableHeader>
                    <TableHeader>
                      <FormattedMessage
                        id="label.sampleType.domain"
                        defaultMessage="Domain"
                      />
                    </TableHeader>
                    <TableHeader>
                      <FormattedMessage
                        id="label.sampleType.status"
                        defaultMessage="Status"
                      />
                    </TableHeader>
                    <TableHeader>
                      <FormattedMessage
                        id="label.sampleType.testCount"
                        defaultMessage="Tests"
                      />
                    </TableHeader>
                    <TableHeader>
                      <FormattedMessage
                        id="label.sampleType.actions"
                        defaultMessage="Actions"
                      />
                    </TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedTypes.length > 0 ? (
                    paginatedTypes.map((st) => (
                      <TableRow key={st.id}>
                        <TableCell>
                          <div>
                            <span
                              style={{
                                fontWeight: 600,
                                color: "var(--cds-text-primary)",
                                fontSize: "14px",
                              }}
                            >
                              {st.name}
                            </span>
                            <br />
                            <span
                              style={{
                                fontSize: "12px",
                                color: "var(--cds-text-secondary)",
                                lineHeight: 1.3,
                                marginTop: "var(--cds-spacing-01)",
                              }}
                            >
                              {st.description}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Tag type={domainColor(st.domain)} size="sm">
                            {domainLabel(st.domain)}
                          </Tag>
                        </TableCell>
                        <TableCell>
                          <Tag type={st.active ? "green" : "gray"} size="sm">
                            {st.active ? (
                              <FormattedMessage
                                id="label.active"
                                defaultMessage="Active"
                              />
                            ) : (
                              <FormattedMessage
                                id="label.inactive"
                                defaultMessage="Inactive"
                              />
                            )}
                          </Tag>
                        </TableCell>
                        <TableCell>
                          <span
                            style={{
                              fontWeight: 500,
                              color: "var(--cds-text-primary)",
                            }}
                          >
                            {st.testCount}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            kind="ghost"
                            size="sm"
                            renderIcon={Edit}
                            onClick={() => openEditor(st)}
                          >
                            <FormattedMessage
                              id="button.edit"
                              defaultMessage="Edit"
                            />
                          </Button>
                          <Button
                            kind="ghost"
                            size="sm"
                            onClick={() => openConfiguration(st)}
                          >
                            <FormattedMessage id="common.action.relatedConfiguration" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        style={{
                          textAlign: "center",
                          padding: "var(--cds-spacing-07)",
                        }}
                      >
                        <div style={{ color: "var(--cds-text-secondary)" }}>
                          <FormattedMessage
                            id={
                              searchText || domainFilter
                                ? "message.sampleType.noResults"
                                : "message.sampleType.empty"
                            }
                          />
                          <div style={{ marginTop: "var(--cds-spacing-04)" }}>
                            {searchText || domainFilter ? (
                              <Button
                                kind="ghost"
                                size="sm"
                                onClick={() => {
                                  updateSearch("");
                                  updateDomain("");
                                }}
                              >
                                <FormattedMessage id="button.sampleType.clearFilters" />
                              </Button>
                            ) : (
                              <Button
                                kind="tertiary"
                                size="sm"
                                renderIcon={Add}
                                onClick={openAddForm}
                              >
                                <FormattedMessage id="button.sampleType.add" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Repository Pattern Pagination */}
            {filteredTypes.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <Pagination
                  onChange={handlePageChange}
                  page={page}
                  pageSize={pageSize}
                  pageSizes={[10, 20, 30, 50, 100]}
                  totalItems={filteredTypes.length}
                  forwardText={intl.formatMessage({
                    id: "pagination.forward",
                  })}
                  backwardText={intl.formatMessage({
                    id: "pagination.backward",
                  })}
                  itemRangeText={(min, max, total) =>
                    intl.formatMessage(
                      { id: "pagination.item-range" },
                      { min: min, max: max, total: total },
                    )
                  }
                  itemsPerPageText={intl.formatMessage({
                    id: "pagination.items-per-page",
                  })}
                  pageRangeText={(_current, total) =>
                    intl.formatMessage(
                      { id: "pagination.page-range" },
                      { total },
                    )
                  }
                  pageSelectLabelText={(total) =>
                    intl.formatMessage(
                      { id: "pagination.page-select" },
                      { total },
                    )
                  }
                  pageText={(selectedPage) =>
                    intl.formatMessage(
                      { id: "pagination.page" },
                      { page: selectedPage },
                    )
                  }
                  size="md"
                />
              </div>
            )}
          </>
        )}
      </Stack>

      {basicModal}
    </div>
  );
}

export default injectIntl(SampleTypeManagement);
