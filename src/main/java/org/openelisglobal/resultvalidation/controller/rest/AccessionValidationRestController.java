package org.openelisglobal.resultvalidation.controller.rest;

import static org.apache.commons.validator.GenericValidator.isBlankOrNull;

import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.InvocationTargetException;
import java.util.*;
import org.apache.commons.lang3.StringUtils;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.formfields.FormFields.Field;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.common.services.DisplayListService.ListType;
import org.openelisglobal.common.services.IResultSaveService;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.ResultSaveService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.beanAdapters.ResultSaveBeanAdapter;
import org.openelisglobal.common.services.serviceBeans.ResultSaveBean;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.common.util.validator.GenericValidator;
import org.openelisglobal.common.validator.BaseErrors;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformService;
import org.openelisglobal.dataexchange.orderresult.OrderResponseWorker.Event;
import org.openelisglobal.internationalization.MessageUtil;
import org.openelisglobal.note.service.NoteService;
import org.openelisglobal.note.service.NoteServiceImpl.NoteType;
import org.openelisglobal.note.valueholder.Note;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.referencetables.service.ReferenceTablesService;
import org.openelisglobal.reports.service.DocumentTrackService;
import org.openelisglobal.reports.service.DocumentTypeService;
import org.openelisglobal.reports.valueholder.DocumentTrack;
import org.openelisglobal.result.action.util.ResultSet;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.resultvalidation.bean.AnalysisItem;
import org.openelisglobal.resultvalidation.controller.BaseResultValidationController;
import org.openelisglobal.resultvalidation.form.ResultValidationForm;
import org.openelisglobal.resultvalidation.service.ResultValidationService;
import org.openelisglobal.resultvalidation.service.ReviewQueryContextService;
import org.openelisglobal.resultvalidation.util.ResultsValidationUtility;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.search.service.SearchResultsService;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.testresult.service.TestResultService;
import org.openelisglobal.testresult.valueholder.TestResult;
import org.openelisglobal.typeoftestresult.service.TypeOfTestResultServiceImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Controller;
import org.springframework.validation.BindingResult;
import org.springframework.validation.Errors;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@Controller
@RequestMapping(value = "/rest/")
public class AccessionValidationRestController extends BaseResultValidationController {
    @Autowired
    private UserService userService;
    @Autowired
    private RoleService roleService;

    @Autowired
    SearchResultsService searchService;
    @Autowired
    private SampleService sampleService;
    @Autowired
    private ReviewQueryContextService reviewQueryContextService;
    @Autowired
    private org.openelisglobal.resultvalidation.service.ReviewSubmissionService reviewSubmissionService;

    private static final String[] ALLOWED_FIELDS = new String[] { "queryId", "doRange", "testSectionId",
            "paging.currentPage", "testSection", "testName", "resultList*.accessionNumber", "resultList*.analysisId",
            "resultList*.testId", "resultList*.sampleId", "resultList*.resultType", "resultList*.sampleGroupingNumber",
            "resultList*.noteId", "resultList*.resultId", "resultList*.hasQualifiedResult",
            "resultList*.sampleIsAccepted", "resultList*.sampleIsRejected", "resultList*.result",
            "resultList*.qualifiedResultValue", "resultList*.multiSelectResultValues", "resultList*.isAccepted",
            "resultList*.isRejected", "resultList*.note" };

    // autowiring not needed, using constructor injection
    private AnalysisService analysisService;
    private TestResultService testResultService;
    private SampleHumanService sampleHumanService;
    private DocumentTrackService documentTrackService;
    private TestSectionService testSectionService;
    private SystemUserService systemUserService;
    private ResultValidationService resultValidationService;
    private NoteService noteService;
    private FhirTransformService fhirTransformService;

    private final String RESULT_SUBJECT = "Result Note";
    private final String RESULT_TABLE_ID;
    private final String RESULT_REPORT_ID;

    public AccessionValidationRestController(AnalysisService analysisService, TestResultService testResultService,
            SampleHumanService sampleHumanService, DocumentTrackService documentTrackService,
            TestSectionService testSectionService, SystemUserService systemUserService,
            ReferenceTablesService referenceTablesService, DocumentTypeService documentTypeService,
            ResultValidationService resultValidationService, NoteService noteService,
            FhirTransformService fhirTransformService) {

        this.analysisService = analysisService;
        this.testResultService = testResultService;
        this.sampleHumanService = sampleHumanService;
        this.documentTrackService = documentTrackService;
        this.testSectionService = testSectionService;
        this.systemUserService = systemUserService;
        this.resultValidationService = resultValidationService;
        this.noteService = noteService;
        this.fhirTransformService = fhirTransformService;

        RESULT_TABLE_ID = referenceTablesService.getReferenceTableByName("RESULT").getId();
        RESULT_REPORT_ID = documentTypeService.getDocumentTypeByName("resultExport").getId();
    }

    @InitBinder
    public void initBinder(WebDataBinder binder) {
        binder.setAllowedFields(ALLOWED_FIELDS);
    }

    @GetMapping(value = "AccessionValidation", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public ResultValidationForm showAccessionValidationRange(HttpServletRequest request,
            @RequestParam(required = false) String accessionNumber, @RequestParam(required = false) String date,
            @RequestParam(required = false) String unitType, @RequestParam(defaultValue = "true") Boolean doRange)
            throws IllegalAccessException, InvocationTargetException, NoSuchMethodException {

        ResultValidationForm newForm = new ResultValidationForm();
        newForm.setDoRange(doRange);
        if (StringUtils.isNotBlank(accessionNumber)) {
            newForm.setAccessionNumber(accessionNumber);
        } else if (StringUtils.isNotBlank(date)) {
            newForm.setTestDate(date);
        } else if (StringUtils.isNotBlank(unitType)) {
            newForm.setTestSectionId(unitType);
        }
        return getResultValidation(request, newForm, doRange);
    }

    private ResultValidationForm getResultValidation(HttpServletRequest request, ResultValidationForm form,
            Boolean doRange) throws IllegalAccessException, InvocationTargetException, NoSuchMethodException {

        String actor = getSysUserId(request);
        form.setDoRange(doRange);
        String newPage = request.getParameter("page");
        if (newPage != null) {
            reviewQueryContextService.page(request.getSession(), actor, form, request.getParameter("queryId"), newPage);
            return form;
        }
        if (StringUtils.isNotBlank(request.getParameter("queryId"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Review query requires a page");
        }

        if (StringUtils.isBlank(actor)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Review session is unavailable");
        }
        var reviewRole = roleService.getRoleByName(Constants.ROLE_VALIDATION);
        if (reviewRole == null || StringUtils.isBlank(reviewRole.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Review role is unavailable");
        }
        String resultsRoleId = reviewRole.getId();
        form.setTestSections(userService.getUserTestSections(actor, resultsRoleId));
        form.setTestSectionsByName(DisplayListService.getInstance().getList(ListType.TEST_SECTION_BY_NAME));
        List<AnalysisItem> resultList = new ArrayList<>();
        ResultsValidationUtility utility = SpringContext.getBean(ResultsValidationUtility.class);
        if (!(GenericValidator.isBlankOrNull(form.getTestSectionId())
                && GenericValidator.isBlankOrNull(form.getAccessionNumber())
                && GenericValidator.isBlankOrNull(form.getTestDate()))) {
            if (Boolean.TRUE.equals(doRange)) {
                resultList = utility.getResultValidationList(getValidationStatus(), form.getTestSectionId(),
                        form.getAccessionNumber(), form.getTestDate());
            } else if (StringUtils.isNotBlank(form.getAccessionNumber())) {
                Sample sample = getSample(form.getAccessionNumber());
                if (sample != null) {
                    resultList = utility.getValidationAnalysisBySample(sample, getValidationStatus());
                }
            }
        }
        // Utility owns patient disclosure rules. Never enrich the cached DTO here.
        boolean depersonalized = FormFields.getInstance().useField(Field.DepersonalizedResults);
        reviewQueryContextService.create(request.getSession(), actor, form, resultList, depersonalized);
        return form;
    }

    public List<String> getValidationStatus() {
        List<String> validationStatus = new ArrayList<>();
        validationStatus
                .add(SpringContext.getBean(IStatusService.class).getStatusID(AnalysisStatus.TechnicalAcceptance));
        if (ConfigurationProperties.getInstance()
                .isPropertyValueEqual(ConfigurationProperties.Property.VALIDATE_REJECTED_TESTS, "true")) {
            validationStatus
                    .add(SpringContext.getBean(IStatusService.class).getStatusID(AnalysisStatus.TechnicalRejected));
        }

        return validationStatus;
    }

    @PostMapping(value = "AccessionValidation", produces = MediaType.APPLICATION_JSON_VALUE, consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public ResultValidationForm showAccessionValidationRangeSave(HttpServletRequest request,
            @Validated(ResultValidationForm.ResultValidation.class) @RequestBody ResultValidationForm form,
            BindingResult result) throws IllegalAccessException, InvocationTargetException, NoSuchMethodException {

        if ("true".equals(request.getParameter("pageResults"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Use the query-bound GET page endpoint");
        }
        form.setSearchFinished(false);

        if (result.hasErrors()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid review submission");
        }
        String actor = getSysUserId(request);
        List<AnalysisItem> resultItemList = reviewQueryContextService.consumeForSave(request.getSession(), actor, form);
        reviewSubmissionService.save(request, actor, resultItemList, form.getReviewSignature());
        form.setReviewSignature(null);
        form.setResultList(java.util.List.of());
        return form;
    }

    private Errors validateModifiedItems(List<AnalysisItem> resultItemList) {
        Errors errors = new BaseErrors();

        for (AnalysisItem item : resultItemList) {
            Errors errorList = new BaseErrors();
            validateQuantifiableItems(item, errorList);

            if (errorList.hasErrors()) {
                StringBuilder augmentedAccession = new StringBuilder(item.getAccessionNumber());
                augmentedAccession.append(" : ");
                augmentedAccession.append(item.getTestName());
                String errorMsg = "errors.followingAccession";
                errors.reject(errorMsg, new String[] { augmentedAccession.toString() }, errorMsg);
                errors.addAllErrors(errorList);
            }
        }

        return errors;
    }

    public void validateQuantifiableItems(AnalysisItem analysisItem, Errors errorList) {
        if (analysisItem.isHasQualifiedResult() && isBlankOrNull(analysisItem.getQualifiedResultValue())
                && analysisItemWillBeUpdated(analysisItem)) {
            errorList.reject("errors.missing.result.details", new String[] { "Result" },
                    "errors.missing.result.details");
        }
        // verify that qualifiedResultValue has been entered if required
        if (!isBlankOrNull(analysisItem.getQualifiedDictionaryId())) {
            String[] qualifiedDictionaryIds = analysisItem.getQualifiedDictionaryId().replace("[", "").replace("]", "")
                    .split(",");
            Set<String> qualifiedDictIdsSet = new HashSet<>(Arrays.asList(qualifiedDictionaryIds));

            if (qualifiedDictIdsSet.contains(analysisItem.getResult())
                    && isBlankOrNull(analysisItem.getQualifiedResultValue())) {
                errorList.reject("errors.missing.result.details", new String[] { "Result" },
                        "errors.missing.result.details");
            }
        }
    }

    private void createUpdateList(List<AnalysisItem> analysisItems, List<Analysis> analysisUpdateList,
            List<Result> resultUpdateList, List<Note> noteUpdateList, List<Result> deletableList,
            IResultSaveService resultValidationSave, boolean areListeners, String actor) {

        List<String> analysisIdList = new ArrayList<>();

        for (AnalysisItem analysisItem : analysisItems) {
            if (!analysisItem.isReadOnly() && analysisItemWillBeUpdated(analysisItem)) {

                Analysis analysis = analysisService.get(analysisItem.getAnalysisId());
                analysis.setSysUserId(actor);

                if (!analysisIdList.contains(analysis.getId())) {

                    if (analysisItem.getIsAccepted()) {
                        analysis.setStatusId(
                                SpringContext.getBean(IStatusService.class).getStatusID(AnalysisStatus.Finalized));
                        analysis.setReleasedDate(new java.sql.Timestamp(System.currentTimeMillis()));
                        analysisIdList.add(analysis.getId());
                        analysisUpdateList.add(analysis);
                    }

                    if (analysisItem.getIsRejected()) {
                        analysis.setStatusId(SpringContext.getBean(IStatusService.class)
                                .getStatusID(AnalysisStatus.BiologistRejected));
                        analysisIdList.add(analysis.getId());
                        analysisUpdateList.add(analysis);
                    }
                }

                createNeededNotes(analysisItem, analysis, noteUpdateList, actor);

                if (areResults(analysisItem)) {
                    List<Result> results = createResultFromAnalysisItem(analysisItem, analysis, analysis,
                            noteUpdateList, deletableList, actor);
                    for (Result result : results) {
                        resultUpdateList.add(result);

                        if (areListeners) {
                            addResultSets(analysis, result, resultValidationSave);
                        }
                    }
                }
            }
        }
    }

    private void createNeededNotes(AnalysisItem analysisItem, Analysis analysis, List<Note> noteUpdateList,
            String actor) {
        if (analysisItem.getIsRejected()) {
            Note note = noteService.createSavableNote(analysis, NoteType.INTERNAL,
                    MessageUtil.getMessage("validation.note.retest"), RESULT_SUBJECT, actor);
            noteUpdateList.add(note);
        }

        if (!GenericValidator.isBlankOrNull(analysisItem.getNote())) {
            NoteType noteType = analysisItem.getIsAccepted() ? NoteType.EXTERNAL : NoteType.INTERNAL;
            Note note = noteService.createSavableNote(analysis, noteType, analysisItem.getNote(), RESULT_SUBJECT,
                    actor);
            noteUpdateList.add(note);
        }
    }

    private void addResultSets(Analysis analysis, Result result, IResultSaveService resultValidationSave) {
        Sample sample = analysis.getSampleItem().getSample();
        Patient patient = sampleHumanService.getPatientForSample(sample);
        if (finalResultAlreadySent(result)) {
            result.setResultEvent(Event.CORRECTION);
            resultValidationSave.getModifiedResults()
                    .add(new ResultSet(result, null, null, patient, sample, null, false));
        } else {
            result.setResultEvent(Event.FINAL_RESULT);
            resultValidationSave.getNewResults().add(new ResultSet(result, null, null, patient, sample, null, false));
        }
    }

    // TO DO bug falsely triggered when preliminary result is sent, fails, retries
    // and succeeds
    private boolean finalResultAlreadySent(Result result) {
        List<DocumentTrack> documents = documentTrackService.getByTypeRecordAndTable(RESULT_REPORT_ID, RESULT_TABLE_ID,
                result.getId());
        return documents.size() > 0;
    }

    private boolean analysisItemWillBeUpdated(AnalysisItem analysisItem) {
        return analysisItem.getIsAccepted() || analysisItem.getIsRejected();
    }

    private void createUpdateElisaList(List<AnalysisItem> resultItems, List<Analysis> analysisUpdateList) {

        for (AnalysisItem resultItem : resultItems) {

            if (resultItem.getIsAccepted()) {

                List<Analysis> acceptedAnalysisList = createAnalysisFromElisaAnalysisItem(resultItem);

                for (Analysis analysis : acceptedAnalysisList) {
                    analysis.setStatusId(
                            SpringContext.getBean(IStatusService.class).getStatusID(AnalysisStatus.Finalized));
                    analysisUpdateList.add(analysis);
                }
            }

            if (resultItem.getIsRejected()) {
                List<Analysis> rejectedAnalysisList = createAnalysisFromElisaAnalysisItem(resultItem);

                for (Analysis analysis : rejectedAnalysisList) {
                    analysis.setStatusId(
                            SpringContext.getBean(IStatusService.class).getStatusID(AnalysisStatus.BiologistRejected));
                    analysisUpdateList.add(analysis);
                }
            }
        }
    }

    private List<Analysis> createAnalysisFromElisaAnalysisItem(AnalysisItem analysisItem) {

        List<Analysis> analysisList = new ArrayList<>();

        Analysis analysis = new Analysis();

        if (!isBlankOrNull(analysisItem.getMurexResult())) {
            analysis = getAnalysisFromId(analysisItem.getMurexAnalysisId());
            analysisList.add(analysis);
        }
        if (!isBlankOrNull(analysisItem.getBiolineResult())) {
            analysis = getAnalysisFromId(analysisItem.getBiolineAnalysisId());
            analysisList.add(analysis);
        }
        if (!isBlankOrNull(analysisItem.getIntegralResult())) {
            analysis = getAnalysisFromId(analysisItem.getIntegralAnalysisId());
            analysisList.add(analysis);
        }
        if (!isBlankOrNull(analysisItem.getVironostikaResult())) {
            analysis = getAnalysisFromId(analysisItem.getVironostikaAnalysisId());
            analysisList.add(analysis);
        }
        if (!isBlankOrNull(analysisItem.getGenieIIResult())) {
            analysis = getAnalysisFromId(analysisItem.getGenieIIAnalysisId());
            analysisList.add(analysis);
        }
        if (!isBlankOrNull(analysisItem.getGenieII10Result())) {
            analysis = getAnalysisFromId(analysisItem.getGenieII10AnalysisId());
            analysisList.add(analysis);
        }
        if (!isBlankOrNull(analysisItem.getGenieII100Result())) {
            analysis = getAnalysisFromId(analysisItem.getGenieII100AnalysisId());
            analysisList.add(analysis);
        }
        if (!isBlankOrNull(analysisItem.getWesternBlot1Result())) {
            analysis = getAnalysisFromId(analysisItem.getWesternBlot1AnalysisId());
            analysisList.add(analysis);
        }
        if (!isBlankOrNull(analysisItem.getWesternBlot2Result())) {
            analysis = getAnalysisFromId(analysisItem.getWesternBlot2AnalysisId());
            analysisList.add(analysis);
        }
        if (!isBlankOrNull(analysisItem.getP24AgResult())) {
            analysis = getAnalysisFromId(analysisItem.getP24AgAnalysisId());
            analysisList.add(analysis);
        }
        if (!isBlankOrNull(analysisItem.getInnoliaResult())) {
            analysis = getAnalysisFromId(analysisItem.getInnoliaAnalysisId());
            analysisList.add(analysis);
        }

        analysisList.add(analysis);

        return analysisList;
    }

    private Analysis getAnalysisFromId(String id) {
        Analysis analysis = analysisService.get(id);
        analysis.setSysUserId(getSysUserId(request));

        return analysis;
    }

    private List<Result> createResultFromAnalysisItem(AnalysisItem analysisItem, Analysis analysis, Analysis analysis2,
            List<Note> noteUpdateList, List<Result> deletableList, String actor) {

        ResultSaveBean bean = ResultSaveBeanAdapter.fromAnalysisItem(analysisItem);
        ResultSaveService resultSaveService = new ResultSaveService(analysis, actor);
        List<Result> results = resultSaveService.createResultsFromTestResultItem(bean, deletableList);
        if (analysisService.patientReportHasBeenDone(analysis) && resultSaveService.isUpdatedResult()) {
            Note note = noteService.createSavableNote(analysis, NoteType.EXTERNAL,
                    MessageUtil.getMessage("note.corrected.result"), RESULT_SUBJECT, actor);
            if (!noteService.duplicateNoteExists(note)) {
                analysis.setCorrectedSincePatientReport(true);
                noteUpdateList.add(noteService.createSavableNote(analysis, NoteType.EXTERNAL,
                        MessageUtil.getMessage("note.corrected.result"), RESULT_SUBJECT, actor));
            }
        }
        return results;
    }

    protected TestResult getTestResult(AnalysisItem analysisItem) {
        TestResult testResult = null;
        if (TypeOfTestResultServiceImpl.ResultType.DICTIONARY.matches(analysisItem.getResultType())) {
            testResult = testResultService.getTestResultsByTestAndDictonaryResult(analysisItem.getTestId(),
                    analysisItem.getResult());
        } else {
            List<TestResult> testResultList = testResultService.getActiveTestResultsByTest(analysisItem.getTestId());
            // we are assuming there is only one testResult for a numeric type
            // result
            if (!testResultList.isEmpty()) {
                testResult = testResultList.get(0);
            }
        }
        return testResult;
    }

    private boolean areResults(AnalysisItem item) {
        return !(isBlankOrNull(item.getResult())
                || (TypeOfTestResultServiceImpl.ResultType.DICTIONARY.matches(item.getResultType())
                        && "0".equals(item.getResult())))
                || (TypeOfTestResultServiceImpl.ResultType.isMultiSelectVariant(item.getResultType())
                        && !isBlankOrNull(item.getMultiSelectResultValues()));
    }

    private SystemUser createSystemUser() {
        return systemUserService.get(getSysUserId(request));
    }

    private Sample getSample(String accessionNumber) {
        return sampleService.getSampleByAccessionNumber(accessionNumber);
    }

    private Patient getPatient(Sample sample) {
        return sampleHumanService.getPatientForSample(sample);
    }

    private void setEmptyResults(ResultValidationForm form)
            throws IllegalAccessException, InvocationTargetException, NoSuchMethodException {
        form.setResultList(new ArrayList<AnalysisItem>());
    }

    @Override
    protected String findLocalForward(String forward) {
        if (FWD_SUCCESS.equals(forward)) {
            return "accessionValidationRangeDefinition";
        } else if (FWD_FAIL.equals(forward)) {
            return "homePageDefinition";
        } else if (FWD_SUCCESS_INSERT.equals(forward)) {
            return "redirect:/AccessionValidationRange";
        } else if (FWD_FAIL_INSERT.equals(forward)) {
            return "homePageDefinition";
        } else if (FWD_VALIDATION_ERROR.equals(forward)) {
            return "accessionValidationRangeDefinition";
        } else {
            return "PageNotFound";
        }
    }
}
