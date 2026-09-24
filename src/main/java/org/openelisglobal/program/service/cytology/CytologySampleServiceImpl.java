package org.openelisglobal.program.service.cytology;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.apache.commons.lang3.StringUtils;
import org.apache.commons.validator.GenericValidator;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.service.AuditableBaseObjectServiceImpl;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.ResultSaveService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.StatusService.OrderStatus;
import org.openelisglobal.common.services.beanAdapters.ResultSaveBeanAdapter;
import org.openelisglobal.common.services.registration.ResultUpdateRegister;
import org.openelisglobal.common.services.serviceBeans.ResultSaveBean;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DateUtil;
import org.openelisglobal.internationalization.MessageUtil;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.program.controller.cytology.CytologySampleForm;
import org.openelisglobal.program.dao.cytology.CytologySampleDAO;
import org.openelisglobal.program.service.SpecialtyCaseWriteGuard;
import org.openelisglobal.program.service.SpecialtyCaseWriteGuard.Assignment;
import org.openelisglobal.program.service.SpecialtyCaseWriteGuard.Authorization;
import org.openelisglobal.program.valueholder.cytology.CytologySample;
import org.openelisglobal.program.valueholder.cytology.CytologySample.CytologyStatus;
import org.openelisglobal.program.valueholder.cytology.CytologyDiagnosis;
import org.openelisglobal.program.valueholder.cytology.CytologyDiagnosisCategoryResultsMap;
import org.openelisglobal.program.valueholder.cytology.CytologySpecimenAdequacy;
import org.openelisglobal.result.action.util.ResultSet;
import org.openelisglobal.result.action.util.ResultsLoadUtility;
import org.openelisglobal.result.action.util.ResultsUpdateDataSet;
import org.openelisglobal.result.service.LogbookResultsPersistService;
import org.openelisglobal.result.service.SpecialtyReleaseAuditSupport;
import org.openelisglobal.result.service.SpecialtyResultRelease;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.openelisglobal.typeoftestresult.service.TypeOfTestResultServiceImpl.ResultType;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CytologySampleServiceImpl extends AuditableBaseObjectServiceImpl<CytologySample, Integer>
        implements CytologySampleService {

    @Autowired
    protected CytologySampleDAO baseObjectDAO;

    @Autowired
    protected SystemUserService systemUserService;

    @Autowired
    private SampleService sampleService;

    @Autowired
    private AnalysisService analysisService;

    @Autowired
    private LogbookResultsPersistService logbookResultsPersistService;

    @Autowired
    private SpecialtyCaseWriteGuard specialtyCaseWriteGuard;

    CytologySampleServiceImpl() {
        super(CytologySample.class);
        this.auditTrailLog = true;
    }

    @Override
    protected CytologySampleDAO getBaseObjectDAO() {
        return baseObjectDAO;
    }

    @Override
    public List<CytologySample> getWithStatus(List<CytologyStatus> statuses) {
        return baseObjectDAO.getWithStatus(statuses);
    }

    @Transactional(isolation = Isolation.SERIALIZABLE, rollbackFor = Exception.class)
    @Override
    public void assignTechnician(Integer cytologySampleId, SystemUser systemUser) {
        CytologySample persisted = get(cytologySampleId);
        Authorization authorization = specialtyCaseWriteGuard.require(systemUser == null ? null : systemUser.getId(),
                persisted, Constants.ROLE_RESULTS);
        specialtyCaseWriteGuard.requireSelfAssignment(authorization, systemUser, persisted.getTechnician());
        CytologySample cytologySample = copyCytologySample(persisted);
        cytologySample.setTechnician(systemUser);
        cytologySample.setSysUserId(authorization.actor());
        update(cytologySample);
    }

    @Transactional
    @Override
    public List<CytologySample> searchWithStatusAndTerm(List<CytologyStatus> statuses, String searchTerm) {
        List<CytologySample> cytologySamples = baseObjectDAO.getWithStatus(statuses);
        if (StringUtils.isNotBlank(searchTerm)) {
            Sample sample = sampleService.getSampleByAccessionNumber(searchTerm);
            if (sample != null) {
                cytologySamples = baseObjectDAO.searchWithStatusAndAccesionNumber(statuses, searchTerm);
            } else {
                List<CytologySample> filteredCytologySamples = new ArrayList<>();
                cytologySamples.forEach(cytologySample -> {
                    Patient patient = sampleService.getPatient(cytologySample.getSample());
                    if (patient.getPerson().getFirstName().equals(searchTerm)
                            || patient.getPerson().getLastName().equals(searchTerm)) {
                        filteredCytologySamples.add(cytologySample);
                    }
                });
                cytologySamples = filteredCytologySamples;
            }
        }

        return cytologySamples;
    }

    @Transactional(isolation = Isolation.SERIALIZABLE, rollbackFor = Exception.class)
    @Override
    public void assignCytoPathologist(Integer cytologySampleId, SystemUser systemUser) {
        CytologySample persisted = get(cytologySampleId);
        Authorization authorization = specialtyCaseWriteGuard.require(systemUser == null ? null : systemUser.getId(),
                persisted, Constants.ROLE_CYTOPATHOLOGIST);
        specialtyCaseWriteGuard.requireSelfAssignment(authorization, systemUser, persisted.getCytoPathologist());
        CytologySample cytologySample = copyCytologySample(persisted);
        cytologySample.setCytoPathologist(systemUser);
        cytologySample.setSysUserId(authorization.actor());
        update(cytologySample);
    }

    @Override
    public Long getCountWithStatus(List<CytologyStatus> statuses) {
        return baseObjectDAO.getCountWithStatus(statuses);
    }

    @Override
    public Long getCountWithStatusBetweenDates(List<CytologyStatus> statuses, Timestamp from, Timestamp to) {
        return baseObjectDAO.getCountWithStatusBetweenDates(statuses, from, to);
    }

    private CytologySample copyCytologySample(CytologySample source) {
        CytologySample copy = new CytologySample();
        copy.setId(source.getId());
        copy.setLastupdated(source.getLastupdated());
        copy.setProgram(source.getProgram());
        copy.setSample(source.getSample());
        copy.setQuestionnaireResponseUuid(source.getQuestionnaireResponseUuid());
        copy.setTechnician(source.getTechnician());
        copy.setCytoPathologist(source.getCytoPathologist());
        copy.setStatus(source.getStatus());
        copy.setSlides(source.getSlides() == null ? new ArrayList<>() : new ArrayList<>(source.getSlides()));
        copy.setSpecimenAdequacy(source.getSpecimenAdequacy());
        copy.setDiagnosis(source.getDiagnosis());
        copy.setReports(source.getReports() == null ? new ArrayList<>() : new ArrayList<>(source.getReports()));
        return copy;
    }

    @Transactional(isolation = Isolation.SERIALIZABLE, rollbackFor = Exception.class)
    @Override
    public void updateWithFormValues(Integer cytologySampleId, CytologySampleForm form) {
        boolean release = Boolean.TRUE.equals(form.getRelease());
        CytologySample persisted = get(cytologySampleId);
        Authorization authorization = specialtyCaseWriteGuard.require(form.getSystemUserId(), persisted,
                release ? List.of(Constants.ROLE_CYTOPATHOLOGIST)
                        : List.of(Constants.ROLE_RESULTS, Constants.ROLE_CYTOPATHOLOGIST));
        specialtyCaseWriteGuard.requireDraftStatus(release, form.getStatus());
        if (release) {
            specialtyCaseWriteGuard.requireReleaseAssignments(authorization,
                    new Assignment(Constants.ROLE_CYTOPATHOLOGIST, persisted.getCytoPathologist()),
                    persisted.getTechnician());
        } else {
            specialtyCaseWriteGuard.requireCurrentAssignment(authorization,
                    List.of(new Assignment(Constants.ROLE_CYTOPATHOLOGIST, persisted.getCytoPathologist()),
                            new Assignment(Constants.ROLE_RESULTS, persisted.getTechnician())));
        }
        specialtyCaseWriteGuard.requireUnchangedAssignment(persisted.getCytoPathologist(),
                form.getAssignedCytoPathologistId());
        specialtyCaseWriteGuard.requireUnchangedAssignment(persisted.getTechnician(), form.getAssignedTechnicianId());
        boolean specimenAdequacyChanged = !specimenAdequacySignature(persisted.getSpecimenAdequacy())
                .equals(specimenAdequacySignature(form.getSpecimenAdequacy()));
        boolean diagnosisChanged = !diagnosisSignature(persisted.getDiagnosis())
                .equals(diagnosisSignature(form.getDiagnosis()));
        if (specimenAdequacyChanged || diagnosisChanged) {
            specialtyCaseWriteGuard.requireCurrentAssignment(authorization,
                    List.of(new Assignment(Constants.ROLE_CYTOPATHOLOGIST, persisted.getCytoPathologist())));
        }
        CytologySample cytologySample = copyCytologySample(persisted);
        cytologySample.setSysUserId(authorization.actor());
        cytologySample.setStatus(form.getStatus());

        cytologySample.getSlides().removeAll(cytologySample.getSlides());
        if (form.getSlides() != null)
            form.getSlides().stream().forEach(e -> e.setId(null));
        cytologySample.getSlides().addAll(form.getSlides());
        if (specimenAdequacyChanged && form.getSpecimenAdequacy() != null) {
            cytologySample.setSpecimenAdequacy(rebuildSpecimenAdequacy(form.getSpecimenAdequacy()));
        }

        cytologySample.getReports().removeAll(cytologySample.getReports());
        if (form.getReports() != null) {
            form.getReports().stream().forEach(e -> e.setId(null));
            cytologySample.getReports().addAll(form.getReports());
        }

        if (diagnosisChanged && form.getDiagnosis() != null) {
            cytologySample.setDiagnosis(rebuildDiagnosis(form.getDiagnosis()));
        }

        if (release) {
            cytologySample.setStatus(CytologyStatus.COMPLETED);
            cytologySample = update(cytologySample);
            validateCytologySample(cytologySample, form, authorization);
        } else {
            update(cytologySample);
        }
    }

    private CytologySpecimenAdequacy rebuildSpecimenAdequacy(CytologySpecimenAdequacy submitted) {
        CytologySpecimenAdequacy rebuilt = new CytologySpecimenAdequacy();
        rebuilt.setResultType(submitted.getResultType());
        rebuilt.setSatisfaction(submitted.getSatisfaction());
        rebuilt.setValues(submitted.getValues() == null ? new ArrayList<>() : new ArrayList<>(submitted.getValues()));
        return rebuilt;
    }

    private CytologyDiagnosis rebuildDiagnosis(CytologyDiagnosis submitted) {
        CytologyDiagnosis rebuilt = new CytologyDiagnosis();
        rebuilt.setNegativeDiagnosis(submitted.getNegativeDiagnosis());
        List<CytologyDiagnosisCategoryResultsMap> rebuiltMaps = new ArrayList<>();
        if (submitted.getDiagnosisResultsMaps() != null) {
            for (CytologyDiagnosisCategoryResultsMap submittedMap : submitted.getDiagnosisResultsMaps()) {
                if (submittedMap == null) {
                    throw new org.springframework.security.access.AccessDeniedException("error.notauthorized");
                }
                CytologyDiagnosisCategoryResultsMap rebuiltMap = new CytologyDiagnosisCategoryResultsMap();
                rebuiltMap.setCategory(submittedMap.getCategory());
                rebuiltMap.setResultType(submittedMap.getResultType());
                rebuiltMap.setResults(submittedMap.getResults() == null ? new ArrayList<>()
                        : new ArrayList<>(submittedMap.getResults()));
                rebuiltMaps.add(rebuiltMap);
            }
        }
        rebuilt.setDiagnosisResultsMaps(rebuiltMaps);
        return rebuilt;
    }

    private List<String> specimenAdequacySignature(
            org.openelisglobal.program.valueholder.cytology.CytologySpecimenAdequacy adequacy) {
        if (adequacy == null) {
            return List.of();
        }
        List<String> signature = new ArrayList<>();
        signature.add("resultType=" + Objects.toString(adequacy.getResultType(), ""));
        signature.add("satisfaction=" + Objects.toString(adequacy.getSatisfaction(), ""));
        if (adequacy.getValues() != null) {
            adequacy.getValues().stream().map(StringUtils::defaultString).sorted()
                    .forEach(value -> signature.add("value=" + value));
        }
        return signature;
    }

    private List<String> diagnosisSignature(
            org.openelisglobal.program.valueholder.cytology.CytologyDiagnosis diagnosis) {
        if (diagnosis == null) {
            return List.of();
        }
        List<String> signature = new ArrayList<>();
        signature.add("negative=" + Objects.toString(diagnosis.getNegativeDiagnosis(), ""));
        if (diagnosis.getDiagnosisResultsMaps() != null) {
            diagnosis.getDiagnosisResultsMaps().stream().map(resultMap -> {
                List<String> results = resultMap.getResults() == null ? new ArrayList<>()
                        : resultMap.getResults().stream().map(StringUtils::defaultString).sorted()
                                .collect(Collectors.toList());
                return Objects.toString(resultMap.getCategory(), "") + ":"
                        + Objects.toString(resultMap.getResultType(), "") + ":" + String.join("\u001f", results);
            }).sorted().forEach(value -> signature.add("result=" + value));
        }
        return signature;
    }

    private void validateCytologySample(CytologySample cytologySample, CytologySampleForm form,
            Authorization authorization) {
        cytologySample.setStatus(CytologyStatus.COMPLETED);
        Sample sample = cytologySample.getSample();
        Patient patient = sampleService.getPatient(sample);
        ResultsUpdateDataSet actionDataSet = new ResultsUpdateDataSet(form.getSystemUserId());

        ResultsLoadUtility resultsUtility = SpringContext.getBean(ResultsLoadUtility.class);
        List<TestResultItem> testResultItems = resultsUtility.getGroupedTestsForSample(sample);
        Set<String> releasedAnalysisIds = new LinkedHashSet<>();
        for (TestResultItem testResultItem : testResultItems) {
            if (!testResultItem.getIsGroupSeparator()
                    && authorization.analysisIds().contains(testResultItem.getAnalysisId())) {
                releasedAnalysisIds.add(testResultItem.getAnalysisId());
                if (ResultType.isTextOnlyVariant(testResultItem.getResultType())) {
                    testResultItem.setResultValue(MessageUtil.getMessage("result.cytoology.seereport"));
                }
                Analysis analysis = actionDataSet.findModifiedAnalysis(testResultItem.getAnalysisId());
                boolean firstComponentForAnalysis = analysis == null;
                if (firstComponentForAnalysis) {
                    analysis = SpecialtyReleaseAuditSupport.detachedAnalysis(
                            analysisService.get(testResultItem.getAnalysisId()), form.getSystemUserId());
                }
                ResultSaveBean bean = ResultSaveBeanAdapter.fromTestResultItem(testResultItem);
                ResultSaveService resultSaveService = createResultSaveService(analysis, form.getSystemUserId());
                List<Result> results = resultSaveService.createResultsFromTestResultItem(bean, new ArrayList<>());
                boolean existingResult = results.stream().anyMatch(result -> result.getId() != null);
                analysis.setEnteredDate(DateUtil.getNowAsTimestamp());
                if (firstComponentForAnalysis) {
                    if (existingResult) {
                        analysis.setRevision(String.valueOf(Integer.parseInt(analysis.getRevision()) + 1));
                    } else {
                        analysis.setRevision("1");
                    }
                }
                for (Result result : results) {
                    // Existing Result rows must share the detached release target rather
                    // than retain their persisted source Analysis instance.
                    result.setAnalysis(analysis);
                    boolean newResult = result.getId() == null;
                    if (newResult) {
                        actionDataSet.getNewResults()
                                .add(new ResultSet(result, null, null, patient, sample, new HashMap<>(), false));
                    } else {
                        actionDataSet.getModifiedResults()
                                .add(new ResultSet(result, null, null, patient, sample, new HashMap<>(), false));
                    }

                    // analysis.setStartedDateForDisplay(testResultItem.getTestDate());

                    // This needs to be refactored -- part of the logic is in
                    // getStatusForTestResult. RetroCI over rides to whatever was set before
                    if (ConfigurationProperties.getInstance().getPropertyValueUpperCase(Property.StatusRules)
                            .equals(IActionConstants.STATUS_RULES_RETROCI)) {
                        if (!SpringContext.getBean(IStatusService.class).getStatusID(AnalysisStatus.Canceled)
                                .equals(analysis.getStatusId())) {
                            analysis.setCompletedDate(
                                    DateUtil.convertStringDateToSqlDate(testResultItem.getTestDate()));
                            analysis.setStatusId(SpringContext.getBean(IStatusService.class)
                                    .getStatusID(AnalysisStatus.TechnicalAcceptance));
                        }
                    } else if (SpringContext.getBean(IStatusService.class).matches(analysis.getStatusId(),
                            AnalysisStatus.Finalized)
                            || SpringContext.getBean(IStatusService.class).matches(analysis.getStatusId(),
                                    AnalysisStatus.TechnicalAcceptance)
                            || (analysis.isReferredOut()
                                    && !GenericValidator.isBlankOrNull(testResultItem.getShadowResultValue()))) {
                        analysis.setCompletedDate(DateUtil.convertStringDateToSqlDate(testResultItem.getTestDate()));
                        analysis.setStatusId(
                                SpringContext.getBean(IStatusService.class).getStatusID(AnalysisStatus.Finalized));
                    }

                    // this code is pulled from LogbookResultsRestController
                    // addResult(result, testResultItem, analysis, results.size() > 1,
                    // actionDataSet, useTechnicianName);
                    //
                    // if (analysisShouldBeUpdated(testResultItem, result, supportReferrals)) {
                    // updateAnalysis(testResultItem, testResultItem.getTestDate(),
                    // analysis, statusRuleSet);
                    // }
                }
                analysis.setStatusId(SpringContext.getBean(IStatusService.class).getStatusID(AnalysisStatus.Finalized));
                analysis.setReleasedDate(new java.sql.Timestamp(System.currentTimeMillis()));
                if (firstComponentForAnalysis) {
                    actionDataSet.getModifiedAnalysis().add(analysis);
                }
            }
        }

        specialtyCaseWriteGuard.requireExactReleaseSet(authorization, releasedAnalysisIds);

        logbookResultsPersistService.persistSpecialtyReleaseDataSet(actionDataSet,
                ResultUpdateRegister.getRegisteredUpdaters(), form.getSystemUserId(),
                SpecialtyResultRelease.cytology(cytologySample));
        IStatusService statuses = SpringContext.getBean(IStatusService.class);
        Set<String> terminalStatusIds = new LinkedHashSet<>();
        terminalStatusIds.add(statuses.getStatusID(AnalysisStatus.Finalized));
        terminalStatusIds.add(statuses.getStatusID(AnalysisStatus.Canceled));
        terminalStatusIds.add(statuses.getStatusID(AnalysisStatus.NonConforming_depricated));
        if (specialtyCaseWriteGuard.allAnalysesTerminal(sample, terminalStatusIds)) {
            Sample finishedSample = SpecialtyReleaseAuditSupport.detachedSample(sample, form.getSystemUserId());
            finishedSample.setStatusId(statuses.getStatusID(OrderStatus.Finished));
            sampleService.update(finishedSample);
        }
    }

    protected ResultSaveService createResultSaveService(Analysis analysis, String systemUserId) {
        return new ResultSaveService(analysis, systemUserId);
    }
}
