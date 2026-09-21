import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Button,
  Checkbox,
  DataTableSkeleton,
  DatePicker,
  DatePickerInput,
  Dropdown,
  InlineLoading,
  InlineNotification,
  Modal,
  Search,
  Tag,
  TextInput,
} from "@carbon/react";
import { Add, Download, Edit, TrashCan, Upload } from "@carbon/icons-react";
import { FormattedMessage, useIntl } from "react-intl";
import {
  deleteFromOpenElisServer,
  getFromOpenElisServer,
  postToOpenElisServerJsonResponse,
  putToOpenElisServer,
} from "../../utils/Utils";
import config from "../../../config.json";
import { NotificationContext } from "../../layout/Layout";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import WeekendConfig from "./WeekendConfig";
import CsvImportPreview from "./CsvImportPreview";
import "./CalendarManagement.css";

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 5 }, (_, index) => ({
  id: String(currentYear - 1 + index),
  text: String(currentYear - 1 + index),
}));
const emptyForm = { date: "", name: "", recurring: false };

export default function CalendarManagement() {
  const intl = useIntl();
  const { setNotificationVisible, addNotification } =
    useContext(NotificationContext);
  const requestVersion = useRef(0);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(String(currentYear));
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [initialForm, setInitialForm] = useState(emptyForm);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [deleteHoliday, setDeleteHoliday] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState(null);

  const fetchHolidays = useCallback(() => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    getFromOpenElisServer(
      `/rest/calendar/holidays?year=${year}&includeInactive=true`,
      (response) => {
        if (version !== requestVersion.current) return;
        if (response) {
          setHolidays(
            Array.isArray(response.holidays) ? response.holidays : [],
          );
        } else {
          setError(intl.formatMessage({ id: "calendar.management.loadError" }));
        }
        setLoading(false);
      },
    );
  }, [intl, year]);

  useEffect(() => {
    fetchHolidays();
    return () => {
      requestVersion.current += 1;
    };
  }, [fetchHolidays]);

  const metrics = useMemo(
    () => ({
      active: holidays.filter((holiday) => holiday.isActive).length,
      recurring: holidays.filter((holiday) => holiday.isRecurring).length,
    }),
    [holidays],
  );
  const visibleHolidays = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return holidays;
    return holidays.filter((holiday) =>
      `${holiday.name || ""} ${holiday.date || ""}`
        .toLocaleLowerCase()
        .includes(normalized),
    );
  }, [holidays, query]);

  const notify = (kind, messageId) => {
    addNotification({ kind, title: intl.formatMessage({ id: messageId }) });
    setNotificationVisible(true);
  };
  const openEditor = (holiday = null) => {
    const next = holiday
      ? {
          date: holiday.date,
          name: holiday.name,
          recurring: holiday.isRecurring,
        }
      : emptyForm;
    setEditForm(next);
    setInitialForm(next);
    setEditor(holiday || { id: null });
  };
  const isDirty = useMemo(
    () => JSON.stringify(editForm) !== JSON.stringify(initialForm),
    [editForm, initialForm],
  );
  const canSave = Boolean(editForm.date && editForm.name.trim());
  const closeEditor = () => {
    if (isDirty) {
      setDiscardOpen(true);
      return;
    }
    setEditor(null);
  };
  const finishEditor = () => {
    setDiscardOpen(false);
    setEditor(null);
    setEditForm(emptyForm);
    setInitialForm(emptyForm);
  };

  const handleSave = () => {
    if (!canSave || actionPending) return;
    setActionPending(true);
    const body = JSON.stringify({
      date: editForm.date,
      name: editForm.name.trim(),
      isRecurring: editForm.recurring,
    });
    const onSuccess = () => {
      setActionPending(false);
      finishEditor();
      notify("success", "calendar.management.saved");
      fetchHolidays();
    };
    const onFailure = () => {
      setActionPending(false);
      notify("error", "calendar.management.saveError");
    };
    if (editor?.id == null) {
      postToOpenElisServerJsonResponse(
        "/rest/calendar/holidays",
        body,
        (response) => (response && !response.error ? onSuccess() : onFailure()),
      );
      return;
    }
    putToOpenElisServer(
      `/rest/calendar/holidays/${editor.id}`,
      body,
      (status) => (status === 200 ? onSuccess() : onFailure()),
    );
  };

  const handleDelete = () => {
    if (!deleteHoliday || actionPending) return;
    setActionPending(true);
    deleteFromOpenElisServer(
      `/rest/calendar/holidays/${deleteHoliday.id}`,
      (status) => {
        const success = status === 204 || status === 200;
        setActionPending(false);
        setDeleteHoliday(null);
        notify(
          success ? "success" : "error",
          success
            ? "calendar.management.deleted"
            : "calendar.management.saveError",
        );
        if (success) fetchHolidays();
      },
    );
  };

  const breadcrumbs = [
    { label: "home.label", link: "/" },
    { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
    {
      label: "calendar.management.title",
      link: "/MasterListsPage/calendarManagement",
    },
  ];

  return (
    <>
      <div className="adminPageContent calendar-workspace">
        <PageBreadCrumb breadcrumbs={breadcrumbs} />
        <ProductPageHeader
          title={<FormattedMessage id="calendar.management.title" />}
          subtitle={<FormattedMessage id="calendar.management.description" />}
          actions={
            <Button
              renderIcon={Add}
              onClick={() => openEditor()}
              disabled={actionPending}
              data-testid="add-holiday-button"
            >
              <FormattedMessage id="calendar.management.addHoliday" />
            </Button>
          }
        />

        <section
          className="calendar-workspace__metrics"
          aria-label={intl.formatMessage({
            id: "calendar.management.summaryLabel",
          })}
        >
          <article>
            <span>
              <FormattedMessage id="calendar.management.selectedYear" />
            </span>
            <strong>{year}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="calendar.management.totalHolidays" />
            </span>
            <strong>{holidays.length}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="calendar.management.activeHolidays" />
            </span>
            <strong>{metrics.active}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="calendar.management.recurringHolidays" />
            </span>
            <strong>{metrics.recurring}</strong>
          </article>
        </section>

        <section className="calendar-workspace__controls">
          <Dropdown
            id="year-dropdown"
            data-testid="year-dropdown"
            titleText={intl.formatMessage({ id: "calendar.management.year" })}
            label={intl.formatMessage({ id: "calendar.management.year" })}
            items={yearOptions}
            itemToString={(item) => item?.text || ""}
            selectedItem={yearOptions.find((option) => option.id === year)}
            onChange={({ selectedItem }) => {
              if (selectedItem) {
                setQuery("");
                setYear(selectedItem.id);
              }
            }}
          />
          <div className="calendar-workspace__transfer-actions">
            <Button
              kind="tertiary"
              size="sm"
              renderIcon={Upload}
              onClick={() => setShowImportModal(true)}
              disabled={actionPending}
              data-testid="import-csv-button"
            >
              <FormattedMessage id="calendar.management.importCsv" />
            </Button>
            <Button
              kind="ghost"
              size="sm"
              renderIcon={Download}
              onClick={() =>
                window.open(
                  `${config.serverBaseUrl}/rest/calendar/holidays/export?year=${year}`,
                  "_blank",
                )
              }
              disabled={actionPending}
              data-testid="export-csv-button"
            >
              <FormattedMessage id="calendar.management.exportCsv" />
            </Button>
          </div>
        </section>

        <WeekendConfig />

        <section className="calendar-workspace__holiday-panel">
          <header>
            <div>
              <h2>
                <FormattedMessage id="calendar.management.holidayList" />
              </h2>
              <p data-testid="holiday-count-footer">
                <FormattedMessage
                  id="calendar.management.holidayCount"
                  values={{ count: holidays.length, year }}
                />
              </p>
            </div>
            <Search
              id="holiday-search"
              labelText={intl.formatMessage({
                id: "calendar.management.searchLabel",
              })}
              placeholder={intl.formatMessage({
                id: "calendar.management.searchPlaceholder",
              })}
              closeButtonLabelText={intl.formatMessage({
                id: "calendar.management.clearSearch",
              })}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </header>

          {error && (
            <InlineNotification
              kind="error"
              title={error}
              subtitle={intl.formatMessage({
                id: "calendar.management.loadErrorHelper",
              })}
              onClose={() => setError(null)}
              actionButtonLabel={intl.formatMessage({
                id: "calendar.management.retry",
              })}
              onActionButtonClick={fetchHolidays}
            />
          )}

          {loading ? (
            <DataTableSkeleton columnCount={4} rowCount={4} />
          ) : visibleHolidays.length === 0 ? (
            <div className="calendar-workspace__empty">
              <h3>
                <FormattedMessage
                  id={
                    query
                      ? "calendar.management.noSearchResults"
                      : "calendar.management.noHolidaysTitle"
                  }
                />
              </h3>
              <p>
                <FormattedMessage
                  id={
                    query
                      ? "calendar.management.noSearchResultsHelper"
                      : "calendar.management.noHolidays"
                  }
                  values={{ year }}
                />
              </p>
              <Button
                kind="tertiary"
                size="sm"
                onClick={() => (query ? setQuery("") : openEditor())}
              >
                <FormattedMessage
                  id={
                    query
                      ? "calendar.management.clearFilters"
                      : "calendar.management.addHoliday"
                  }
                />
              </Button>
            </div>
          ) : (
            <div className="calendar-workspace__holiday-grid">
              {visibleHolidays.map((holiday) => (
                <article
                  className={`calendar-holiday-card${holiday.isActive ? "" : " calendar-holiday-card--inactive"}`}
                  key={holiday.id}
                >
                  <div className="calendar-holiday-card__date">
                    <strong>{holiday.date}</strong>
                    <span>{holiday.dayOfWeek}</span>
                  </div>
                  <div className="calendar-holiday-card__body">
                    <div className="calendar-holiday-card__tags">
                      <Tag type={holiday.isActive ? "green" : "gray"} size="sm">
                        <FormattedMessage
                          id={
                            holiday.isActive
                              ? "calendar.management.active"
                              : "calendar.management.inactive"
                          }
                        />
                      </Tag>
                      <Tag
                        type={holiday.isRecurring ? "teal" : "cool-gray"}
                        size="sm"
                      >
                        <FormattedMessage
                          id={
                            holiday.isRecurring
                              ? "calendar.management.annual"
                              : "calendar.management.oneTime"
                          }
                        />
                      </Tag>
                      {holiday.isWeekendDay && (
                        <Tag type="warm-gray" size="sm">
                          <FormattedMessage id="calendar.management.weekend" />
                        </Tag>
                      )}
                    </div>
                    <h3>{holiday.name}</h3>
                  </div>
                  <div className="calendar-holiday-card__actions">
                    <Button
                      kind="ghost"
                      size="sm"
                      renderIcon={Edit}
                      onClick={() => openEditor(holiday)}
                      disabled={actionPending}
                    >
                      <FormattedMessage id="calendar.management.editHoliday" />
                    </Button>
                    <Button
                      kind="ghost"
                      size="sm"
                      renderIcon={TrashCan}
                      onClick={() => setDeleteHoliday(holiday)}
                      disabled={actionPending}
                    >
                      <FormattedMessage id="label.delete" />
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {editor && (
        <Modal
          open
          size="sm"
          className="calendar-holiday-editor"
          modalHeading={intl.formatMessage({
            id:
              editor.id == null
                ? "calendar.management.addHoliday"
                : "calendar.management.editHoliday",
          })}
          modalLabel={intl.formatMessage(
            { id: "calendar.management.editorLabel" },
            { year },
          )}
          primaryButtonText={intl.formatMessage({
            id: "calendar.management.save",
          })}
          secondaryButtonText={intl.formatMessage({
            id: "calendar.management.cancel",
          })}
          primaryButtonDisabled={!canSave || actionPending}
          onRequestClose={closeEditor}
          onRequestSubmit={handleSave}
          preventCloseOnClickOutside
        >
          <div
            className="calendar-holiday-editor__form"
            data-testid="holiday-inline-row"
          >
            <DatePicker
              datePickerType="single"
              dateFormat="Y-m-d"
              value={editForm.date}
              onChange={([date]) =>
                setEditForm((current) => ({
                  ...current,
                  date: date ? date.toISOString().split("T")[0] : "",
                }))
              }
            >
              <DatePickerInput
                id="holiday-date"
                labelText={intl.formatMessage({
                  id: "calendar.management.date",
                })}
                placeholder="yyyy-mm-dd"
                autoFocus
              />
            </DatePicker>
            <TextInput
              id="holiday-name"
              labelText={intl.formatMessage({
                id: "calendar.management.holidayName",
              })}
              value={editForm.name}
              onChange={(event) =>
                setEditForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              maxLength={100}
            />
            <Checkbox
              id="holiday-recurring"
              labelText={intl.formatMessage({
                id: "calendar.management.recurringHelper",
              })}
              checked={editForm.recurring}
              onChange={(_event, { checked }) =>
                setEditForm((current) => ({ ...current, recurring: checked }))
              }
            />
            {actionPending && (
              <InlineLoading
                description={intl.formatMessage({
                  id: "calendar.management.saving",
                })}
              />
            )}
          </div>
        </Modal>
      )}

      {discardOpen && (
        <Modal
          open
          danger
          modalHeading={intl.formatMessage({
            id: "calendar.management.discardTitle",
          })}
          primaryButtonText={intl.formatMessage({
            id: "calendar.management.discard",
          })}
          secondaryButtonText={intl.formatMessage({
            id: "calendar.management.cancel",
          })}
          onRequestClose={() => setDiscardOpen(false)}
          onRequestSubmit={finishEditor}
        >
          <p>
            <FormattedMessage id="calendar.management.discardMessage" />
          </p>
        </Modal>
      )}

      {deleteHoliday && (
        <Modal
          open
          danger
          modalHeading={intl.formatMessage({
            id: "calendar.management.deleteTitle",
          })}
          primaryButtonText={intl.formatMessage({ id: "label.delete" })}
          secondaryButtonText={intl.formatMessage({
            id: "calendar.management.cancel",
          })}
          primaryButtonDisabled={actionPending}
          onRequestSubmit={handleDelete}
          onRequestClose={() => setDeleteHoliday(null)}
        >
          <p>
            <FormattedMessage
              id="calendar.management.deleteConfirmNamed"
              values={{ name: deleteHoliday.name }}
            />
          </p>
        </Modal>
      )}

      {showImportModal && (
        <CsvImportPreview
          year={year}
          onClose={() => setShowImportModal(false)}
          onImportComplete={() => {
            setShowImportModal(false);
            fetchHolidays();
          }}
        />
      )}
    </>
  );
}
