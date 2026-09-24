package org.openelisglobal.program.service;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
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
import org.openelisglobal.program.controller.immunohistochemistry.ImmunohistochemistrySampleForm;
import org.openelisglobal.program.dao.ImmunohistochemistrySampleDAO;
import org.openelisglobal.program.service.SpecialtyCaseWriteGuard.Assignment;
import org.openelisglobal.program.service.SpecialtyCaseWriteGuard.Authorization;
import org.openelisglobal.program.valueholder.immunohistochemistry.ImmunohistochemistrySample;
import org.openelisglobal.program.valueholder.immunohistochemistry.ImmunohistochemistrySample.ImmunohistochemistryStatus;
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
public class ImmunohistochemistrySampleServiceImpl
        extends AuditableBaseObjectServiceImpl<ImmunohistochemistrySample, Integer>
        implements ImmunohistochemistrySampleService {
    @Autowired
    protected ImmunohistochemistrySampleDAO baseObjectDAO;
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

    ImmunohistochemistrySampleServiceImpl() {
        super(ImmunohistochemistrySample.class);
        this.auditTrailLog = true;
    }

    @Override
    protected ImmunohistochemistrySampleDAO getBaseObjectDAO() {
        return baseObjectDAO;
    }

    @Override
    public List<ImmunohistochemistrySample> getWithStatus(List<ImmunohistochemistryStatus> statuses) {
        return baseObjectDAO.getWithStatus(statuses);
    }

    @Transactional(isolation = Isolation.SERIALIZABLE, rollbackFor = Exception.class)
    @Override
    public void assignTechnician(Integer immunohistochemistrySampleId, SystemUser systemUser) {
        ImmunohistochemistrySample persisted = get(immunohistochemistrySampleId);
        Authorization authorization = specialtyCaseWriteGuard.require(systemUser == null ? null : systemUser.getId(),
                persisted, Constants.ROLE_RESULTS);
        specialtyCaseWriteGuard.requireSelfAssignment(authorization, systemUser, persisted.getTechnician());
        ImmunohistochemistrySample immunohistochemistrySample = copyImmunohistochemistrySample(persisted);
        immunohistochemistrySample.setTechnician(systemUser);
        immunohistochemistrySample.setSysUserId(authorization.actor());
        update(immunohistochemistrySample);
    }

    @Transactional(isolation = Isolation.SERIALIZABLE, rollbackFor = Exception.class)
    @Override
    public void assignPathologist(Integer immunohistochemistrySampleId, SystemUser systemUser) {
        ImmunohistochemistrySample persisted = get(immunohistochemistrySampleId);
        Authorization authorization = specialtyCaseWriteGuard.require(systemUser == null ? null : systemUser.getId(),
                persisted, Constants.ROLE_PATHOLOGIST);
        specialtyCaseWriteGuard.requireSelfAssignment(authorization, systemUser, persisted.getPathologist());
        ImmunohistochemistrySample immunohistochemistrySample = copyImmunohistochemistrySample(persisted);
        immunohistochemistrySample.setPathologist(systemUser);
        immunohistochemistrySample.setSysUserId(authorization.actor());
        update(immunohistochemistrySample);
    }

    @Override
    public Long getCountWithStatus(List<ImmunohistochemistryStatus> statuses) {
        return baseObjectDAO.getCountWithStatus(statuses);
    }

    private ImmunohistochemistrySample copyImmunohistochemistrySample(ImmunohistochemistrySample source) {
        ImmunohistochemistrySample copy = new ImmunohistochemistrySample();
        copy.setId(source.getId());
        copy.setLastupdated(source.getLastupdated());
        copy.setProgram(source.getProgram());
        copy.setSample(source.getSample());
        copy.setQuestionnaireResponseUuid(source.getQuestionnaireResponseUuid());
        copy.setTechnician(source.getTechnician());
        copy.setPathologist(source.getPathologist());
        copy.setStatus(source.getStatus());
        copy.setReports(source.getReports() == null ? new ArrayList<>() : new ArrayList<>(source.getReports()));
        copy.setPathologySample(source.getPathologySample());
        copy.setReffered(source.getReffered());
        return copy;
    }

    @Transactional(isolation = Isolation.SERIALIZABLE, rollbackFor = Exception.class)
    @Override
    public void updateWithFormValues(Integer immunohistochemistrySampleId, ImmunohistochemistrySampleForm form) {
        boolean release = Boolean.TRUE.equals(form.getRelease());
        ImmunohistochemistrySample persisted = get(immunohistochemistrySampleId);
        Authorization authorization = specialtyCaseWriteGuard.require(form.getSystemUserId(), persisted,
                release ? List.of(Constants.ROLE_PATHOLOGIST)
                        : List.of(Constants.ROLE_RESULTS, Constants.ROLE_PATHOLOGIST));
        specialtyCaseWriteGuard.requireDraftStatus(release, form.getStatus());
        if (release) {
            specialtyCaseWriteGuard.requireReleaseAssignments(authorization,
                    new Assignment(Constants.ROLE_PATHOLOGIST, persisted.getPathologist()),
                    persisted.getTechnician());
        } else {
            specialtyCaseWriteGuard.requireCurrentAssignment(authorization,
                    List.of(new Assignment(Constants.ROLE_PATHOLOGIST, persisted.getPathologist()),
                            new Assignment(Constants.ROLE_RESULTS, persisted.getTechnician())));
        }
        specialtyCaseWriteGuard.requireUnchangedAssignment(persisted.getPathologist(), form.getAssignedPathologistId());
        specialtyCaseWriteGuard.requireUnchangedAssignment(persisted.getTechnician(), form.getAssignedTechnicianId());
        ImmunohistochemistrySample immunohistochemistrySample = copyImmunohistochemistrySample(persisted);
        immunohistochemistrySample.setSysUserId(authorization.actor());
        immunohistochemistrySample.setStatus(form.getStatus());

        immunohistochemistrySample.getReports().removeAll(immunohistochemistrySample.getReports());
        if (form.getReports() != null)
            form.getReports().stream().forEach(e -> e.setId(null));
        immunohistochemistrySample.getReports().addAll(form.getReports());
        if (release) {
            immunohistochemistrySample.setStatus(ImmunohistochemistryStatus.COMPLETED);
            immunohistochemistrySample = update(immunohistochemistrySample);
            validateImmunohistochemistrySample(immunohistochemistrySample, form, authorization);
        } else {
            update(immunohistochemistrySample);
        }
    }

    private void validateImmunohistochemistrySample(ImmunohistochemistrySample immunohistochemistrySample,
            ImmunohistochemistrySampleForm form, Authorization authorization) {
        immunohistochemistrySample.setStatus(ImmunohistochemistryStatus.COMPLETED);
        Sample sample = immunohistochemistrySample.getSample();
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
                    testResultItem.setResultValue(MessageUtil.getMessage("result.immunochemistry.seereport"));
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
                SpecialtyResultRelease.immunohistochemistry(immunohistochemistrySample));
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

    @Override
    public List<ImmunohistochemistrySample> searchWithStatusAndTerm(List<ImmunohistochemistryStatus> statuses,
            String searchTerm) {
        List<ImmunohistochemistrySample> immunohistochemistrySamples = baseObjectDAO.getWithStatus(statuses);
        if (StringUtils.isNotBlank(searchTerm)) {
            Sample sample = sampleService.getSampleByAccessionNumber(searchTerm);
            if (sample != null) {
                immunohistochemistrySamples = baseObjectDAO.searchWithStatusAndAccesionNumber(statuses, searchTerm);
            } else {
                List<ImmunohistochemistrySample> filteredImmunohistochemistrySamples = new ArrayList<>();
                immunohistochemistrySamples.forEach(pathologySample -> {
                    Patient patient = sampleService.getPatient(pathologySample.getSample());
                    if (patient.getPerson().getFirstName().equals(searchTerm)
                            || patient.getPerson().getLastName().equals(searchTerm)) {
                        filteredImmunohistochemistrySamples.add(pathologySample);
                    }
                });
                immunohistochemistrySamples = filteredImmunohistochemistrySamples;
            }
        }

        return immunohistochemistrySamples;
    }

    @Override
    public Long getCountWithStatusBetweenDates(List<ImmunohistochemistryStatus> statuses, Timestamp from,
            Timestamp to) {
        return baseObjectDAO.getCountWithStatusBetweenDates(statuses, from, to);
    }

    @Override
    public ImmunohistochemistrySample getByPathologySampleId(Integer pathologySampleId) {
        return baseObjectDAO.getByPathologySampleId(pathologySampleId);
    }
}
