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
  TextArea,
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
  putToOpenElisServer,
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

function SampleTypeManagement({ intl }) {
  const history = useHistory();
  const location = useLocation();
  const { sampleTypeId, section } = useParams();
  const basePath = location.pathname.startsWith("/admin")
    ? "/admin"
    : "/MasterListsPage";
  const listUrl = `${basePath}/SampleTypeManagement`;

  // View is derived from the URL: no id → list, "new" → add, otherwise → editor.
  const view = !sampleTypeId
    ? "list"
    : sampleTypeId === "new"
      ? "add"
      : "editor";
  const activeSection = isValidSampleTypeSection(section)
    ? section
    : DEFAULT_SAMPLE_TYPE_SECTION;

  const [editingType, setEditingType] = useState(null);

  // Single source for the domain list + presentational helpers.
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

  // Filter state
  const [searchText, setSearchText] = useState("");
  const [domainFilter, setDomainFilter] = useState("");

  // Pagination state (following repository pattern)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Data state
  const [sampleTypes, setSampleTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadRevision, setLoadRevision] = useState(0);

  // Form validation and state
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const nameInputRef = useRef(null);

  // Associated tests for the sample type currently being edited
  const [associatedTests, setAssociatedTests] = useState([]);
  const [associatedTestsLoading, setAssociatedTestsLoading] = useState(false);
  const [associatedTestsError, setAssociatedTestsError] = useState(null);

  // Fetch sample types from backend or use mock data
  useEffect(() => {
    const fetchSampleTypes = async () => {
      try {
        setIsLoading(true);
        setLoadError(false);

        await new Promise((resolve, reject) => {
          getFromOpenElisServer("/rest/sample-types", (response) => {
            if (response && response.error) {
              reject(new Error(response.error));
              return;
            }

            // The new endpoint returns a wrapped response with data array
            if (response && response.success && Array.isArray(response.data)) {
              resolve(response.data);
            } else if (Array.isArray(response)) {
              // Fallback for direct array response
              resolve(response);
            } else {
              reject(
                new Error("Invalid response format from sample types endpoint"),
              );
            }
          });
        }).then((sampleTypeList) => {
          if (Array.isArray(sampleTypeList)) {
            const sampleTypeData = sampleTypeList.map((item, index) => ({
              id: item.id || index + 1,
              name:
                item.name ||
                item.description ||
                intl.formatMessage({ id: "label.sampleType.unnamed" }),
              description:
                item.description ||
                item.name ||
                intl.formatMessage({ id: "label.sampleType.noDescription" }),
              domain: item.domain || "CLINICAL", // Use the domain directly from the new endpoint
              active: item.isActive !== undefined ? item.isActive : true,
              testCount: item.testCount || 0, // Use actual test count from backend
            }));
            setSampleTypes(sampleTypeData);
          } else {
            throw new Error(
              "Invalid response format from sample types endpoint",
            );
          }
        });
      } catch (error) {
        setLoadError(true);
        setSampleTypes([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSampleTypes();
  }, [intl, loadRevision]);

  const retryLoad = useCallback(() => {
    setLoadRevision((revision) => revision + 1);
  }, []);

  // Focus management for add form
  useEffect(() => {
    if (view === "add" && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [view]);

  // Filtered list
  const filteredTypes = useMemo(() => {
    return sampleTypes.filter((st) => {
      const matchesSearch =
        !searchText ||
        st.name.toLowerCase().includes(searchText.toLowerCase()) ||
        st.description.toLowerCase().includes(searchText.toLowerCase());
      const matchesDomain = !domainFilter || st.domain === domainFilter;
      return matchesSearch && matchesDomain;
    });
  }, [sampleTypes, searchText, domainFilter]);

  // Paginated list (following repository pattern)
  const paginatedTypes = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredTypes.slice(startIndex, endIndex);
  }, [filteredTypes, page, pageSize]);

  // Reset pagination when filters change
  useEffect(() => {
    setPage(1);
  }, [searchText, domainFilter]);

  // Pagination handler (following repository pattern)
  const handlePageChange = useCallback(
    (pageInfo) => {
      if (page !== pageInfo.page) {
        setPage(pageInfo.page);
      }
      if (pageSize !== pageInfo.pageSize) {
        setPageSize(pageInfo.pageSize);
      }
    },
    [page, pageSize],
  );

  // Domain counts, keyed by the domains served from the single source.
  const domainCounts = useMemo(() => {
    const counts = {};
    domains.forEach((d) => {
      counts[d.id] = 0;
    });
    sampleTypes.forEach((st) => {
      if (counts[st.domain] !== undefined) {
        counts[st.domain]++;
      }
    });
    return counts;
  }, [sampleTypes, domains]);

  const loadAssociatedTests = useCallback(
    (id) => {
      setAssociatedTests([]);
      setAssociatedTestsError(null);
      setAssociatedTestsLoading(true);
      getFromOpenElisServer(
        `/rest/AllTestsForSampleTypeProvider?sampleTypeId=${encodeURIComponent(id)}`,
        (response) => {
          if (response && Array.isArray(response.tests)) {
            setAssociatedTests(response.tests);
          } else {
            setAssociatedTests([]);
            setAssociatedTestsError(
              intl.formatMessage({ id: "label.sampleType.tests.loadError" }),
            );
          }
          setAssociatedTestsLoading(false);
        },
      );
    },
    [intl],
  );

  // Hydrate editingType from the URL id whenever we're on the editor route.
  // The list may not be loaded yet on a deep link, so we tolerate an empty
  // sampleTypes list and re-run once it populates.
  useEffect(() => {
    if (view !== "editor" || !sampleTypeId) {
      return;
    }
    if (editingType && String(editingType.id) === String(sampleTypeId)) {
      return;
    }
    const st = sampleTypes.find(
      (item) => String(item.id) === String(sampleTypeId),
    );
    if (!st) {
      return;
    }
    setEditingType({
      id: st.id,
      name: st.name,
      description: st.description,
      active: st.active,
      domain: st.domain,
      testCount: st.testCount,
      abbreviation: st.abbreviation || "",
      sortOrder: st.sortOrder || 0,
    });
    setFormErrors({});
    setShowSuccess(false);
    loadAssociatedTests(st.id);
  }, [view, sampleTypeId, sampleTypes, editingType, loadAssociatedTests]);

  // Seed the "add" form once when we land on /SampleTypeManagement/new.
  useEffect(() => {
    if (view !== "add") {
      return;
    }
    if (editingType && editingType.id === null) {
      return;
    }
    setEditingType({
      id: null,
      name: "",
      description: "",
      // Inactive by default (inactive-until-configured); the admin can toggle
      // it on to create an immediately-orderable type. The toggle now reflects
      // exactly what will be persisted.
      active: false,
      domain: "CLINICAL",
      testCount: 0,
      abbreviation: "",
      sortOrder: sampleTypes.length + 1,
    });
    setFormErrors({});
    setShowSuccess(false);
  }, [view, sampleTypes.length, editingType]);

  // Clear editor state when returning to the list URL.
  useEffect(() => {
    if (view === "list" && editingType) {
      setEditingType(null);
    }
  }, [view, editingType]);

  // Canonicalize the section into the URL so deep-links + the SideNav agree.
  useEffect(() => {
    if (sampleTypeId && (!section || !isValidSampleTypeSection(section))) {
      history.replace(
        `${listUrl}/${sampleTypeId}/${DEFAULT_SAMPLE_TYPE_SECTION}`,
      );
    }
  }, [sampleTypeId, section, history, listUrl]);

  const openEditor = useCallback(
    (st) => {
      history.push(`${listUrl}/${st.id}/${DEFAULT_SAMPLE_TYPE_SECTION}`);
    },
    [history, listUrl],
  );

  const openAddForm = useCallback(() => {
    history.push(`${listUrl}/new/${DEFAULT_SAMPLE_TYPE_SECTION}`);
  }, [history, listUrl]);

  const goToList = useCallback(() => {
    history.push(listUrl);
  }, [history, listUrl]);

  // Form validation
  const validateForm = useCallback(
    (formData) => {
      const errors = {};

      // Required field validations
      if (!formData.name?.trim()) {
        errors.name = intl.formatMessage({
          id: "validation.sampleType.name.required",
        });
      } else if (formData.name.trim().length < 2) {
        errors.name = intl.formatMessage({
          id: "validation.sampleType.name.minLength",
        });
      } else if (
        sampleTypes.some(
          (st) =>
            st.name.toLowerCase() === formData.name.trim().toLowerCase() &&
            st.id !== formData.id,
        )
      ) {
        errors.name = intl.formatMessage({
          id: "validation.sampleType.name.duplicate",
        });
      }

      if (!formData.description?.trim()) {
        errors.description = intl.formatMessage({
          id: "validation.sampleType.description.required",
        });
      }

      if (!formData.domain) {
        errors.domain = intl.formatMessage({
          id: "validation.sampleType.domain.required",
        });
      }

      // Optional field validations
      if (formData.abbreviation && formData.abbreviation.length > 10) {
        errors.abbreviation = intl.formatMessage({
          id: "validation.sampleType.abbreviation.maxLength",
        });
      }

      return errors;
    },
    [sampleTypes, intl],
  );

  const refreshSampleTypes = useCallback(async () => {
    return await new Promise((resolve, reject) => {
      getFromOpenElisServer("/rest/sample-types", (response) => {
        if (response && response.success && Array.isArray(response.data)) {
          resolve(response.data);
        } else if (Array.isArray(response)) {
          resolve(response);
        } else {
          reject(
            new Error("Invalid response format from sample types endpoint"),
          );
        }
      });
    }).then((sampleTypeList) => {
      const mapped = sampleTypeList.map((item, index) => ({
        id: item.id || index + 1,
        name: item.name || item.description || "",
        description: item.description || item.name || "",
        domain: item.domain || "CLINICAL",
        active: item.isActive !== undefined ? item.isActive : true,
        testCount: item.testCount || 0,
        abbreviation: item.abbreviation || "",
        sortOrder: item.sortOrder || 0,
      }));
      setSampleTypes(mapped);
      return mapped;
    });
  }, []);

  const saveEditor = useCallback(async () => {
    if (!editingType) return;

    const errors = validateForm(editingType);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      if (view === "add") {
        // The legacy create flow also wires the workplan/results/validation
        // role modules for the new type, so creation goes through it.
        const sampleTypeData = {
          formName: "sampleTypeCreateForm",
          sampleTypeEnglishName: editingType.name.trim(),
          sampleTypeFrenchName: editingType.name.trim(),
          domain: editingType.domain || "CLINICAL",
          active: !!editingType.active,
        };
        await new Promise((resolve, reject) => {
          postToOpenElisServerJsonResponse(
            "/rest/SampleTypeCreate",
            JSON.stringify(sampleTypeData),
            (result) => {
              if (result && result.error) {
                reject(new Error(result.message || result.error));
              } else if (result && result.status && result.status !== 200) {
                reject(new Error(result.message || "Save failed"));
              } else {
                resolve(result);
              }
            },
          );
        });
        await refreshSampleTypes();
        setFormErrors({});
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
        setEditingType(null);
        history.replace(listUrl);
      } else if (view === "editor") {
        const updateData = {
          id: editingType.id,
          name: editingType.name?.trim() || editingType.name,
          description:
            editingType.description?.trim() || editingType.name?.trim(),
          domain: editingType.domain || "CLINICAL",
          abbreviation: editingType.abbreviation?.trim() || "",
          isActive:
            editingType.active !== undefined ? editingType.active : true,
          sortOrder: editingType.sortOrder || 0,
        };
        await new Promise((resolve, reject) => {
          putToOpenElisServer(
            `/rest/sample-types/${editingType.id}`,
            JSON.stringify(updateData),
            (status) => {
              if (status === 200) {
                resolve(status);
              } else {
                reject(new Error(`Update failed (HTTP ${status})`));
              }
            },
          );
        });
        await refreshSampleTypes();
        // Stay on the editor (like the Test Catalog editor) — re-sync from the
        // authoritative record so the toggle and every field reflect exactly
        // what was persisted, then show inline success.
        await new Promise((resolve) => {
          getFromOpenElisServer(
            `/rest/sample-types/${editingType.id}`,
            (res) => {
              if (res && res.success && res.data) {
                const d = res.data;
                setEditingType({
                  id: d.id,
                  name: d.name,
                  description: d.description,
                  active: d.isActive,
                  domain: d.domain,
                  testCount: d.testCount,
                  abbreviation: d.abbreviation || "",
                  sortOrder: d.sortOrder || 0,
                });
              }
              resolve();
            },
          );
        });
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
        setFormErrors({});
      }
    } catch (error) {
      setFormErrors({
        submit: intl.formatMessage({
          id:
            view === "add"
              ? "message.sampleType.create.error"
              : "message.sampleType.update.error",
        }),
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    editingType,
    view,
    validateForm,
    history,
    listUrl,
    refreshSampleTypes,
    intl,
    sampleTypes,
  ]);

  const editorRecord = useMemo(
    () =>
      view === "editor"
        ? sampleTypes.find((item) => String(item.id) === String(sampleTypeId))
        : null,
    [view, sampleTypeId, sampleTypes],
  );

  // ─── LIST VIEW ────────────────────────────────────────────────
  if (view === "list" || view === "add") {
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
          {showSuccess && view === "list" && (
            <InlineNotification
              kind="success"
              title=""
              subtitle={intl.formatMessage({
                id: "message.sampleType.add.success",
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
              <div
                className="sample-type-management-page__summary"
                role="status"
              >
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
                    onChange={(e) => setSearchText(e.target.value)}
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
                      onChange={(e) => setDomainFilter(e.target.value)}
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
                                    setSearchText("");
                                    setDomainFilter("");
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

        <ComposedModal
          open={view === "add"}
          onClose={() => {
            if (!isSubmitting) goToList();
          }}
          size="md"
          className="oe-admin-modal sample-type-create-modal"
          data-testid="sample-type-create-modal"
        >
          <ModalHeader
            title={intl.formatMessage({ id: "heading.sampleType.add" })}
            iconDescription={intl.formatMessage({ id: "button.close" })}
          />
          <ModalBody hasScrollingContent>
            <Stack gap={5}>
              {formErrors.submit && (
                <InlineNotification
                  kind="error"
                  title=""
                  subtitle={formErrors.submit}
                  lowContrast
                  hideCloseButton={false}
                  onCloseButtonClick={() =>
                    setFormErrors((prev) => ({ ...prev, submit: "" }))
                  }
                />
              )}

              <TextInput
                ref={nameInputRef}
                id="st-name"
                labelText={
                  <>
                    <FormattedMessage id="label.sampleType.name" />
                    <span style={{ color: "var(--cds-support-error)" }}>
                      {" "}
                      *
                    </span>
                  </>
                }
                value={editingType?.name || ""}
                onChange={(event) => {
                  setEditingType((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }));
                  if (formErrors.name) {
                    setFormErrors((prev) => ({ ...prev, name: "" }));
                  }
                }}
                invalid={!!formErrors.name}
                invalidText={formErrors.name}
                helperText={intl.formatMessage({
                  id: "helper.sampleType.name",
                })}
                autoComplete="off"
              />

              <Select
                id="st-domain"
                labelText={
                  <>
                    <FormattedMessage id="label.sampleType.domain" />
                    <span style={{ color: "var(--cds-support-error)" }}>
                      {" "}
                      *
                    </span>
                  </>
                }
                value={editingType?.domain || "CLINICAL"}
                onChange={(event) =>
                  setEditingType((prev) => ({
                    ...prev,
                    domain: event.target.value,
                  }))
                }
                helperText={intl.formatMessage({
                  id: "label.sampleType.domain.helper",
                })}
              >
                {domains.map((domain) => (
                  <SelectItem
                    key={domain.id}
                    value={domain.id}
                    text={domainLabel(domain.id)}
                  />
                ))}
              </Select>

              <TextArea
                id="st-description"
                labelText={
                  <>
                    <FormattedMessage id="label.sampleType.description" />
                    <span style={{ color: "var(--cds-support-error)" }}>
                      {" "}
                      *
                    </span>
                  </>
                }
                value={editingType?.description || ""}
                onChange={(event) => {
                  setEditingType((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }));
                  if (formErrors.description) {
                    setFormErrors((prev) => ({ ...prev, description: "" }));
                  }
                }}
                rows={4}
                invalid={!!formErrors.description}
                invalidText={formErrors.description}
                helperText={intl.formatMessage({
                  id: "helper.sampleType.description",
                })}
              />

              <Toggle
                id="st-active"
                labelText={intl.formatMessage({
                  id: "label.sampleType.active",
                })}
                labelA={intl.formatMessage({ id: "label.inactive" })}
                labelB={intl.formatMessage({ id: "label.active" })}
                toggled={!!editingType?.active}
                onToggle={(checked) =>
                  setEditingType((prev) => ({ ...prev, active: checked }))
                }
              />
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button kind="secondary" disabled={isSubmitting} onClick={goToList}>
              <FormattedMessage id="button.cancel" />
            </Button>
            <Button
              kind="primary"
              disabled={
                isSubmitting ||
                !editingType?.name?.trim() ||
                !editingType?.description?.trim()
              }
              onClick={saveEditor}
            >
              <FormattedMessage
                id={
                  isSubmitting
                    ? "button.sampleType.creating"
                    : "button.sampleType.create"
                }
              />
            </Button>
          </ModalFooter>
        </ComposedModal>
      </div>
    );
  }

  // ─── EDITOR VIEW ──────────────────────────────────────────────
  if (view === "editor") {
    return (
      <div className="adminPageContent">
        <PageBreadCrumb breadcrumbs={breadcrumbs} />
        <Stack gap={5}>
          {/* Editor Header — mirrors the list-view header so
              "Sample Type Management" stays the page title and tabs sit under it. */}
          <Tile style={{ padding: "var(--cds-spacing-06)" }}>
            <Grid>
              <Column lg={12} md={6} sm={4}>
                <h2
                  style={{
                    margin: "0 0 var(--cds-spacing-03) 0",
                    color: "var(--cds-text-primary)",
                    fontWeight: 600,
                  }}
                >
                  <FormattedMessage
                    id="heading.sampleType.management"
                    defaultMessage="Sample Type Management"
                  />
                </h2>
                <Stack
                  orientation="horizontal"
                  gap={3}
                  style={{ alignItems: "center", flexWrap: "wrap" }}
                >
                  <p
                    style={{
                      fontSize: "14px",
                      color: "var(--cds-text-secondary)",
                      margin: 0,
                      lineHeight: 1.4,
                    }}
                  >
                    {editingType?.name ? (
                      <FormattedMessage
                        id="heading.sampleType.editing"
                        defaultMessage="Editing: {name}"
                        values={{ name: editingType.name }}
                      />
                    ) : (
                      <FormattedMessage
                        id="heading.sampleType.editingGeneric"
                        defaultMessage="Sample type details"
                      />
                    )}
                  </p>
                  {view === "editor" && editingType?.domain && (
                    <Tag type={domainColor(editingType?.domain)} size="md">
                      {domainLabel(editingType?.domain)}
                    </Tag>
                  )}
                  {view === "editor" &&
                    editingType &&
                    (editingType?.active ? (
                      <Tag type="green" size="md">
                        <FormattedMessage
                          id="label.active"
                          defaultMessage="Active"
                        />
                      </Tag>
                    ) : (
                      <Tag type="gray" size="md">
                        <FormattedMessage
                          id="label.inactive"
                          defaultMessage="Inactive"
                        />
                      </Tag>
                    ))}
                </Stack>
              </Column>
              <Column
                lg={4}
                md={2}
                sm={4}
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "flex-start",
                }}
              >
                <Button kind="ghost" size="sm" onClick={goToList}>
                  <FormattedMessage
                    id="button.back"
                    defaultMessage="← Back to List"
                  />
                </Button>
              </Column>
            </Grid>
          </Tile>

          {/* Section content is driven by the URL: the Sample Type Management
              sidenav lists Basic Info / Associated Tests / Terminology as
              sub-items when this editor is open, mirroring the Test Catalog
              Editor pattern. */}
          <div>
            {/* The editor sections read from editingType, which hydrates
                asynchronously from the record. Render a loader until it is
                populated for the current id — otherwise controlled inputs (esp.
                the Carbon Active Toggle) would mount with undefined and not
                reflect the saved status, mirroring the Test Catalog editor's
                load-then-render pattern. */}
            {view === "editor" && isLoading ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--cds-spacing-03)",
                  padding: "var(--cds-spacing-07)",
                }}
              >
                <Loading small withOverlay={false} />
                <FormattedMessage
                  id="label.sampleType.loading"
                  defaultMessage="Loading sample type..."
                />
              </div>
            ) : view === "editor" && loadError ? (
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
            ) : view === "editor" && !editorRecord ? (
              <Tile>
                <Stack gap={4}>
                  <InlineNotification
                    kind="warning"
                    title={intl.formatMessage({
                      id: "message.sampleType.notFound.title",
                    })}
                    subtitle={intl.formatMessage({
                      id: "message.sampleType.notFound.description",
                    })}
                    lowContrast
                    hideCloseButton
                  />
                </Stack>
              </Tile>
            ) : view === "editor" &&
              !(
                editingType && String(editingType.id) === String(sampleTypeId)
              ) ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--cds-spacing-03)",
                  padding: "var(--cds-spacing-07)",
                }}
              >
                <Loading small withOverlay={false} />
                <FormattedMessage id="label.sampleType.loading" />
              </div>
            ) : (
              <>
                {activeSection === "basic-info" && (
                  <div>
                    {(showSuccess || formErrors.submit) && (
                      <div style={{ marginBottom: "var(--cds-spacing-06)" }}>
                        <Stack gap={5}>
                          {showSuccess && (
                            <InlineNotification
                              kind="success"
                              title=""
                              subtitle={intl.formatMessage({
                                id: "message.sampleType.edit.success",
                                defaultMessage:
                                  "Sample type saved successfully.",
                              })}
                              lowContrast
                              hideCloseButton
                            />
                          )}
                          {formErrors.submit && (
                            <InlineNotification
                              kind="error"
                              title=""
                              subtitle={formErrors.submit}
                              lowContrast
                              hideCloseButton={false}
                              onCloseButtonClick={() =>
                                setFormErrors((prev) => ({
                                  ...prev,
                                  submit: "",
                                }))
                              }
                            />
                          )}
                        </Stack>
                      </div>
                    )}
                    <Tile
                      style={{
                        padding: "var(--cds-spacing-07)",
                        border: "1px solid var(--cds-border-subtle)",
                        borderRadius: "var(--cds-border-radius)",
                      }}
                    >
                      <Grid>
                        <Column lg={12} md={8} sm={4}>
                          <Stack gap={6}>
                            {/* Additional spacing above the Name field */}
                            <div
                              style={{ marginBottom: "var(--cds-spacing-03)" }}
                            />
                            <TextInput
                              ref={nameInputRef}
                              id="st-name"
                              labelText={
                                <>
                                  <FormattedMessage
                                    id="label.sampleType.name"
                                    defaultMessage="Name"
                                  />
                                  <span
                                    style={{
                                      color: "var(--cds-support-error)",
                                    }}
                                  >
                                    {" "}
                                    *
                                  </span>
                                </>
                              }
                              value={editingType?.name || ""}
                              onChange={(e) => {
                                setEditingType((prev) => ({
                                  ...prev,
                                  name: e.target.value,
                                }));
                                if (formErrors.name) {
                                  setFormErrors((prev) => ({
                                    ...prev,
                                    name: "",
                                  }));
                                }
                              }}
                              invalid={!!formErrors.name}
                              invalidText={formErrors.name}
                              helperText={intl.formatMessage({
                                id: "helper.sampleType.name",
                                defaultMessage:
                                  'Enter a unique name for this sample type (e.g., "Serum", "Whole Blood")',
                              })}
                              autoComplete="off"
                            />

                            <Select
                              id="st-domain"
                              labelText={
                                <>
                                  <FormattedMessage
                                    id="label.sampleType.domain"
                                    defaultMessage="Sample Domain"
                                  />
                                  <span
                                    style={{
                                      color: "var(--cds-support-error)",
                                    }}
                                  >
                                    {" "}
                                    *
                                  </span>
                                </>
                              }
                              value={editingType?.domain || "CLINICAL"}
                              onChange={(e) =>
                                setEditingType((prev) => ({
                                  ...prev,
                                  domain: e.target.value,
                                }))
                              }
                              helperText={intl.formatMessage({
                                id: "label.sampleType.domain.helper",
                                defaultMessage:
                                  "Determines which workflow mode (Clinical or Environmental) this sample type appears in.",
                              })}
                            >
                              {domains.map((d) => (
                                <SelectItem
                                  key={d.id}
                                  value={d.id}
                                  text={domainLabel(d.id)}
                                />
                              ))}
                            </Select>

                            <Toggle
                              id="st-active"
                              labelText={intl.formatMessage({
                                id: "label.sampleType.active",
                                defaultMessage: "Active",
                              })}
                              labelA={intl.formatMessage({
                                id: "label.inactive",
                                defaultMessage: "Inactive",
                              })}
                              labelB={intl.formatMessage({
                                id: "label.active",
                                defaultMessage: "Active",
                              })}
                              toggled={editingType?.active}
                              onToggle={(checked) =>
                                setEditingType((prev) => ({
                                  ...prev,
                                  active: checked,
                                }))
                              }
                            />

                            {/* FRS v2.1 Basic Info: deactivating a type in use
                            warns but proceeds — no cascade, reversible. */}
                            {view === "editor" &&
                              !editingType?.active &&
                              associatedTests.filter((t) => t.isActive).length >
                                0 && (
                                <InlineNotification
                                  kind="warning"
                                  lowContrast
                                  hideCloseButton
                                  title={intl.formatMessage(
                                    {
                                      id: "warning.sampleType.deactivateInUse",
                                    },
                                    {
                                      count: associatedTests.filter(
                                        (t) => t.isActive,
                                      ).length,
                                    },
                                  )}
                                />
                              )}

                            <TextArea
                              id="st-description"
                              labelText={
                                <>
                                  <FormattedMessage
                                    id="label.sampleType.description"
                                    defaultMessage="Description"
                                  />
                                  <span
                                    style={{
                                      color: "var(--cds-support-error)",
                                    }}
                                  >
                                    {" "}
                                    *
                                  </span>
                                </>
                              }
                              value={editingType?.description || ""}
                              onChange={(e) => {
                                setEditingType((prev) => ({
                                  ...prev,
                                  description: e.target.value,
                                }));
                                if (formErrors.description) {
                                  setFormErrors((prev) => ({
                                    ...prev,
                                    description: "",
                                  }));
                                }
                              }}
                              rows={4}
                              invalid={!!formErrors.description}
                              invalidText={formErrors.description}
                              helperText={intl.formatMessage({
                                id: "helper.sampleType.description",
                                defaultMessage:
                                  "Provide a description of this sample type for lab staff reference",
                              })}
                            />
                          </Stack>
                        </Column>
                      </Grid>

                      <div
                        style={{
                          borderTop: "1px solid var(--cds-border-subtle-01)",
                          marginTop: "var(--cds-spacing-08)",
                          paddingTop: "var(--cds-spacing-10)",
                        }}
                      >
                        <Stack orientation="horizontal" gap={4}>
                          <Button
                            kind="primary"
                            size="sm"
                            renderIcon={isSubmitting ? undefined : Save}
                            onClick={saveEditor}
                            disabled={
                              isSubmitting ||
                              !!Object.keys(formErrors).length ||
                              !editingType?.name?.trim() ||
                              !editingType?.description?.trim()
                            }
                          >
                            {isSubmitting ? (
                              <>
                                <Loading style={{ marginRight: "8px" }} />
                                <FormattedMessage
                                  id="button.saving"
                                  defaultMessage="Saving..."
                                />
                              </>
                            ) : (
                              <FormattedMessage
                                id="button.save"
                                defaultMessage="Save Changes"
                              />
                            )}
                          </Button>
                          <Button kind="ghost" size="sm" onClick={goToList}>
                            <FormattedMessage
                              id="button.cancel"
                              defaultMessage="Cancel"
                            />
                          </Button>
                        </Stack>
                      </div>
                    </Tile>
                  </div>
                )}

                {/* Associated Tests — read-only list of tests linked to this sample type */}
                {activeSection === "associated-tests" && (
                  <div>
                    <Tile
                      style={{
                        padding: "var(--cds-spacing-06)",
                        border: "1px solid var(--cds-border-subtle)",
                        borderRadius: "var(--cds-border-radius)",
                      }}
                    >
                      <AssociatedTestsSection
                        sampleTypeId={sampleTypeId}
                        onChange={setAssociatedTests}
                      />
                    </Tile>
                  </div>
                )}

                {/* Display Order — positions this sample type in the order-entry
                Sample Type menu (the real sortOrder, FRS v2.1). */}
                {activeSection === "display-order" && (
                  <div>
                    <Tile
                      style={{
                        padding: "var(--cds-spacing-07)",
                        border: "1px solid var(--cds-border-subtle)",
                        borderRadius: "var(--cds-border-radius)",
                      }}
                    >
                      <DisplayOrderSection sampleTypeId={sampleTypeId} />
                    </Tile>
                  </div>
                )}

                {/* Disposal — free-text reference guidance (FRS v2.1); the
                structured handling stays per-test / per-specimen. */}
                {activeSection === "disposal" && (
                  <div>
                    <Tile
                      style={{
                        padding: "var(--cds-spacing-07)",
                        border: "1px solid var(--cds-border-subtle)",
                        borderRadius: "var(--cds-border-radius)",
                      }}
                    >
                      <DisposalSection sampleTypeId={sampleTypeId} />
                    </Tile>
                  </div>
                )}

                {/* Terminology — multi-row Source/Code/Relationship mappings,
                mirrors the Test Catalog Editor's Terminology section. */}
                {activeSection === "terminology" && (
                  <div>
                    <Tile
                      style={{
                        padding: "var(--cds-spacing-07)",
                        border: "1px solid var(--cds-border-subtle)",
                        borderRadius: "var(--cds-border-radius)",
                      }}
                    >
                      <TerminologySection sampleTypeId={sampleTypeId} />
                    </Tile>
                  </div>
                )}
              </>
            )}
          </div>
        </Stack>
      </div>
    );
  }

  // Fallback (shouldn't reach here)
  return null;
}

export default injectIntl(SampleTypeManagement);
