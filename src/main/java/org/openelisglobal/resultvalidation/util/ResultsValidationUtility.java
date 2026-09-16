/**
 * The contents of this file are subject to the Mozilla Public License Version 1.1 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy of the
 * License at http://www.mozilla.org/MPL/
 *
 * <p>Software distributed under the License is distributed on an "AS IS" basis, WITHOUT WARRANTY OF
 * ANY KIND, either express or implied. See the License for the specific language governing rights
 * and limitations under the License.
 *
 * <p>The Original Code is OpenELIS code.
 *
 * <p>Copyright (C) CIRG, University of Washington, Seattle WA. All Rights Reserved. I-TECH,
 * University of Washington, Seattle WA.
 */
package org.openelisglobal.resultvalidation.util;

import jakarta.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.apache.commons.validator.GenericValidator;
import org.apache.commons.lang3.StringUtils;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.analyte.service.AnalyteService;
import org.openelisglobal.analyte.valueholder.Analyte;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.formfields.FormFields.Field;
import org.openelisglobal.common.log.LogEvent;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.QAService;
import org.openelisglobal.common.services.StatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.StatusService.RecordStatus;
import org.openelisglobal.common.services.TestIdentityService;
import org.openelisglobal.common.util.DateUtil;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.common.util.StringUtil;
import org.openelisglobal.dictionary.service.DictionaryService;
import org.openelisglobal.dictionary.valueholder.Dictionary;
import org.openelisglobal.internationalization.MessageUtil;
import org.openelisglobal.note.service.NoteService;
import org.openelisglobal.note.service.NoteServiceImpl.NoteType;
import org.openelisglobal.observationhistory.service.ObservationHistoryService;
import org.openelisglobal.observationhistory.valueholder.ObservationHistory;
import org.openelisglobal.observationhistorytype.service.ObservationHistoryTypeService;
import org.openelisglobal.observationhistorytype.valueholder.ObservationHistoryType;
import org.openelisglobal.patient.form.PatientInfoForm;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.patient.util.PatientUtil;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.patientidentity.valueholder.PatientIdentity;
import org.openelisglobal.patientidentitytype.util.PatientIdentityTypeMap;
import org.openelisglobal.result.service.ResultService;
import org.openelisglobal.result.service.ResultServiceImpl;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.resultlimit.service.ResultLimitService;
import org.openelisglobal.resultlimits.valueholder.ResultLimit;
import org.openelisglobal.resultvalidation.action.util.ResultValidationItem;
import org.openelisglobal.resultvalidation.bean.AnalysisItem;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.statusofsample.util.StatusRules;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.test.service.TestServiceImpl;
import org.openelisglobal.test.valueholder.Test;
import org.openelisglobal.testresult.service.TestResultService;
import org.openelisglobal.testresult.valueholder.TestResult;
import org.openelisglobal.testresultcomponent.valueholder.TestResultComponent;
import org.openelisglobal.typeoftestresult.service.TypeOfTestResultServiceImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class ResultsValidationUtility {

    @Autowired
    protected DictionaryService dictionaryService;
    @Autowired
    protected PatientService patientService;
    @Autowired
    protected TestSectionService testSectionService;
    @Autowired
    protected ResultService resultService;
    @Autowired
    protected TestResultService testResultService;
    @Autowired
    protected TestService testService;
    @Autowired
    protected SampleService sampleService;
    @Autowired
    protected ObservationHistoryService observationHistoryService;
    @Autowired
    protected AnalyteService analyteService;
    @Autowired
    protected ObservationHistoryTypeService ohTypeService;
    @Autowired
    protected AnalysisService analysisService;
    @Autowired
    protected ResultLimitService resultLimitService;
    @Autowired
    protected org.openelisglobal.testresultcomponent.service.TestResultComponentService testResultComponentService;

    @Autowired
    protected SampleHumanService sampleHumanService;

    private Patient currentPatient;
    protected String SAMPLE_STATUS_OBSERVATION_HISTORY_TYPE_ID;
    protected String CD4_COUNT_SORT_NUMBER;

    protected String ANALYTE_CD4_CT_GENERATED_ID;
    protected String CONCLUSION_ID;

    protected List<String> notValidStatus = new ArrayList<>();
    protected Map<String, String> testIdToUnits = new HashMap<>();
    protected Map<String, Boolean> accessionToValidMap;
    protected String totalTestName = "";
    private static boolean depersonalize = FormFields.getInstance().useField(Field.DepersonalizedResults);

    @PostConstruct
    private void initilaizeGlobalVariables() {
        notValidStatus.add(SpringContext.getBean(IStatusService.class).getStatusID(AnalysisStatus.Finalized));
        notValidStatus.add(SpringContext.getBean(IStatusService.class).getStatusID(AnalysisStatus.Canceled));
        notValidStatus.add(SpringContext.getBean(IStatusService.class).getStatusID(AnalysisStatus.BiologistRejected));
        notValidStatus.add(SpringContext.getBean(IStatusService.class).getStatusID(AnalysisStatus.NotStarted));
        notValidStatus
                .add(SpringContext.getBean(IStatusService.class).getStatusID(AnalysisStatus.NonConforming_depricated));
        Analyte analyte = new Analyte();
        analyte.setAnalyteName("Conclusion");
        analyte = analyteService.getAnalyteByName(analyte, false);
        CONCLUSION_ID = analyte.getId();
        analyte = new Analyte();
        analyte.setAnalyteName("generated CD4 Count");
        analyte = analyteService.getAnalyteByName(analyte, false);
        ANALYTE_CD4_CT_GENERATED_ID = analyte == null ? "" : analyte.getId();

        Test test = testService.getTestByLocalizedName("CD4 absolute count", Locale.ENGLISH);
        if (test != null) {
            CD4_COUNT_SORT_NUMBER = test.getSortOrder();
        }

        ObservationHistoryType oht = ohTypeService.getByName("SampleRecordStatus");
        if (oht != null) {
            SAMPLE_STATUS_OBSERVATION_HISTORY_TYPE_ID = oht.getId();
        }
    }

    public List<AnalysisItem> getResultValidationList(List<String> statusList, String testSectionId,
            String accessionNumber, String date) {

        List<AnalysisItem> resultList = new ArrayList<>();

        if (!GenericValidator.isBlankOrNull(testSectionId)) {
            List<ResultValidationItem> testList = getPageUnValidatedTestResultItemsInTestSection(testSectionId,
                    statusList);
            resultList = testResultListToAnalysisItemList(testList);
            sortByAccessionNumberAndOrder(resultList);
            setGroupingNumbers(resultList);
        } else if (!GenericValidator.isBlankOrNull(accessionNumber)) {
            List<ResultValidationItem> testList = getPageUnValidatedTestResultItemsAtAccessionNumber(accessionNumber,
                    statusList);
            resultList = testResultListToAnalysisItemList(testList);
            sortByAccessionNumberAndOrder(resultList);
            setGroupingNumbers(resultList);
        } else if (!GenericValidator.isBlankOrNull(date)) {
            List<ResultValidationItem> testList = getPageUnValidatedTestResultItemsByTestDate(date, statusList);
            resultList = testResultListToAnalysisItemList(testList);
            sortByAccessionNumberAndOrder(resultList);
            setGroupingNumbers(resultList);
        }

        return resultList;
    }

    public int getCountResultValidationList(List<String> statusList, String testSectionId) {

        // List<AnalysisItem> resultList = new ArrayList<>();
        int count = 0;
        if (!GenericValidator.isBlankOrNull(testSectionId)) {
            count = getCountUnValidatedTestResultItemsInTestSection(testSectionId, statusList);
            // resultList = testResultListToAnalysisItemList(testList);
            // sortByAccessionNumberAndOrder(resultList);
            // setGroupingNumbers(resultList);
        }

        return count;
    }

    @SuppressWarnings("unchecked")
    public final List<ResultValidationItem> getPageUnValidatedTestResultItemsInTestSection(String sectionId,
            List<String> statusList) {

        // List<Analysis> analysisList =
        // analysisService.getAllAnalysisByTestSectionAndStatus(sectionId, statusList,
        // false);
        // getPage for validation
        List<Analysis> analysisList = analysisService.getPageAnalysisByTestSectionAndStatus(sectionId, statusList,
                false);
        return getGroupedTestsForAnalysisList(analysisList, !StatusRules.useRecordStatusForValidation());
    }

    @SuppressWarnings("unchecked")
    public final List<ResultValidationItem> getPageUnValidatedTestResultItemsAtAccessionNumber(String accessionNumber,
            List<String> statusList) {

        // List<Analysis> analysisList =
        // analysisService.getAllAnalysisByTestSectionAndStatus(sectionId, statusList,
        // false);
        // getPage for validation
        List<Analysis> analysisList = analysisService.getPageAnalysisAtAccessionNumberAndStatus(accessionNumber,
                statusList, false);
        return getGroupedTestsForAnalysisList(analysisList, !StatusRules.useRecordStatusForValidation());
    }

    @SuppressWarnings("unchecked")
    public final List<ResultValidationItem> getPageUnValidatedTestResultItemsByTestDate(String date,
            List<String> statusList) {

        List<Analysis> analysisList = analysisService.getAnalysisStartedOn(DateUtil.convertStringDateToSqlDate(date))
                .stream().filter(analysis -> statusList.contains(analysis.getStatusId())).collect(Collectors.toList());
        return getGroupedTestsForAnalysisList(analysisList, !StatusRules.useRecordStatusForValidation());
    }

    @SuppressWarnings("unchecked")
    public final int getCountUnValidatedTestResultItemsInTestSection(String sectionId, List<String> statusList) {
        return analysisService.getCountAnalysisByTestSectionAndStatus(sectionId, statusList);
    }

    protected final void sortByAccessionNumberAndOrder(List<AnalysisItem> resultItemList) {
        Collections.sort(resultItemList, new Comparator<AnalysisItem>() {
            @Override
            public final int compare(AnalysisItem a, AnalysisItem b) {
                int accessionComp = a.getAccessionNumber().compareTo(b.getAccessionNumber());
                return ((accessionComp == 0)
                        ? Integer.parseInt(a.getTestSortNumber()) - Integer.parseInt(b.getTestSortNumber())
                        : accessionComp);
            }
        });
    }

    protected final void setGroupingNumbers(List<AnalysisItem> resultList) {
        String currentAccessionNumber = null;
        AnalysisItem headItem = null;
        int groupingCount = 1;

        for (AnalysisItem analysisResultItem : resultList) {
            if (!analysisResultItem.getAccessionNumber().equals(currentAccessionNumber)) {
                currentAccessionNumber = analysisResultItem.getAccessionNumber();
                headItem = analysisResultItem;
                groupingCount++;
            } else {
                if (headItem == null) {
                    throw new IllegalStateException("headItem should not be null here");
                }
                headItem.setMultipleResultForSample(true);
                analysisResultItem.setMultipleResultForSample(true);
            }

            analysisResultItem.setSampleGroupingNumber(groupingCount);
        }
    }

    /*
     * N.B. The ignoreRecordStatus is an abomination and should be removed. It is a
     * quick and dirty fix for workplan and validation using the same code but
     * having different rules
     */
    public final List<ResultValidationItem> getGroupedTestsForAnalysisList(Collection<Analysis> filteredAnalysisList,
            boolean ignoreRecordStatus) throws LIMSRuntimeException {

        List<ResultValidationItem> selectedTestList = new ArrayList<>();
        Dictionary dictionary;

        for (Analysis analysis : filteredAnalysisList) {

            if (ignoreRecordStatus || sampleReadyForValidation(analysis.getSampleItem().getSample())) {
                List<ResultValidationItem> testResultItemList = getResultItemFromAnalysis(analysis);
                // NB. The resultValue is filled in during getResultItemFromAnalysis as a side
                // effect of setResult
                for (ResultValidationItem validationItem : testResultItemList) {
                    if (TypeOfTestResultServiceImpl.ResultType.isDictionaryVariant(validationItem.getResultType())) {
                        dictionary = new Dictionary();
                        String resultValue = null;
                        try {
                            dictionary.setId(validationItem.getResultValue());
                            dictionaryService.getData(dictionary);
                            resultValue = GenericValidator.isBlankOrNull(dictionary.getLocalAbbreviation())
                                    ? dictionary.getDictEntry()
                                    : dictionary.getLocalAbbreviation();
                        } catch (RuntimeException e) {
                            LogEvent.logInfo(this.getClass().getSimpleName(), "getGroupedTestsForAnalysisList",
                                    e.getMessage());
                            // no-op
                        }

                        validationItem.setResultValue(resultValue);
                    }

                    validationItem.setAnalysis(analysis);
                    validationItem.setNonconforming(QAService.isAnalysisParentNonConforming(analysis) || StatusService
                            .getInstance().matches(analysis.getStatusId(), AnalysisStatus.TechnicalRejected));
                    selectedTestList.add(validationItem);
                }
            }
        }

        return selectedTestList;
    }

    public final int getCountGroupedTestsForAnalysisList(Collection<Analysis> filteredAnalysisList,
            boolean ignoreRecordStatus) throws LIMSRuntimeException {

        List<ResultValidationItem> selectedTestList = new ArrayList<>();
        Dictionary dictionary;

        for (Analysis analysis : filteredAnalysisList) {

            if (ignoreRecordStatus || sampleReadyForValidation(analysis.getSampleItem().getSample())) {
                List<ResultValidationItem> testResultItemList = getResultItemFromAnalysis(analysis);
                // NB. The resultValue is filled in during getResultItemFromAnalysis as a side
                // effect of setResult
                for (ResultValidationItem validationItem : testResultItemList) {
                    if (TypeOfTestResultServiceImpl.ResultType.isDictionaryVariant(validationItem.getResultType())) {
                        dictionary = new Dictionary();
                        String resultValue = null;
                        try {
                            dictionary.setId(validationItem.getResultValue());
                            dictionaryService.getData(dictionary);
                            resultValue = GenericValidator.isBlankOrNull(dictionary.getLocalAbbreviation())
                                    ? dictionary.getDictEntry()
                                    : dictionary.getLocalAbbreviation();
                        } catch (RuntimeException e) {
                            LogEvent.logInfo(this.getClass().getSimpleName(), "getGroupedTestsForAnalysisList",
                                    e.getMessage());
                            // no-op
                        }

                        validationItem.setResultValue(resultValue);
                    }

                    validationItem.setAnalysis(analysis);
                    validationItem.setNonconforming(QAService.isAnalysisParentNonConforming(analysis) || StatusService
                            .getInstance().matches(analysis.getStatusId(), AnalysisStatus.TechnicalRejected));
                    selectedTestList.add(validationItem);
                }
            }
        }

        return selectedTestList.size();
    }

    protected final boolean sampleReadyForValidation(Sample sample) {

        Boolean valid = accessionToValidMap.get(sample.getAccessionNumber());

        if (valid == null) {
            valid = getSampleRecordStatus(sample) != RecordStatus.NotRegistered;
            accessionToValidMap.put(sample.getAccessionNumber(), valid);
        }

        return valid;
    }

    /**
     * For a multi-component test, label the row with its component so validators
     * can tell the values apart (the component is resolved via the result's
     * test_result row).
     */
    protected String appendComponentLabel(String displayTestName, Result result, Test test) {
        if (result == null || result.getTestResult() == null || result.getTestResult().getComponentId() == null) {
            return displayTestName;
        }
        List<org.openelisglobal.testresultcomponent.valueholder.TestResultComponent> components = testResultComponentService
                .getActiveComponentsByTestId(test.getId());
        if (components.size() < 2) {
            return displayTestName;
        }
        for (org.openelisglobal.testresultcomponent.valueholder.TestResultComponent component : components) {
            if (component.getId().equals(result.getTestResult().getComponentId())
                    && !GenericValidator.isBlankOrNull(component.getLabel())) {
                return displayTestName + " — " + component.getLabel();
            }
        }
        return displayTestName;
    }

    public final List<ResultValidationItem> getResultItemFromAnalysis(Analysis analysis) throws LIMSRuntimeException {
        List<ResultValidationItem> testResultList = new ArrayList<>();

        List<Result> resultList = resultService.getResultsByAnalysis(analysis);
        NoteType[] noteTypes = { NoteType.EXTERNAL, NoteType.INTERNAL, NoteType.REJECTION_REASON,
                NoteType.NON_CONFORMITY };
        NoteService noteService = SpringContext.getBean(NoteService.class);
        String notes = noteService.getNotesAsString(analysis, true, true, "<br/>", noteTypes, false);

        if (resultList == null) {
            return testResultList;
        }

        // For historical reasons we add a null member to the collection if it
        // is empty
        // this should be refactored.
        // The result list are results associated with the analysis, if there is
        // none we want
        // to present the user with a blank one
        if (resultList.isEmpty()) {
            resultList.add(null);
        }

        ResultValidationItem parentItem = null;
        for (Result result : resultList) {
            if (parentItem != null && result.getParentResult() != null
                    && parentItem.getResultId().equals(result.getParentResult().getId())) {
                parentItem.setQualifiedResultValue(result.getValue());
                parentItem.setHasQualifiedResult(true);
                parentItem.setQualificationResultId(result.getId());
                continue;
            }

            ResultValidationItem resultItem = createTestResultItem(analysis, analysis.getTest(),
                    analysis.getSampleItem().getSortOrder(), result,
                    analysis.getSampleItem().getSample().getAccessionNumber(), notes);

            notes = null; // we only want it once
            if (resultItem.getQualifiedDictionaryId() != null) {
                parentItem = resultItem;
            }

            testResultList.add(resultItem);
        }

        return testResultList;
    }

    protected final ResultValidationItem createTestResultItem(Analysis analysis, Test test, String sequenceNumber,
            Result result, String accessionNumber, String notes) {

        List<TestResult> testResults = getPossibleResultsForTest(test);
        String componentId = effectiveComponentId(analysis, result);
        if (componentId != null) {
            String primaryId = primaryComponentId(analysis);
            testResults = testResults.stream()
                    .filter(option -> componentId.equals(option.getComponentId())
                            || (componentId.equals(primaryId) && option.getComponentId() == null))
                    .collect(Collectors.toList());
        }

        String displayTestName = TestServiceImpl.getLocalizedTestNameWithType(test);
        displayTestName = appendComponentLabel(displayTestName, result, test);
        // displayTestName = augmentTestNameWithRange(displayTestName, result);

        // OGC-1145 Phase 2: the analysis's specimen selects a scoped limit
        // over the shared set when the test carries per-sample-type overrides.
        ResultLimit resultLimit = SpringContext.getBean(ResultLimitService.class).getResultLimitForTestAndPatient(
                test.getId(), currentPatient,
                analysis.getSampleItem() != null ? analysis.getSampleItem().getTypeOfSampleId() : null);
        ResultValidationItem testItem = new ResultValidationItem();

        testItem.setAccessionNumber(accessionNumber);
        testItem.setAnalysis(analysis);
        testItem.setSequenceNumber(sequenceNumber);
        testItem.setTestName(displayTestName);
        testItem.setTestId(test.getId());
        setResultLimitDependencies(resultLimit, testItem, testResults);
        testItem.setAnalysisMethod(analysis.getAnalysisType());
        testItem.setResult(result);
        testItem.setDictionaryResults(getAnyDictonaryValues(testResults));
        // The test-level type is the first test_result row's, which for a
        // multi-component test is the primary's; an entered result knows its
        // own component's type, so prefer the stored one.
        if (result != null && !GenericValidator.isBlankOrNull(result.getResultType())) {
            testItem.setResultType(result.getResultType());
        } else {
            testItem.setResultType(getTestResultType(testResults));
        }
        testItem.setTestSortNumber(test.getSortOrder());
        testItem.setReflexGroup(analysis.getTriggeredReflex());
        testItem.setChildReflex(analysis.getTriggeredReflex() && isConclusion(result, analysis));
        testItem.setQualifiedDictionaryId(getQualifiedDictionaryId(testResults));
        testItem.setPastNotes(notes);

        testItem.setNormalResult(isNormalResult(analysis, result));

        return testItem;
    }

    private void setResultLimitDependencies(ResultLimit resultLimit, ResultValidationItem testItem,
            List<TestResult> testResults) {
        if (resultLimit != null) {
            testItem.setResultLimitId(resultLimit.getId());
            testItem.setLowerCritical(
                    resultLimit.getLowCritical() == Double.NEGATIVE_INFINITY ? 0 : resultLimit.getLowCritical());
            testItem.setHigherCritical(
                    resultLimit.getHighCritical() == Double.POSITIVE_INFINITY ? 0 : resultLimit.getHighCritical());

            testItem.setNormalRange(SpringContext.getBean(ResultLimitService.class).getDisplayReferenceRange(
                    resultLimit, testResults.isEmpty() ? "0" : testResults.get(0).getSignificantDigits(), " - "));
        }
    }

    private boolean isNormalResult(Analysis analysis, Result result) {
        boolean normalResult = false;
        ResultLimit resultLimit = resultLimitService.getResultLimitForAnalysis(analysis);
        if (resultLimit != null && result != null) {
            if (TypeOfTestResultServiceImpl.ResultType.DICTIONARY.matches(result.getResultType())
                    && result.getValue().equals(resultLimit.getDictionaryNormalId())) {
                normalResult = true;
            } else if (TypeOfTestResultServiceImpl.ResultType.NUMERIC.matches(result.getResultType())
                    && !GenericValidator.isBlankOrNull(result.getValue())
                    && (resultLimit.getHighNormal() >= Double.parseDouble(result.getValue(true))
                            && resultLimit.getLowNormal() <= Double.parseDouble(result.getValue(true)))) {
                normalResult = true;
            } else if (!TypeOfTestResultServiceImpl.ResultType.DICTIONARY.matches(result.getResultType())
                    && !GenericValidator.isBlankOrNull(result.getValue())
                    && GenericValidator.isDouble(result.getValue(true))
                    && (resultLimit.getHighNormal() >= Double.parseDouble(result.getValue(true))
                            && resultLimit.getLowNormal() <= Double.parseDouble(result.getValue(true)))) {
                normalResult = true;
            }
        }
        return normalResult;
    }

    protected final String getQualifiedDictionaryId(List<TestResult> testResults) {
        String qualDictionaryIds = "";
        for (TestResult testResult : testResults) {
            if (testResult.getIsQuantifiable()) {
                if (!"".equals(qualDictionaryIds)) {
                    qualDictionaryIds += ",";
                }
                qualDictionaryIds += testResult.getValue();
            }
        }
        return "".equals(qualDictionaryIds) ? null : "[" + qualDictionaryIds + "]";
    }

    protected final String augmentUOMWithRange(String uom, Result result) {
        if (result == null) {
            return uom;
        }
        ResultService resultResultService = SpringContext.getBean(ResultService.class);
        String range = resultResultService.getDisplayReferenceRange(result, true);
        uom = StringUtil.blankIfNull(uom);
        return GenericValidator.isBlankOrNull(range) ? uom : (uom + " ( " + range + " )");
    }

    protected final boolean isConclusion(Result testResult, Analysis analysis) {
        List<Result> results = resultService.getResultsByAnalysis(analysis);
        if (results.size() == 1) {
            return false;
        }

        Long testResultId = Long.parseLong(testResult.getId());
        // This based on the fact that the conclusion is always added
        // after the shared result so if there is a result with a larger id
        // then this is not a conclusion
        for (Result result : results) {
            if (Long.parseLong(result.getId()) > testResultId) {
                return false;
            }
        }

        return true;
    }

    protected final List<TestResult> getPossibleResultsForTest(Test test) {
        return testResultService.getAllActiveTestResultsPerTest(test);
    }

    protected final List<IdValuePair> getAnyDictonaryValues(List<TestResult> testResults) {
        List<IdValuePair> values = null;
        Dictionary dictionary;

        if (testResults != null) {
            for (TestResult testResult : testResults) {
                // Note: result group use to be a criteria but was removed, if
                // results are not as expected investigate
                // A multi-component test mixes row types, so dictionary options
                // are collected from any dictionary-variant row rather than
                // gating on the first row's type.
                if (TypeOfTestResultServiceImpl.ResultType.isDictionaryVariant(testResult.getTestResultType())) {
                    if (values == null) {
                        values = new ArrayList<>();
                        values.add(new IdValuePair("0", ""));
                    }
                    dictionary = dictionaryService.getDataForId(testResult.getValue());
                    String displayValue = dictionary.getLocalizedName();

                    if ("unknown".equals(displayValue)) {
                        displayValue = GenericValidator.isBlankOrNull(dictionary.getLocalAbbreviation())
                                ? dictionary.getDictEntry()
                                : dictionary.getLocalAbbreviation();
                    }
                    values.add(new IdValuePair(testResult.getValue(), displayValue));
                }
            }
        }

        return values;
    }

    protected final String getTestResultType(List<TestResult> testResults) {
        String testResultType = TypeOfTestResultServiceImpl.ResultType.NUMERIC.getCharacterValue();

        if (testResults != null && testResults.size() > 0) {
            testResultType = testResults.get(0).getTestResultType();
        }

        return testResultType;
    }

    private record ReviewComponentKey(String analysisId, String componentId) {
    }

    public final List<AnalysisItem> testResultListToAnalysisItemList(List<ResultValidationItem> testResultList) {
        List<AnalysisItem> rows = new ArrayList<>();
        Map<ReviewComponentKey, AnalysisItem> condensed = new HashMap<>();
        Map<String, List<Result>> storedByAnalysis = new HashMap<>();
        for (ResultValidationItem item : testResultList) {
            Analysis analysis = item.getAnalysis();
            ReviewComponentKey key = new ReviewComponentKey(analysis.getId(),
                    effectiveComponentId(analysis, item.getResult()));
            boolean multiSelect = TypeOfTestResultServiceImpl.ResultType.isMultiSelectVariant(item.getResultType());
            List<Result> stored = storedByAnalysis.computeIfAbsent(analysis.getId(), ignored -> {
                List<Result> results = resultService.getResultsByAnalysis(analysis);
                return results == null ? List.of() : results;
            });
            AnalysisItem row = multiSelect ? condensed.get(key) : null;
            if (row == null) {
                row = testResultItemToAnalysisItem(item, stored);
                rows.add(row);
                if (multiSelect) {
                    condensed.put(key, row);
                }
            }
            // Preserve the legacy qualified-selection metadata, within this component only.
            if (multiSelect && item.isHasQualifiedResult()) {
                row.setQualifiedResultValue(item.getQualifiedResultValue());
                row.setQualifiedResultId(item.getQualificationResultId());
                row.setQualifiedDictionaryId(item.getQualifiedDictionaryId());
                row.setHasQualifiedResult(true);
                row.setNormalRange(item.getNormalRange());
                row.setPatientName(item.getPatientName());
            }
        }
        return rows;
    }

    /** Explicit stored component ids win; legacy NULL rows belong to the primary. */
    private String effectiveComponentId(Analysis analysis, Result result) {
        Result parent = result != null && result.getParentResult() != null ? result.getParentResult() : result;
        if (parent != null && parent.getTestResult() != null
                && !GenericValidator.isBlankOrNull(parent.getTestResult().getComponentId())) {
            return parent.getTestResult().getComponentId();
        }
        // The save service resolves historical NULL definitions to the primary, even
        // for a single active component. Mixing NULL and explicit primary rows must
        // therefore remain one editable selection set.
        return primaryComponentId(analysis);
    }

    private String primaryComponentId(Analysis analysis) {
        List<TestResultComponent> components = testResultComponentService
                .getActiveComponentsByTestId(analysis.getTest().getId());
        if (components == null || components.isEmpty()) {
            return null;
        }
        return components.stream().filter(component -> Boolean.TRUE.equals(component.getIsPrimary()))
                .findFirst().orElse(components.get(0)).getId();
    }

    private void addStoredEvidence(AnalysisItem row, ResultValidationItem item, List<Result> stored) {
        Analysis analysis = item.getAnalysis();
        boolean multiSelect = TypeOfTestResultServiceImpl.ResultType.isMultiSelectVariant(item.getResultType());
        List<Result> parents = stored.stream().filter(Objects::nonNull)
                .filter(result -> result.getAnalysis() != null
                        && Objects.equals(analysis.getId(), result.getAnalysis().getId()))
                .filter(result -> result.getParentResult() == null)
                .filter(result -> Objects.equals(row.getTestResultComponentId(), effectiveComponentId(analysis, result)))
                .filter(result -> multiSelect
                        ? TypeOfTestResultServiceImpl.ResultType.isMultiSelectVariant(result.getResultType())
                        : Objects.equals(item.getResultId(), result.getId()))
                .collect(Collectors.toList());
        Set<String> parentIds = parents.stream().map(Result::getId).collect(Collectors.toSet());
        List<Result> represented = stored.stream().filter(Objects::nonNull)
                .filter(result -> result.getAnalysis() != null
                        && Objects.equals(analysis.getId(), result.getAnalysis().getId()))
                .filter(result -> result.getParentResult() == null ? parentIds.contains(result.getId())
                        : parentIds.contains(result.getParentResult().getId()))
                .collect(Collectors.toList());
        row.setResultMembers(represented.stream()
                .map(result -> new AnalysisItem.ResultMember(result.getId(), result.getValue(), result.getResultType(),
                        effectiveComponentId(analysis, result),
                        result.getParentResult() == null ? null : result.getParentResult().getId(), result.getGrouping()))
                .collect(Collectors.toList()));
        if (multiSelect) {
            row.setMultiSelectResultValues(ResultServiceImpl.getJSONStringForMultiSelect(new ArrayList<>(parents)));
        }
        Result qualified = null;
        for (Result member : represented) {
            if (member.getParentResult() != null) {
                if (qualified == null) {
                    qualified = member;
                }
                if (Objects.equals(item.getResultId(), member.getParentResult().getId())) {
                    qualified = member;
                    break;
                }
            }
        }
        if (qualified != null) {
            row.setQualifiedResultId(qualified.getId());
            row.setQualifiedResultValue(qualified.getValue());
            row.setHasQualifiedResult(true);
        }
    }

    protected final RecordStatus getSampleRecordStatus(Sample sample) {

        List<ObservationHistory> ohList = observationHistoryService.getAll(null, sample,
                SAMPLE_STATUS_OBSERVATION_HISTORY_TYPE_ID);

        if (ohList.isEmpty()) {
            return null;
        }

        return SpringContext.getBean(IStatusService.class).getRecordStatusForID(ohList.get(0).getValue());
    }

    public final AnalysisItem testResultItemToAnalysisItem(ResultValidationItem testResultItem) {
        List<Result> stored = resultService.getResultsByAnalysis(testResultItem.getAnalysis());
        return testResultItemToAnalysisItem(testResultItem, stored == null ? List.of() : stored);
    }

    private AnalysisItem testResultItemToAnalysisItem(ResultValidationItem testResultItem, List<Result> stored) {
        AnalysisItem analysisResultItem = new AnalysisItem();
        String testUnits = getUnitsByTestId(testResultItem.getTestId());
        String testName = testResultItem.getTestName();
        String sortOrder = testResultItem.getTestSortNumber();
        Result result = testResultItem.getResult();

        if (result != null && result.getAnalyte() != null
                && ANALYTE_CD4_CT_GENERATED_ID.equals(testResultItem.getResult().getAnalyte().getId())) {
            testUnits = "";
            testName = MessageUtil.getMessage("result.conclusion.cd4");
            analysisResultItem.setShowAcceptReject(false);
            sortOrder = CD4_COUNT_SORT_NUMBER;
        } else if (testResultItem.getTestName().equals(totalTestName)) {
            analysisResultItem.setShowAcceptReject(false);
            analysisResultItem.setReadOnly(true);
            testUnits = testResultItem.getUnitsOfMeasure();
            analysisResultItem.setIsHighlighted(!"100.0".equals(testResultItem.getResult().getValue()));
        }

        testUnits = augmentUOMWithRange(testUnits, testResultItem.getResult());

        analysisResultItem.setAccessionNumber(testResultItem.getAccessionNumber());
        analysisResultItem.setLowerCritical(
                testResultItem.getLowerCritical() == Double.NEGATIVE_INFINITY ? 0 : testResultItem.getLowerCritical());
        analysisResultItem.setHigherCritical(testResultItem.getHigherCritical() == Double.POSITIVE_INFINITY ? 0
                : testResultItem.getHigherCritical());
        analysisResultItem.setNormalRange(testResultItem.getNormalRange());
        analysisResultItem.setPatientName(testResultItem.getPatientName());
        analysisResultItem.setTestName(testName);
        analysisResultItem.setUnits(testUnits);
        Analysis analysis = testResultItem.getAnalysis();
        analysisResultItem.setAnalysisId(analysis.getId());
        analysisResultItem.setStatusId(analysis.getStatusId());
        analysisResultItem.setLastUpdated(analysis.getLastupdated());
        if (analysis.getLastupdated() != null) {
            analysisResultItem.setAnalysisLastupdated(String.valueOf(analysis.getLastupdated().getTime()));
        }
        if (analysis.getSampleItem() != null) {
            analysisResultItem.setSampleItemId(analysis.getSampleItem().getId());
            if (analysis.getSampleItem().getSample() != null) {
                analysisResultItem.setSampleId(analysis.getSampleItem().getSample().getId());
            }
        }
        analysisResultItem.setRawResultValue(result == null ? null : result.getValue());
        analysisResultItem.setPastNotes(testResultItem.getPastNotes());
        analysisResultItem.setResultId(testResultItem.getResultId());
        analysisResultItem.setTestResultComponentId(effectiveComponentId(analysis, result));
        analysisResultItem.setResultType(testResultItem.getResultType());
        analysisResultItem.setTestId(testResultItem.getTestId());
        analysisResultItem.setTestSortNumber(sortOrder);
        analysisResultItem.setDictionaryResults(testResultItem.getDictionaryResults());
        analysisResultItem.setDisplayResultAsLog(
                TestIdentityService.getInstance().isTestNumericViralLoad(testResultItem.getTestId()));
        analysisResultItem.setNormal(testResultItem.isNormalResult());
        if (result != null) {
            if (!TypeOfTestResultServiceImpl.ResultType.isMultiSelectVariant(testResultItem.getResultType())) {
                analysisResultItem.setResult(getFormattedResult(testResultItem));
            }

            if (TypeOfTestResultServiceImpl.ResultType.NUMERIC.matches(testResultItem.getResultType())) {
                // analysisResultItem.setSignificantDigits( result.getMinNormal().equals(
                // result.getMaxNormal())? -1 : result.getSignificantDigits());
                analysisResultItem.setSignificantDigits(result.getSignificantDigits());
            }
        }
        analysisResultItem.setReflexGroup(testResultItem.isReflexGroup());
        analysisResultItem.setChildReflex(testResultItem.isChildReflex());
        analysisResultItem
                .setNonconforming(testResultItem.isNonconforming() || SpringContext.getBean(IStatusService.class)
                        .matches(testResultItem.getAnalysis().getStatusId(), AnalysisStatus.TechnicalRejected));
        analysisResultItem.setQualifiedDictionaryId(testResultItem.getQualifiedDictionaryId());
        analysisResultItem.setQualifiedResultValue(testResultItem.getQualifiedResultValue());
        analysisResultItem.setQualifiedResultId(testResultItem.getQualificationResultId());
        analysisResultItem.setHasQualifiedResult(testResultItem.isHasQualifiedResult());
        addStoredEvidence(analysisResultItem, testResultItem, stored);

        return analysisResultItem;
    }

    protected final String getFormattedResult(ResultValidationItem testResultItem) {
        String result = testResultItem.getResult().getValue();
        if (TestIdentityService.getInstance().isTestNumericViralLoad(testResultItem.getTestId())
                && !GenericValidator.isBlankOrNull(result)) {
            return result.split("\\(")[0].trim();
        } else {
            ResultService resultResultService = SpringContext.getBean(ResultService.class);
            return resultResultService.getResultValue(testResultItem.getResult(), false);
        }
    }

    public final String getUnitsByTestId(String testId) {

        String uomName = null;

        if (testId != null) {
            uomName = testIdToUnits.get(testId);
            if (uomName == null) {
                Test test = new Test();
                test.setId(testId);
                test = testService.getTestById(test);

                if (test.getUnitOfMeasure() != null) {
                    uomName = test.getUnitOfMeasure().getName();
                    testIdToUnits.put(testId, uomName);
                } else {
                    testIdToUnits.put(testId, "");
                }
            }
        }
        return uomName;
    }

    /** Exact accession lookup uses the same review-ready whitelist as range/date lookup. */
    public List<AnalysisItem> getValidationAnalysisBySample(Sample sample, List<String> statusList) {
        if (sample == null || statusList == null || statusList.isEmpty()) {
            return new ArrayList<>();
        }
        List<Analysis> analyses = analysisService.getAnalysesBySampleId(sample.getId());
        List<Analysis> eligible = analyses == null ? List.of()
                : analyses.stream().filter(Objects::nonNull)
                        .filter(analysis -> statusList.contains(analysis.getStatusId())).collect(Collectors.toList());
        List<AnalysisItem> rows = testResultListToAnalysisItemList(
                getGroupedTestsForAnalysisList(eligible, !StatusRules.useRecordStatusForValidation()));
        sortByAccessionNumberAndOrder(rows);
        setGroupingNumbers(rows);
        return rows;
    }

    public List<AnalysisItem> getValidationAnalysisBySample(Sample sample) {
        List<AnalysisItem> resultList = new ArrayList<>();

        List<ResultValidationItem> testList = getGroupedTestsForSample(sample);
        resultList = testResultListToAnalysisItemList(testList);
        sortByAccessionNumberAndOrder(resultList);
        setGroupingNumbers(resultList);

        return resultList;
    }

    public List<ResultValidationItem> getGroupedTestsForSample(Sample sample) {
        Set<String> excludedAnalysisStatus = new HashSet<>();
        excludedAnalysisStatus.addAll(this.notValidStatus);
        List<Analysis> analysisList = analysisService.getAnalysesBySampleIdExcludedByStatusId(sample.getId(),
                excludedAnalysisStatus);
        return getGroupedTestsForAnalysisList(analysisList, !StatusRules.useRecordStatusForValidation());
    }

    /** Called within the review-context transaction; uses the server sample id. */
    public void populateReviewPatientInfo(List<AnalysisItem> rows, boolean depersonalized) {
        Map<String, Patient> patients = new HashMap<>();
        for (AnalysisItem row : rows) {
            row.setPatientName(depersonalized ? "---" : "");
            row.setPatientInfo(depersonalized ? "---" : "");
            if (depersonalized || StringUtils.isBlank(row.getSampleId())) {
                continue;
            }
            String sampleId = row.getSampleId();
            if (!patients.containsKey(sampleId)) {
                Sample sample = sampleService.get(sampleId);
                patients.put(sampleId, sample == null ? null : sampleHumanService.getPatientForSample(sample));
            }
            Patient patient = patients.get(sampleId);
            if (patient == null) {
                continue;
            }
            if (patient.getPerson() != null) {
                row.setPatientName((StringUtils.trimToEmpty(patient.getPerson().getLastName()) + " "
                        + StringUtils.trimToEmpty(patient.getPerson().getFirstName())).trim());
            }
            row.setPatientInfo(StringUtils.trimToEmpty(patient.getNationalId()) + ", "
                    + StringUtils.trimToEmpty(patient.getGender()) + ", "
                    + StringUtils.trimToEmpty(patient.getBirthDateForDisplay()));
        }
    }

    public void addIdentifingPatientInfo(Patient patient, PatientInfoForm form) {

        if (patient == null) {
            return;
        }

        PatientIdentityTypeMap identityMap = PatientIdentityTypeMap.getInstance();
        List<PatientIdentity> identityList = PatientUtil.getIdentityListForPatient(patient);

        if (!depersonalize) {
            form.setFirstName(patient.getPerson().getFirstName());
            form.setLastName(patient.getPerson().getLastName());
            form.setDob(patient.getBirthDateForDisplay());
            form.setGender(patient.getGender());
        }

        form.setSt(identityMap.getIdentityValue(identityList, "ST"));
        form.setNationalId(GenericValidator.isBlankOrNull(patient.getNationalId()) ? patient.getExternalId()
                : patient.getNationalId());
        form.setSubjectNumber(patientService.getSubjectNumber(patient));
    }
}
