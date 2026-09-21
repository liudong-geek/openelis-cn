import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Dropdown,
  Form,
  InlineLoading,
  InlineNotification,
  Modal,
  Select,
  SelectItem,
  Tag,
  TextInput,
} from "@carbon/react";
import { Add, Reset, Save } from "@carbon/icons-react";
import { FormattedMessage, useIntl } from "react-intl";
import ProgramFormValues from "./ProgramFormValues";
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
import { jpSet } from "../../utils/JsonPath";
import ProgramQuestionnaireBuilder from "./ProgramQuestionnaireBuilder";
import "./ProgramManagement.css";

const NEW_PROGRAM_ID = "__new__";
const breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
  { label: "sidenav.label.admin.program", link: "/MasterListsPage/program" },
];

const freshProgramValues = () => JSON.parse(JSON.stringify(ProgramFormValues));
const normalizeProgram = (response) => {
  const questionnaire = response?.additionalOrderEntryQuestions;
  return {
    ...freshProgramValues(),
    ...response,
    program: {
      ...freshProgramValues().program,
      ...(response?.program || {}),
    },
    additionalOrderEntryQuestions:
      typeof questionnaire === "string"
        ? questionnaire
        : JSON.stringify(
            questionnaire || { resourceType: "Questionnaire", item: [] },
            null,
            2,
          ),
  };
};

function ProgramWorkspace() {
  const intl = useIntl();
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);
  const mounted = useRef(false);
  const [programs, setPrograms] = useState([]);
  const [testSections, setTestSections] = useState([]);
  const [selectedProgramId, setSelectedProgramId] = useState(NEW_PROGRAM_ID);
  const [programValues, setProgramValues] = useState(freshProgramValues);
  const [initialValues, setInitialValues] = useState(freshProgramValues);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [questionnaireValid, setQuestionnaireValid] = useState(true);
  const [pendingSelection, setPendingSelection] = useState(null);
  const [loadError, setLoadError] = useState(false);

  const programItems = useMemo(
    () => [
      {
        id: NEW_PROGRAM_ID,
        text: intl.formatMessage({ id: "program.management.newProgram" }),
      },
      ...programs.map((program) => ({
        id: String(program.id),
        text: program.value,
      })),
    ],
    [intl, programs],
  );
  const selectedProgram =
    programItems.find((item) => item.id === selectedProgramId) ||
    programItems[0];
  const dirty = useMemo(
    () => JSON.stringify(programValues) !== JSON.stringify(initialValues),
    [initialValues, programValues],
  );
  const questionCount = useMemo(() => {
    try {
      const parsed = JSON.parse(programValues.additionalOrderEntryQuestions);
      return Array.isArray(parsed?.item) ? parsed.item.length : 0;
    } catch (_error) {
      return 0;
    }
  }, [programValues.additionalOrderEntryQuestions]);
  const canSave = Boolean(
    dirty &&
    questionnaireValid &&
    programValues.program.programName.trim() &&
    programValues.program.code.trim() &&
    programValues.testSectionId &&
    !submitting,
  );

  const notify = (kind, messageId) => {
    setNotificationVisible(true);
    addNotification({
      kind,
      title: intl.formatMessage({ id: messageId }),
    });
  };

  const fetchLookups = () => {
    setLoadError(false);
    setLoading(true);
    let loaded = 0;
    let failed = false;
    const complete = () => {
      loaded += 1;
      if (loaded === 2 && mounted.current) {
        setLoadError(failed);
        setLoading(false);
      }
    };
    getFromOpenElisServer("/rest/displayList/PROGRAM", (response) => {
      if (mounted.current) {
        if (Array.isArray(response)) setPrograms(response);
        else failed = true;
      }
      complete();
    });
    getFromOpenElisServer(
      "/rest/displayList/TEST_SECTION_ACTIVE",
      (response) => {
        if (mounted.current) {
          if (Array.isArray(response)) setTestSections(response);
          else failed = true;
        }
        complete();
      },
    );
  };

  useEffect(() => {
    mounted.current = true;
    fetchLookups();
    return () => {
      mounted.current = false;
    };
  }, []);

  const applySelection = (programId) => {
    setPendingSelection(null);
    setSelectedProgramId(programId);
    setLoadError(false);
    if (programId === NEW_PROGRAM_ID) {
      const next = freshProgramValues();
      setProgramValues(next);
      setInitialValues(next);
      setQuestionnaireValid(true);
      return;
    }
    setLoading(true);
    getFromOpenElisServer(`/rest/program/${programId}`, (response) => {
      if (!mounted.current) return;
      if (!response || response.error) {
        setLoadError(true);
      } else {
        const next = normalizeProgram(response);
        setProgramValues(next);
        setInitialValues(next);
        setQuestionnaireValid(true);
      }
      setLoading(false);
    });
  };

  const requestSelection = (programId) => {
    if (programId === selectedProgramId) return;
    if (dirty) {
      setPendingSelection(programId);
      return;
    }
    applySelection(programId);
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setProgramValues((current) => {
      const next = JSON.parse(JSON.stringify(current));
      jpSet(next, name, value);
      return next;
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSave) return;
    let questionnaire;
    try {
      questionnaire = JSON.parse(programValues.additionalOrderEntryQuestions);
    } catch (_error) {
      setQuestionnaireValid(false);
      return;
    }
    setSubmitting(true);
    const submitValues = {
      ...programValues,
      additionalOrderEntryQuestions: questionnaire,
    };
    postToOpenElisServerFullResponse(
      "/rest/program",
      JSON.stringify(submitValues),
      async (response) => {
        if (!mounted.current) return;
        setSubmitting(false);
        if (response && String(response.status) === "200") {
          let body = submitValues;
          try {
            body = await response.json();
          } catch (_error) {
            // The saved values remain the best available local response.
          }
          const next = normalizeProgram(body);
          setProgramValues(next);
          setInitialValues(next);
          const savedId = next.program.id
            ? String(next.program.id)
            : selectedProgramId;
          setSelectedProgramId(savedId);
          notify(NotificationKinds.success, "program.management.saveSuccess");
          getFromOpenElisServer("/rest/displayList/PROGRAM", (list) => {
            if (mounted.current && Array.isArray(list)) setPrograms(list);
          });
        } else {
          notify(NotificationKinds.error, "program.management.saveError");
        }
      },
    );
  };

  return (
    <>
      {notificationVisible ? <AlertDialog /> : null}
      <div className="adminPageContent program-workspace">
        <PageBreadCrumb breadcrumbs={breadcrumbs} />
        <ProductPageHeader
          title={<FormattedMessage id="program.management.title" />}
          subtitle={<FormattedMessage id="program.management.description" />}
          actions={
            <Button
              kind="tertiary"
              renderIcon={Add}
              onClick={() => requestSelection(NEW_PROGRAM_ID)}
              disabled={selectedProgramId === NEW_PROGRAM_ID && !dirty}
            >
              <FormattedMessage id="program.management.newProgram" />
            </Button>
          }
        />

        <section
          className="program-workspace__metrics"
          aria-label={intl.formatMessage({ id: "program.management.summary" })}
        >
          <article>
            <span>
              <FormattedMessage id="program.management.programCount" />
            </span>
            <strong>{programs.length}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="program.management.currentMode" />
            </span>
            <strong>
              {selectedProgramId === NEW_PROGRAM_ID
                ? intl.formatMessage({ id: "program.management.creating" })
                : intl.formatMessage({ id: "program.management.editing" })}
            </strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="program.management.questionCount" />
            </span>
            <strong>{questionCount}</strong>
          </article>
        </section>

        {loadError && (
          <InlineNotification
            kind="error"
            title={intl.formatMessage({ id: "program.management.loadError" })}
            subtitle={intl.formatMessage({
              id: "program.management.loadErrorHelper",
            })}
            actionButtonLabel={intl.formatMessage({
              id: "program.management.retry",
            })}
            onActionButtonClick={fetchLookups}
            onClose={() => setLoadError(false)}
          />
        )}

        <section className="program-workspace__selector">
          <Dropdown
            id="program-selector"
            data-testid="program-selector"
            titleText={intl.formatMessage({
              id: "program.management.selectProgram",
            })}
            label={intl.formatMessage({
              id: "program.management.selectProgram",
            })}
            items={programItems}
            itemToString={(item) => item?.text || ""}
            selectedItem={selectedProgram}
            onChange={({ selectedItem }) =>
              selectedItem && requestSelection(selectedItem.id)
            }
            disabled={loading || submitting}
          />
          <p>
            <FormattedMessage id="program.management.selectorHelper" />
          </p>
        </section>

        {loading ? (
          <div className="program-workspace__loading">
            <InlineLoading
              description={intl.formatMessage({
                id: "program.management.loading",
              })}
            />
          </div>
        ) : (
          <Form onSubmit={handleSubmit} className="program-workspace__form">
            <section className="program-workspace__card">
              <header>
                <div>
                  <h2>
                    <FormattedMessage id="program.management.basicInfo" />
                  </h2>
                  <p>
                    <FormattedMessage id="program.management.basicInfoHelper" />
                  </p>
                </div>
                <Tag
                  type={selectedProgramId === NEW_PROGRAM_ID ? "blue" : "teal"}
                >
                  {selectedProgramId === NEW_PROGRAM_ID
                    ? intl.formatMessage({ id: "program.management.newTag" })
                    : intl.formatMessage({
                        id: "program.management.existingTag",
                      })}
                </Tag>
              </header>
              <div className="program-workspace__fields">
                <TextInput
                  id="program.programName"
                  name="program.programName"
                  labelText={intl.formatMessage({ id: "program.name.label" })}
                  value={programValues.program.programName}
                  onChange={handleFieldChange}
                  required
                />
                <TextInput
                  id="program.code"
                  name="program.code"
                  labelText={intl.formatMessage({ id: "program.name.code" })}
                  value={programValues.program.code}
                  onChange={handleFieldChange}
                  maxLength={10}
                  required
                />
                <Select
                  id="test_section"
                  name="testSectionId"
                  labelText={intl.formatMessage({ id: "test.section.label" })}
                  value={programValues.testSectionId}
                  onChange={handleFieldChange}
                  required
                >
                  <SelectItem
                    value=""
                    text={intl.formatMessage({
                      id: "program.management.selectSection",
                    })}
                    disabled
                  />
                  {testSections.map((section) => (
                    <SelectItem
                      key={section.id}
                      value={section.id}
                      text={section.value}
                    />
                  ))}
                </Select>
                <TextInput
                  id="program.questionnaireUUID"
                  name="program.questionnaireUUID"
                  labelText={intl.formatMessage({
                    id: "program.management.questionnaireId",
                  })}
                  helperText={intl.formatMessage({
                    id: "program.management.questionnaireIdHelper",
                  })}
                  value={programValues.program.questionnaireUUID}
                  onChange={handleFieldChange}
                  disabled={Boolean(programValues.program.id)}
                />
              </div>
            </section>

            <ProgramQuestionnaireBuilder
              additionalOrderEntryQuestions={
                programValues.additionalOrderEntryQuestions
              }
              handleFieldChange={handleFieldChange}
              onValidityChange={setQuestionnaireValid}
            />

            <div className="program-workspace__actions">
              <div className="program-workspace__save-state">
                {dirty ? (
                  <FormattedMessage id="program.management.unsaved" />
                ) : (
                  <FormattedMessage id="program.management.savedState" />
                )}
              </div>
              <Button
                type="button"
                kind="secondary"
                renderIcon={Reset}
                onClick={() => setProgramValues(initialValues)}
                disabled={!dirty || submitting}
              >
                <FormattedMessage id="program.management.discard" />
              </Button>
              <Button type="submit" renderIcon={Save} disabled={!canSave}>
                <FormattedMessage
                  id={
                    submitting
                      ? "program.management.saving"
                      : "program.management.save"
                  }
                />
              </Button>
            </div>
          </Form>
        )}
      </div>

      {pendingSelection && (
        <Modal
          open
          danger
          modalHeading={intl.formatMessage({
            id: "program.management.discardTitle",
          })}
          primaryButtonText={intl.formatMessage({
            id: "program.management.discardAndContinue",
          })}
          secondaryButtonText={intl.formatMessage({
            id: "program.management.cancel",
          })}
          onRequestClose={() => setPendingSelection(null)}
          onRequestSubmit={() => applySelection(pendingSelection)}
        >
          <p>
            <FormattedMessage id="program.management.discardMessage" />
          </p>
        </Modal>
      )}
    </>
  );
}

export default ProgramWorkspace;
