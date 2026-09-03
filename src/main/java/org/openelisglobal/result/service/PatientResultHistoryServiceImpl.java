package org.openelisglobal.result.service;

import java.sql.Timestamp;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.apache.commons.lang3.StringUtils;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.rest.provider.bean.patientHistory.PanelDisplay;
import org.openelisglobal.common.rest.provider.bean.patientHistory.ResultDisplay;
import org.openelisglobal.common.rest.provider.bean.patientHistory.ResultTree;
import org.openelisglobal.common.rest.provider.bean.patientHistory.TestDisplay;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.util.StringUtil;
import org.openelisglobal.dictionary.service.DictionaryService;
import org.openelisglobal.dictionary.valueholder.Dictionary;
import org.openelisglobal.result.dao.ResultDAO;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.test.valueholder.Test;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.testresult.valueholder.TestResult;
import org.openelisglobal.testresultcomponent.service.TestResultComponentService;
import org.openelisglobal.testresultcomponent.valueholder.TestResultComponent;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.openelisglobal.unitofmeasure.service.UnitOfMeasureService;
import org.openelisglobal.unitofmeasure.valueholder.UnitOfMeasure;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PatientResultHistoryServiceImpl implements PatientResultHistoryService {

    private static final String YES = "Y";
    private static final DateTimeFormatter CLINICAL_TIME_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.S");

    private final ResultDAO resultDAO;
    private final IStatusService statusService;
    private final DictionaryService dictionaryService;
    private final TestService testService;
    private final TestResultComponentService componentService;
    private final UnitOfMeasureService unitOfMeasureService;

    public PatientResultHistoryServiceImpl(ResultDAO resultDAO, IStatusService statusService,
            DictionaryService dictionaryService, TestService testService, TestResultComponentService componentService,
            UnitOfMeasureService unitOfMeasureService) {
        this.resultDAO = resultDAO;
        this.statusService = statusService;
        this.dictionaryService = dictionaryService;
        this.testService = testService;
        this.componentService = componentService;
        this.unitOfMeasureService = unitOfMeasureService;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ResultTree> getResultTree(String patientId) {
        if (StringUtils.isBlank(patientId)) {
            return new ArrayList<>();
        }
        String finalizedStatusId = finalizedStatusId();
        if (finalizedStatusId == null) {
            return new ArrayList<>();
        }

        List<Result> results = safeResults(resultDAO.getFinalizedReportableResultsForPatient(patientId.trim(),
                finalizedStatusId, null), finalizedStatusId);
        return buildTree(results);
    }

    @Override
    @Transactional(readOnly = true)
    public PanelDisplay getTestResultTree(String patientId, String testId) {
        if (StringUtils.isBlank(patientId) || StringUtils.isBlank(testId)) {
            return null;
        }
        String normalizedTestId = testId.trim();
        Test test = testService.get(normalizedTestId);
        if (test == null) {
            return null;
        }
        PanelDisplay panel = new PanelDisplay();
        panel.setDisplay(test.getLocalizedName());
        panel.setSubSets(new ArrayList<>());

        String finalizedStatusId = finalizedStatusId();
        if (finalizedStatusId == null) {
            return panel;
        }
        List<Result> results = safeResults(resultDAO.getFinalizedReportableResultsForPatient(patientId.trim(),
                finalizedStatusId, normalizedTestId), finalizedStatusId);
        List<Result> matchingResults = new ArrayList<>();
        for (Result result : results) {
            Test resultTest = result.getAnalysis().getTest();
            if (resultTest != null && normalizedTestId.equals(resultTest.getId())) {
                matchingResults.add(result);
            }
        }
        if (!matchingResults.isEmpty()) {
            panel.getSubSets().add(buildTestDisplay(test, matchingResults, true));
        }
        return panel;
    }

    private String finalizedStatusId() {
        String statusId = statusService.getStatusID(AnalysisStatus.Finalized);
        return StringUtils.isBlank(statusId) || "-1".equals(statusId) ? null : statusId;
    }

    private List<Result> safeResults(List<Result> candidates, String finalizedStatusId) {
        List<Result> results = new ArrayList<>();
        if (candidates == null) {
            return results;
        }
        for (Result result : candidates) {
            if (isSafeResult(result, finalizedStatusId)) {
                results.add(result);
            }
        }
        return results;
    }

    private boolean isSafeResult(Result result, String finalizedStatusId) {
        if (result == null || !YES.equalsIgnoreCase(result.getIsReportable())) {
            return false;
        }
        Analysis analysis = result.getAnalysis();
        if (analysis == null || !finalizedStatusId.equals(analysis.getStatusId())
                || !YES.equalsIgnoreCase(analysis.getIsReportable())) {
            return false;
        }
        SampleItem sampleItem = analysis.getSampleItem();
        return analysis.getTest() != null && resolveTestSection(analysis) != null && sampleItem != null
                && sampleItem.getTypeOfSample() != null;
    }

    private List<ResultTree> buildTree(List<Result> results) {
        Map<String, SectionBucket> sections = new LinkedHashMap<>();
        for (Result result : results) {
            Analysis analysis = result.getAnalysis();
            Test test = analysis.getTest();
            TestSection section = resolveTestSection(analysis);
            TypeOfSample sampleType = analysis.getSampleItem().getTypeOfSample();

            SectionBucket sectionBucket = sections.computeIfAbsent(section.getId(),
                    ignored -> new SectionBucket(section.getLocalizedName()));
            PanelBucket panelBucket = sectionBucket.panels.computeIfAbsent(sampleType.getId(),
                    ignored -> new PanelBucket(sampleType.getLocalizedName()));
            TestBucket testBucket = panelBucket.tests.computeIfAbsent(test.getId(), ignored -> new TestBucket(test));
            testBucket.results.add(result);
        }

        List<ResultTree> trees = new ArrayList<>();
        for (SectionBucket section : sections.values()) {
            ResultTree tree = new ResultTree();
            tree.setDisplay(section.display);
            List<PanelDisplay> panels = new ArrayList<>();
            for (PanelBucket panelBucket : section.panels.values()) {
                PanelDisplay panel = new PanelDisplay();
                panel.setDisplay(panelBucket.display);
                List<TestDisplay> tests = new ArrayList<>();
                for (TestBucket testBucket : panelBucket.tests.values()) {
                    tests.add(buildTestDisplay(testBucket.test, testBucket.results, false));
                }
                panel.setSubSets(tests);
                panels.add(panel);
            }
            tree.setSubSets(panels);
            trees.add(tree);
        }
        return trees;
    }

    private TestDisplay buildTestDisplay(Test test, List<Result> results, boolean normalizeNumericValue) {
        TestDisplay display = new TestDisplay();
        display.setDisplay(test.getLocalizedName());
        display.setConceptUuid(test.getId());
        display.setHighCritical(null);
        display.setLowCritical(null);
        display.setLowAbsolute(null);

        List<ResultDisplay> observations = new ArrayList<>();
        for (Result result : results) {
            observations.add(buildObservation(result, normalizeNumericValue));
        }
        display.setObs(observations);
        applyConsensusMetadata(display, observations);
        return display;
    }

    private ResultDisplay buildObservation(Result result, boolean normalizeNumericValue) {
        Analysis analysis = result.getAnalysis();
        String resultType = resolveResultType(result);
        String rawValue = StringUtils.defaultString(result.getValue());
        ResultDisplay display = new ResultDisplay();
        display.setResultId(result.getId());
        display.setRawValue(rawValue);
        display.setValue(resolveDisplayValue(result, resultType, rawValue, normalizeNumericValue));
        display.setDatatype(resultType);
        display.setUnits(resolveUnit(result));
        display.setStatusId(analysis.getStatusId());
        String statusName = statusService.getStatusNameFromId(analysis.getStatusId());
        display.setStatus(StringUtils.isBlank(statusName) || "unknown".equalsIgnoreCase(statusName) ? null : statusName);
        display.setReportable(Boolean.TRUE);
        display.setObsDatetime(formatClinicalTime(analysis.getCompletedDate()));

        if (hasReliableNormalRange(result, resultType)) {
            display.setLowNormal(result.getMinNormal());
            display.setHiNormal(result.getMaxNormal());
        }
        applyInterpretation(display, result, resultType, rawValue);
        return display;
    }

    private String resolveDisplayValue(Result result, String resultType, String rawValue,
            boolean normalizeNumericValue) {
        if (isDictionaryType(resultType) && StringUtils.isNumeric(rawValue)) {
            Dictionary dictionary = dictionaryService.get(rawValue);
            return dictionary != null && StringUtils.isNotBlank(dictionary.getDictEntry()) ? dictionary.getDictEntry()
                    : rawValue;
        }
        if (normalizeNumericValue && "N".equalsIgnoreCase(resultType) && StringUtils.isNotBlank(rawValue)) {
            String numericValue = StringUtil.getActualNumericValue(rawValue);
            return "NaN".equals(numericValue) ? rawValue : numericValue;
        }
        return rawValue;
    }

    private String resolveResultType(Result result) {
        if (StringUtils.isNotBlank(result.getResultType())) {
            return result.getResultType().trim();
        }
        TestResult configuredResult = result.getTestResult();
        if (configuredResult != null && StringUtils.isNotBlank(configuredResult.getTestResultType())) {
            return configuredResult.getTestResultType().trim();
        }
        Test test = result.getAnalysis() == null ? null : result.getAnalysis().getTest();
        return test == null ? "" : StringUtils.defaultString(testService.getResultType(test));
    }

    private String resolveUnit(Result result) {
        TestResult configuredResult = result.getTestResult();
        if (configuredResult != null && StringUtils.isNotBlank(configuredResult.getComponentId())) {
            Optional<TestResultComponent> component = componentService.getMatch("id", configuredResult.getComponentId());
            if (component.isEmpty() || StringUtils.isBlank(component.get().getUomId())) {
                return null;
            }
            UnitOfMeasure unit = unitOfMeasureService.getUnitOfMeasureById(component.get().getUomId());
            return unit == null || StringUtils.isBlank(unit.getUnitOfMeasureName()) ? null
                    : unit.getUnitOfMeasureName();
        }
        Test test = result.getAnalysis() == null ? null : result.getAnalysis().getTest();
        UnitOfMeasure unit = test == null ? null : test.getUnitOfMeasure();
        return unit == null || StringUtils.isBlank(unit.getUnitOfMeasureName()) ? null : unit.getUnitOfMeasureName();
    }

    private void applyInterpretation(ResultDisplay display, Result result, String resultType, String rawValue) {
        if (isDictionaryType(resultType) && result.getTestResult() != null
                && result.getTestResult().getIsNormal() != null) {
            boolean abnormal = !result.getTestResult().getIsNormal();
            display.setAbnormal(abnormal);
            display.setInterpretation(abnormal ? "ABNORMAL" : "NORMAL");
            return;
        }
        if (display.getLowNormal() == null || display.getHiNormal() == null) {
            return;
        }
        Double numericValue = numericValue(rawValue);
        if (numericValue == null) {
            return;
        }
        String trimmedValue = rawValue.trim();
        if (trimmedValue.startsWith("<=")) {
            if (numericValue < display.getLowNormal()) {
                display.setAbnormal(Boolean.TRUE);
                display.setInterpretation("LOW");
            }
            return;
        }
        if (trimmedValue.startsWith("<")) {
            if (numericValue <= display.getLowNormal()) {
                display.setAbnormal(Boolean.TRUE);
                display.setInterpretation("LOW");
            }
            return;
        }
        if (trimmedValue.startsWith(">=")) {
            if (numericValue > display.getHiNormal()) {
                display.setAbnormal(Boolean.TRUE);
                display.setInterpretation("HIGH");
            }
            return;
        }
        if (trimmedValue.startsWith(">")) {
            if (numericValue >= display.getHiNormal()) {
                display.setAbnormal(Boolean.TRUE);
                display.setInterpretation("HIGH");
            }
            return;
        }
        if (numericValue < display.getLowNormal()) {
            display.setAbnormal(Boolean.TRUE);
            display.setInterpretation("LOW");
        } else if (numericValue > display.getHiNormal()) {
            display.setAbnormal(Boolean.TRUE);
            display.setInterpretation("HIGH");
        } else {
            display.setAbnormal(Boolean.FALSE);
            display.setInterpretation("NORMAL");
        }
    }

    private boolean hasReliableNormalRange(Result result, String resultType) {
        Double low = result.getMinNormal();
        Double high = result.getMaxNormal();
        if (low == null || high == null || !Double.isFinite(low) || !Double.isFinite(high) || low > high
                || isDictionaryType(resultType)) {
            return false;
        }
        if ("N".equalsIgnoreCase(resultType)) {
            return true;
        }
        return (Double.compare(low, 0.0) != 0 || Double.compare(high, 0.0) != 0)
                && numericValue(result.getValue()) != null;
    }

    private Double numericValue(String value) {
        if (StringUtils.isBlank(value)) {
            return null;
        }
        try {
            Double numericValue = Double.valueOf(StringUtil.getActualNumericValue(value));
            return Double.isFinite(numericValue) ? numericValue : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private boolean isDictionaryType(String resultType) {
        return "D".equalsIgnoreCase(resultType) || "M".equalsIgnoreCase(resultType)
                || "C".equalsIgnoreCase(resultType);
    }

    private String formatClinicalTime(Timestamp completedDate) {
        return completedDate == null ? null : completedDate.toLocalDateTime().format(CLINICAL_TIME_FORMAT);
    }

    private TestSection resolveTestSection(Analysis analysis) {
        if (analysis.getTestSection() != null) {
            return analysis.getTestSection();
        }
        Test test = analysis.getTest();
        return test == null ? null : test.getTestSection();
    }

    private void applyConsensusMetadata(TestDisplay display, List<ResultDisplay> observations) {
        display.setDatatype(commonString(observations, MetadataField.DATATYPE));
        display.setUnits(commonString(observations, MetadataField.UNITS));
        if (!observations.isEmpty() && observations.stream()
                .allMatch(observation -> observation.getLowNormal() != null && observation.getHiNormal() != null)) {
            Double low = observations.get(0).getLowNormal();
            Double high = observations.get(0).getHiNormal();
            if (observations.stream().allMatch(observation -> low.equals(observation.getLowNormal())
                    && high.equals(observation.getHiNormal()))) {
                display.setLowNormal(low);
                display.setHiNormal(high);
            }
        }
    }

    private String commonString(List<ResultDisplay> observations, MetadataField field) {
        if (observations.isEmpty()) {
            return null;
        }
        String first = field.value(observations.get(0));
        if (StringUtils.isBlank(first)) {
            return null;
        }
        return observations.stream().allMatch(observation -> first.equals(field.value(observation))) ? first : null;
    }

    private enum MetadataField {
        DATATYPE {
            @Override
            String value(ResultDisplay display) {
                return display.getDatatype();
            }
        },
        UNITS {
            @Override
            String value(ResultDisplay display) {
                return display.getUnits();
            }
        };

        abstract String value(ResultDisplay display);
    }

    private static class SectionBucket {
        private final String display;
        private final Map<String, PanelBucket> panels = new LinkedHashMap<>();

        private SectionBucket(String display) {
            this.display = display;
        }
    }

    private static class PanelBucket {
        private final String display;
        private final Map<String, TestBucket> tests = new LinkedHashMap<>();

        private PanelBucket(String display) {
            this.display = display;
        }
    }

    private static class TestBucket {
        private final Test test;
        private final List<Result> results = new ArrayList<>();

        private TestBucket(Test test) {
            this.test = test;
        }
    }
}
