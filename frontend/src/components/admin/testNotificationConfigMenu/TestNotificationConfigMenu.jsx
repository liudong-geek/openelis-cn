import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  InlineLoading,
  Loading,
  Modal,
  Pagination,
  Search,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from "@carbon/react";
import { Save, Settings, Undo } from "@carbon/icons-react";
import { FormattedMessage, useIntl } from "react-intl";
import {
  getFromOpenElisServer,
  postToOpenElisServerJsonResponse,
} from "../../utils/Utils";
import { NotificationContext } from "../../layout/Layout";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import { navigateToInternalPath } from "../../utils/NavigationUtils";
import "./TestNotificationConfigMenu.css";

const breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
  {
    label: "testnotificationconfig.browse.title",
    link: "/MasterListsPage/testNotificationConfigMenu",
  },
];

const CHANNELS = [
  { key: "patientEmail", label: "testnotification.patient.email" },
  { key: "patientSMS", label: "testnotification.patient.sms" },
  { key: "providerEmail", label: "testnotification.provider.email" },
  { key: "providerSMS", label: "testnotification.provider.sms" },
];

const copyMenuList = (items = []) =>
  items.map((item) => ({
    ...item,
    patientEmail: { ...item.patientEmail },
    patientSMS: { ...item.patientSMS },
    providerEmail: { ...item.providerEmail },
    providerSMS: { ...item.providerSMS },
  }));

const channelState = (item) =>
  CHANNELS.map(({ key }) => Boolean(item?.[key]?.active)).join(":");

export default function TestNotificationConfigMenu() {
  const intl = useIntl();
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);
  const mounted = useRef(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [menuLoading, setMenuLoading] = useState(true);
  const [namesLoading, setNamesLoading] = useState(true);
  const [sampleFilterLoading, setSampleFilterLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [menuData, setMenuData] = useState({ menuList: [] });
  const [savedMenuList, setSavedMenuList] = useState([]);
  const [testNamesMap, setTestNamesMap] = useState({});
  const [sampleTypes, setSampleTypes] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSampleType, setSelectedSampleType] = useState("");
  const [testIdsForSampleType, setTestIdsForSampleType] = useState(null);

  useEffect(() => {
    mounted.current = true;
    getFromOpenElisServer("/rest/TestNotificationConfigMenu", (response) => {
      if (!mounted.current) return;
      const next = response || { menuList: [] };
      const nextList = copyMenuList(next.menuList);
      setMenuData({ ...next, menuList: nextList });
      setSavedMenuList(copyMenuList(nextList));
      setMenuLoading(false);
    });
    getFromOpenElisServer("/rest/test-list", (response) => {
      if (!mounted.current) return;
      setTestNamesMap(
        (Array.isArray(response) ? response : []).reduce((names, item) => {
          names[String(item.id)] = item.value;
          return names;
        }, {}),
      );
      setNamesLoading(false);
    });
    getFromOpenElisServer("/rest/user-sample-types", (response) => {
      if (mounted.current)
        setSampleTypes(Array.isArray(response) ? response : []);
    });
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    setPage(1);
    if (!selectedSampleType) {
      setTestIdsForSampleType(null);
      setSampleFilterLoading(false);
      return;
    }
    setSampleFilterLoading(true);
    getFromOpenElisServer(
      `/rest/sample-type-tests?sampleType=${encodeURIComponent(selectedSampleType)}`,
      (response) => {
        if (!mounted.current) return;
        setTestIdsForSampleType(
          new Set((response?.tests || []).map((test) => String(test.id))),
        );
        setSampleFilterLoading(false);
      },
    );
  }, [selectedSampleType]);

  useEffect(() => setPage(1), [searchTerm]);

  const savedById = useMemo(
    () => new Map(savedMenuList.map((item) => [String(item.testId), item])),
    [savedMenuList],
  );

  const changedIds = useMemo(
    () =>
      new Set(
        menuData.menuList
          .filter(
            (item) =>
              channelState(item) !==
              channelState(savedById.get(String(item.testId))),
          )
          .map((item) => String(item.testId)),
      ),
    [menuData.menuList, savedById],
  );

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase();
    return menuData.menuList.filter((item) => {
      const id = String(item.testId);
      if (testIdsForSampleType && !testIdsForSampleType.has(id)) return false;
      if (!query) return true;
      return `${testNamesMap[id] || ""} ${id}`
        .toLocaleLowerCase()
        .includes(query);
    });
  }, [menuData.menuList, searchTerm, testIdsForSampleType, testNamesMap]);

  const metrics = useMemo(() => {
    let configuredTests = 0;
    let activeChannels = 0;
    menuData.menuList.forEach((item) => {
      const enabled = CHANNELS.filter(({ key }) => item?.[key]?.active).length;
      if (enabled) configuredTests += 1;
      activeChannels += enabled;
    });
    return { configuredTests, activeChannels };
  }, [menuData.menuList]);

  const pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
  const loading = menuLoading || namesLoading;
  const isDirty = changedIds.size > 0;

  const updateChannel = (testId, channel, active) => {
    setMenuData((current) => ({
      ...current,
      menuList: current.menuList.map((item) =>
        String(item.testId) === String(testId)
          ? { ...item, [channel]: { ...item[channel], active } }
          : item,
      ),
    }));
  };

  const discardChanges = () => {
    setMenuData((current) => ({
      ...current,
      menuList: copyMenuList(savedMenuList),
    }));
  };

  const saveChanges = () => {
    setConfirmOpen(false);
    setSaving(true);
    postToOpenElisServerJsonResponse(
      "/rest/TestNotificationConfigMenu",
      JSON.stringify(menuData),
      (response) => {
        if (!mounted.current) return;
        const succeeded = Boolean(response);
        if (succeeded) setSavedMenuList(copyMenuList(menuData.menuList));
        addNotification({
          kind: succeeded ? NotificationKinds.success : NotificationKinds.error,
          title: intl.formatMessage({ id: "notification.title" }),
          message: intl.formatMessage({
            id: succeeded
              ? "notification.user.post.save.success"
              : "server.error.msg",
          }),
        });
        setNotificationVisible(true);
        setSaving(false);
      },
    );
  };

  return (
    <>
      {notificationVisible && <AlertDialog />}
      {loading && <Loading />}
      <div className="adminPageContent notification-config-workspace">
        <PageBreadCrumb breadcrumbs={breadcrumbs} />
        <ProductPageHeader
          title={<FormattedMessage id="testnotificationconfig.browse.title" />}
          subtitle={
            <FormattedMessage id="testnotification.workspace.subtitle" />
          }
          actions={
            <>
              <Button
                kind="secondary"
                renderIcon={Undo}
                disabled={!isDirty || saving}
                onClick={discardChanges}
              >
                <FormattedMessage id="testnotification.workspace.discard" />
              </Button>
              <Button
                renderIcon={Save}
                disabled={!isDirty || saving}
                onClick={() => setConfirmOpen(true)}
              >
                {saving ? (
                  <InlineLoading
                    description={intl.formatMessage({
                      id: "testnotification.workspace.saving",
                    })}
                  />
                ) : (
                  <FormattedMessage id="testnotification.workspace.save" />
                )}
              </Button>
            </>
          }
        />

        <section
          className="notification-config-workspace__metrics"
          aria-label={intl.formatMessage({
            id: "testnotification.workspace.summary",
          })}
        >
          <article>
            <span>
              <FormattedMessage id="testnotification.workspace.totalTests" />
            </span>
            <strong>{menuData.menuList.length}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="testnotification.workspace.configuredTests" />
            </span>
            <strong>{metrics.configuredTests}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="testnotification.workspace.activeChannels" />
            </span>
            <strong>{metrics.activeChannels}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="testnotification.workspace.pendingChanges" />
            </span>
            <strong>{changedIds.size}</strong>
          </article>
        </section>

        <section className="notification-config-workspace__panel">
          <header className="notification-config-workspace__panel-header">
            <div>
              <h2>
                <FormattedMessage id="testnotification.workspace.rulesTitle" />
              </h2>
              <p>
                <FormattedMessage id="testnotification.workspace.rulesHelper" />
              </p>
            </div>
            <Tag type={isDirty ? "warm-gray" : "green"} size="sm">
              <FormattedMessage
                id={
                  isDirty
                    ? "testnotification.workspace.unsaved"
                    : "testnotification.workspace.saved"
                }
                values={{ count: changedIds.size }}
              />
            </Tag>
          </header>

          <div className="notification-config-workspace__filters">
            <Search
              id="testNotificationTestNameSearch"
              labelText={intl.formatMessage({
                id: "testnotification.workspace.searchLabel",
              })}
              placeholder={intl.formatMessage({
                id: "testnotification.workspace.searchPlaceholder",
              })}
              closeButtonLabelText={intl.formatMessage({
                id: "testnotification.workspace.clearSearch",
              })}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <Select
              id="testNotificationSampleTypeFilter"
              labelText={intl.formatMessage({ id: "field.sampleType" })}
              aria-label={intl.formatMessage({ id: "field.sampleType" })}
              value={selectedSampleType}
              onChange={(event) => setSelectedSampleType(event.target.value)}
            >
              <SelectItem
                text={intl.formatMessage({
                  id: "testnotification.workspace.allSampleTypes",
                })}
                value=""
              />
              {sampleTypes.map((sampleType) => (
                <SelectItem
                  key={sampleType.id}
                  text={sampleType.value}
                  value={sampleType.id}
                />
              ))}
            </Select>
            <Button
              kind="ghost"
              disabled={!searchTerm && !selectedSampleType}
              onClick={() => {
                setSearchTerm("");
                setSelectedSampleType("");
              }}
            >
              <FormattedMessage id="label.clear" />
            </Button>
          </div>

          <div
            className="notification-config-workspace__result-line"
            role="status"
          >
            <FormattedMessage
              id="testnotification.workspace.results"
              values={{ count: filteredRows.length }}
            />
            {sampleFilterLoading && (
              <InlineLoading
                description={intl.formatMessage({
                  id: "testnotification.workspace.filtering",
                })}
              />
            )}
          </div>

          {filteredRows.length === 0 && !loading ? (
            <div className="notification-config-workspace__empty">
              <h3>
                <FormattedMessage id="testnotification.workspace.emptyTitle" />
              </h3>
              <p>
                <FormattedMessage id="testnotification.workspace.emptyHelper" />
              </p>
              <Button
                kind="tertiary"
                size="sm"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedSampleType("");
                }}
              >
                <FormattedMessage id="label.clear" />
              </Button>
            </div>
          ) : (
            <TableContainer className="notification-config-workspace__table-wrap">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>
                      <FormattedMessage id="label.testName" />
                    </TableHeader>
                    {CHANNELS.map((channel) => (
                      <TableHeader key={channel.key}>
                        <FormattedMessage id={channel.label} />
                      </TableHeader>
                    ))}
                    <TableHeader>
                      <FormattedMessage id="testnotification.workspace.template" />
                    </TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pagedRows.map((item) => {
                    const id = String(item.testId);
                    return (
                      <TableRow
                        key={id}
                        className={
                          changedIds.has(id)
                            ? "notification-config-workspace__row--changed"
                            : undefined
                        }
                      >
                        <TableCell>
                          <strong>{testNamesMap[id] || id}</strong>
                          <span className="notification-config-workspace__test-id">
                            <FormattedMessage
                              id="testnotification.workspace.testId"
                              values={{ id }}
                            />
                          </span>
                        </TableCell>
                        {CHANNELS.map((channel) => (
                          <TableCell key={channel.key}>
                            <Checkbox
                              id={`notification-${id}-${channel.key}`}
                              aria-label={intl.formatMessage(
                                {
                                  id: "testnotification.workspace.channelLabel",
                                },
                                {
                                  test: testNamesMap[id] || id,
                                  channel: intl.formatMessage({
                                    id: channel.label,
                                  }),
                                },
                              )}
                              labelText={intl.formatMessage(
                                {
                                  id: "testnotification.workspace.channelLabel",
                                },
                                {
                                  test: testNamesMap[id] || id,
                                  channel: intl.formatMessage({
                                    id: channel.label,
                                  }),
                                },
                              )}
                              hideLabel
                              checked={Boolean(item?.[channel.key]?.active)}
                              onChange={(event) =>
                                updateChannel(
                                  id,
                                  channel.key,
                                  event.target.checked,
                                )
                              }
                            />
                          </TableCell>
                        ))}
                        <TableCell>
                          <Button
                            hasIconOnly
                            kind="ghost"
                            size="sm"
                            renderIcon={Settings}
                            iconDescription={intl.formatMessage({
                              id: "testnotification.testdefault.editIcon",
                            })}
                            onClick={() =>
                              navigateToInternalPath(
                                `/MasterListsPage/testNotificationConfig?testId=${encodeURIComponent(id)}`,
                              )
                            }
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {filteredRows.length > 0 && (
            <Pagination
              page={page}
              pageSize={pageSize}
              pageSizes={[10, 25, 50]}
              totalItems={filteredRows.length}
              onChange={({ page: nextPage, pageSize: nextPageSize }) => {
                setPage(nextPage);
                setPageSize(nextPageSize);
              }}
              forwardText={intl.formatMessage({ id: "pagination.forward" })}
              backwardText={intl.formatMessage({ id: "pagination.backward" })}
              itemsPerPageText={intl.formatMessage({
                id: "pagination.items-per-page",
              })}
              pageNumberText={intl.formatMessage({
                id: "pagination.page-number",
              })}
              itemRangeText={(min, max, total) =>
                intl.formatMessage(
                  { id: "pagination.item-range" },
                  { min, max, total },
                )
              }
              itemText={(min, max) =>
                intl.formatMessage({ id: "pagination.item" }, { min, max })
              }
              pageRangeText={(_current, total) =>
                intl.formatMessage({ id: "pagination.page-range" }, { total })
              }
              pageText={(currentPage, pagesUnknown) =>
                intl.formatMessage(
                  { id: "pagination.page" },
                  { page: pagesUnknown ? "" : currentPage },
                )
              }
            />
          )}
        </section>

        <p className="notification-config-workspace__notice">
          <FormattedMessage id="testnotification.workspace.notice" />
        </p>
      </div>

      <Modal
        open={confirmOpen}
        modalHeading={intl.formatMessage({
          id: "testnotification.workspace.confirmTitle",
        })}
        primaryButtonText={intl.formatMessage({
          id: "testnotification.workspace.confirmSave",
        })}
        secondaryButtonText={intl.formatMessage({ id: "label.button.cancel" })}
        onRequestClose={() => setConfirmOpen(false)}
        onRequestSubmit={saveChanges}
      >
        <p>
          <FormattedMessage
            id="testnotification.workspace.confirmBody"
            values={{ count: changedIds.size }}
          />
        </p>
      </Modal>
    </>
  );
}
