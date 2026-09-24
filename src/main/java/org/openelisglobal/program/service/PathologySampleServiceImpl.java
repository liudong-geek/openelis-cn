package org.openelisglobal.program.service;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.apache.commons.lang3.StringUtils;
import org.apache.commons.validator.GenericValidator;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.barcode.form.LabelRowForm;
import org.openelisglobal.barcode.form.LabelsSectionForm;
import org.openelisglobal.barcode.form.PostSavePrintDialogForm;
import org.openelisglobal.barcode.service.BarcodeInfoService;
import org.openelisglobal.barcode.service.BarcodeWorkflowPrintService;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.log.LogEvent;
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
import org.openelisglobal.note.service.NoteService;
import org.openelisglobal.note.service.NoteServiceImpl.NoteType;
import org.openelisglobal.note.valueholder.Note;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.program.controller.pathology.PathologySampleForm;
import org.openelisglobal.program.dao.PathologySampleDAO;
import org.openelisglobal.program.service.SpecialtyCaseWriteGuard.Assignment;
import org.openelisglobal.program.service.SpecialtyCaseWriteGuard.Authorization;
import org.openelisglobal.program.valueholder.immunohistochemistry.ImmunohistochemistrySample;
import org.openelisglobal.program.valueholder.pathology.PathologyConclusion;
import org.openelisglobal.program.valueholder.pathology.PathologyConclusion.ConclusionType;
import org.openelisglobal.program.valueholder.pathology.PathologyRequest;
import org.openelisglobal.program.valueholder.pathology.PathologyRequest.RequestStatus;
import org.openelisglobal.program.valueholder.pathology.PathologyRequest.RequestType;
import org.openelisglobal.program.valueholder.pathology.PathologySample;
import org.openelisglobal.program.valueholder.pathology.PathologySample.PathologyStatus;
import org.openelisglobal.program.valueholder.pathology.PathologyTechnique;
import org.openelisglobal.program.valueholder.pathology.PathologyTechnique.TechniqueType;
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
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.test.valueholder.Test;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.typeoftestresult.service.TypeOfTestResultServiceImpl.ResultType;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PathologySampleServiceImpl extends AuditableBaseObjectServiceImpl<PathologySample, Integer>
        implements PathologySampleService {

    @Autowired
    protected PathologySampleDAO baseObjectDAO;

    @Autowired
    protected SystemUserService systemUserService;

    @Autowired
    private SampleService sampleService;

    @Autowired
    private AnalysisService analysisService;

    @Autowired
    private LogbookResultsPersistService logbookResultsPersistService;

    @Autowired
    private TestService testService;

    @Autowired
    private NoteService noteService;

    @Autowired
    private ImmunohistochemistrySampleService immunohistochemistrySampleService;

    @Autowired
    private TestSectionService testSectionService;

    @Autowired
    private BarcodeInfoService barcodeInfoService;

    @Autowired
    private BarcodeWorkflowPrintService barcodeWorkflowPrintService;

    @Autowired
    private SpecialtyCaseWriteGuard specialtyCaseWriteGuard;

    PathologySampleServiceImpl() {
        super(PathologySample.class);
        this.auditTrailLog = true;
    }

    @Override
    protected PathologySampleDAO getBaseObjectDAO() {
        return baseObjectDAO;
    }

    @Override
    public List<PathologySample> getWithStatus(List<PathologyStatus> statuses) {
        return baseObjectDAO.getWithStatus(statuses);
    }

    @Transactional(isolation = Isolation.SERIALIZABLE, rollbackFor = Exception.class)
    @Override
    public void assignTechnician(Integer pathologySampleId, SystemUser systemUser, String curUserId) {
        PathologySample persisted = get(pathologySampleId);
        Authorization authorization = specialtyCaseWriteGuard.require(curUserId, persisted, Constants.ROLE_RESULTS);
        specialtyCaseWriteGuard.requireSelfAssignment(authorization, systemUser, persisted.getTechnician());
        PathologySample pathologySample = copyPathologySample(persisted);
        pathologySample.setTechnician(systemUser);
        pathologySample.setSysUserId(authorization.actor());
        update(pathologySample);
    }

    @Transactional(isolation = Isolation.SERIALIZABLE, rollbackFor = Exception.class)
    @Override
    public void assignPathologist(Integer pathologySampleId, SystemUser systemUser, String curUserId) {
        PathologySample persisted = get(pathologySampleId);
        Authorization authorization = specialtyCaseWriteGuard.require(curUserId, persisted, Constants.ROLE_PATHOLOGIST);
        specialtyCaseWriteGuard.requireSelfAssignment(authorization, systemUser, persisted.getPathologist());
        PathologySample pathologySample = copyPathologySample(persisted);
        pathologySample.setPathologist(systemUser);
        pathologySample.setSysUserId(authorization.actor());
        update(pathologySample);
    }

    @Override
    public Long getCountWithStatus(List<PathologyStatus> statuses) {
        return baseObjectDAO.getCountWithStatus(statuses);
    }

    private PathologySample copyPathologySample(PathologySample oldPathologySample) {
        PathologySample pathologySample = new PathologySample();
        pathologySample.setBlocks(new ArrayList<>(oldPathologySample.getBlocks()));
        pathologySample.setConclusions(new ArrayList<>(oldPathologySample.getConclusions()));
        pathologySample.setGrossExam(oldPathologySample.getGrossExam());
        pathologySample.setId(oldPathologySample.getId());
        pathologySample.setLastupdated(oldPathologySample.getLastupdated());
        pathologySample.setMicroscopyExam(oldPathologySample.getMicroscopyExam());
        pathologySample.setPathologist(oldPathologySample.getPathologist());
        pathologySample.setProgram(oldPathologySample.getProgram());
        pathologySample.setQuestionnaireResponseUuid(oldPathologySample.getQuestionnaireResponseUuid());
        pathologySample.setReports(new ArrayList<>(oldPathologySample.getReports()));
        pathologySample.setRequests(new ArrayList<>(oldPathologySample.getRequests()));
        pathologySample.setSample(oldPathologySample.getSample());
        pathologySample.setSlides(new ArrayList<>(oldPathologySample.getSlides()));
        pathologySample.setStatus(oldPathologySample.getStatus());
        pathologySample.setTechnician(oldPathologySample.getTechnician());
        pathologySample.setTechniques(new ArrayList<>(oldPathologySample.getTechniques()));
        return pathologySample;
    }

    @Transactional(isolation = Isolation.SERIALIZABLE, rollbackFor = Exception.class)
    @Override
    public void updateWithFormValues(Integer pathologySampleId, PathologySampleForm form) {
        boolean release = Boolean.TRUE.equals(form.getRelease());
        // copying is so we get an object that is detached from hibernate
        PathologySample persisted = get(pathologySampleId);
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
        if (pathologistFieldsChanged(persisted, form)) {
            specialtyCaseWriteGuard.requireCurrentAssignment(authorization,
                    List.of(new Assignment(Constants.ROLE_PATHOLOGIST, persisted.getPathologist())));
        }
        Authorization referralAuthorization = null;
        if (Boolean.TRUE.equals(form.getReferToImmunoHistoChemistry())) {
            // Referral is a specialist decision even when the rest of the case is only
            // being saved as a draft. Authorize it before the first case/IHC write.
            referralAuthorization = specialtyCaseWriteGuard.requireRead(persisted,
                    List.of(Constants.ROLE_PATHOLOGIST));
            specialtyCaseWriteGuard.requireCurrentAssignment(referralAuthorization,
                    List.of(new Assignment(Constants.ROLE_PATHOLOGIST, persisted.getPathologist())));
        }
        PathologySample pathologySample = copyPathologySample(persisted);
        pathologySample.setSysUserId(authorization.actor());
        pathologySample.setStatus(form.getStatus());
        pathologySample.getBlocks().removeAll(pathologySample.getBlocks());
        if (form.getBlocks() != null)
            form.getBlocks().stream().forEach(e -> e.setId(null));
        pathologySample.getBlocks().addAll(form.getBlocks());
        pathologySample.getSlides().removeAll(pathologySample.getSlides());
        if (form.getSlides() != null)
            form.getSlides().stream().forEach(e -> e.setId(null));
        pathologySample.getSlides().addAll(form.getSlides());
        pathologySample.setGrossExam(form.getGrossExam());
        pathologySample.setMicroscopyExam(form.getMicroscopyExam());
        pathologySample.getConclusions().removeAll(pathologySample.getConclusions());
        pathologySample.getConclusions().add(createConclusion(form.getConclusionText(), ConclusionType.TEXT));
        if (form.getConclusions() != null)
            pathologySample.getConclusions().addAll(form.getConclusions().stream()
                    .map(e -> createConclusion(e, ConclusionType.DICTIONARY)).collect(Collectors.toList()));
        pathologySample.getRequests().removeAll(pathologySample.getRequests());
        if (form.getRequests() != null) {
            pathologySample.getRequests()
                    .addAll(form.getRequests().stream()
                            .map(e -> createRequest(e.getValue(), RequestType.DICTIONARY, e.getStatus()))
                            .collect(Collectors.toList()));
        }
        pathologySample.getTechniques().removeAll(pathologySample.getTechniques());
        if (form.getTechniques() != null)
            pathologySample.getTechniques().addAll(form.getTechniques().stream()
                    .map(e -> createTechnique(e, TechniqueType.DICTIONARY)).collect(Collectors.toList()));
        pathologySample.getReports().removeAll(pathologySample.getReports());
        if (form.getReports() != null)
            form.getReports().stream().forEach(e -> e.setId(null));
        pathologySample.getReports().addAll(form.getReports());
        if (release) {
            pathologySample.setStatus(PathologyStatus.COMPLETED);
        }
        try {
            pathologySample = update(pathologySample);
            // Create the referred IHC case and its analyses before pathology release.
            // This keeps those analyses outside the pathology write-set and prevents the
            // enclosing Sample from being completed while IHC work is still pending.
            if (Boolean.TRUE.equals(form.getReferToImmunoHistoChemistry())) {
                referToImmunoHistoChemistry(pathologySample, form, referralAuthorization.caseAnalyses());
                if (release) {
                    authorization = specialtyCaseWriteGuard.requireRead(pathologySample,
                            List.of(Constants.ROLE_PATHOLOGIST));
                }
            }
            if (release) {
                validatePathologySample(pathologySample, form, authorization);
            }
            persistPathologyBarcodeCountsIfSupplied(pathologySample, form);
            populatePathologyWorkflowPrintModels(pathologySample, form);
        } catch (RuntimeException e) {
            LogEvent.logError(e);
            throw e;
        }
    }

    private boolean pathologistFieldsChanged(PathologySample persisted, PathologySampleForm form) {
        return !Objects.equals(StringUtils.defaultString(persisted.getGrossExam()),
                StringUtils.defaultString(form.getGrossExam()))
                || !Objects.equals(StringUtils.defaultString(persisted.getMicroscopyExam()),
                        StringUtils.defaultString(form.getMicroscopyExam()))
                || !pathologyValues(persisted.getTechniques(), PathologyTechnique::getValue,
                        technique -> technique.getType() == null ? "" : technique.getType().name())
                                .equals(formValues(form.getTechniques(), "DICTIONARY"))
                || !pathologyValues(persisted.getRequests(), PathologyRequest::getValue,
                        request -> (request.getType() == null ? "" : request.getType().name()) + ":"
                                + (request.getStatus() == null ? "" : request.getStatus().name()))
                                .equals(requestFormValues(form.getRequests()))
                || !conclusionValues(persisted).equals(conclusionFormValues(form));
    }

    private <T> List<String> pathologyValues(List<T> values, java.util.function.Function<T, String> value,
            java.util.function.Function<T, String> type) {
        if (values == null) {
            return List.of();
        }
        return values.stream().map(item -> type.apply(item) + ":" + StringUtils.defaultString(value.apply(item)))
                .sorted().collect(Collectors.toList());
    }

    private List<String> formValues(List<String> values, String type) {
        if (values == null) {
            return List.of();
        }
        return values.stream().map(value -> type + ":" + StringUtils.defaultString(value)).sorted()
                .collect(Collectors.toList());
    }

    private List<String> requestFormValues(List<PathologySampleForm.PathologyRequestForm> requests) {
        if (requests == null) {
            return List.of();
        }
        return requests.stream()
                .map(request -> "DICTIONARY:"
                        + (request.getStatus() == null ? "" : request.getStatus().name()) + ":"
                        + StringUtils.defaultString(request.getValue()))
                .sorted().collect(Collectors.toList());
    }

    private List<String> conclusionFormValues(PathologySampleForm form) {
        List<String> conclusions = new ArrayList<>(formValues(form.getConclusions(), "DICTIONARY"));
        if (StringUtils.isNotBlank(form.getConclusionText())) {
            conclusions.add("TEXT:" + form.getConclusionText());
        }
        conclusions.sort(String::compareTo);
        return conclusions;
    }

    private List<String> conclusionValues(PathologySample persisted) {
        if (persisted.getConclusions() == null) {
            return List.of();
        }
        return persisted.getConclusions().stream()
                .filter(conclusion -> conclusion.getType() != ConclusionType.TEXT
                        || StringUtils.isNotBlank(conclusion.getValue()))
                .map(conclusion -> (conclusion.getType() == null ? "" : conclusion.getType().name()) + ":"
                        + StringUtils.defaultString(conclusion.getValue()))
                .sorted().collect(Collectors.toList());
    }

    // OGC-285 flow migration — TODO (NEEDS-DESIGN-CALL, do NOT force):
    // The pathology / cytology / immunohistochemistry case-save flow is
    // intentionally NOT migrated to the OGC-285 preset/snapshot model and remains
    // on the legacy BarcodeWorkflowPrintService below. The gap is a product/design
    // decision, not missing wiring: the Block / Slide / Freezer system presets are
    // prints_per_sample and, like all per-sample presets, surface in the
    // aggregation (OrderEntryLabelRequestService) ONLY via test->preset links — but
    // this flow injects block/slide/freezer counts directly onto the order
    // (form.getNumBlockLabels()/Slide/Freezer), with no test linking to those
    // presets. The aggregation therefore cannot emit Block/Slide/Freezer columns
    // for a pathology order. Decision needed before migrating: extend the
    // aggregation/snapshot model to surface these per-sample presets without a
    // test link (e.g. a pathology-context preset set), or drive them from an
    // explicit non-test source. Until then, migrating here would silently drop the
    // Block/Slide/Freezer labels. See the OGC-285 flow-migration report.
    private void populatePathologyWorkflowPrintModels(PathologySample pathologySample, PathologySampleForm form) {
        int orderLabels = normalizePathologyLabelQuantity(form.getNumOrderLabels());
        int specimenLabels = normalizePathologyLabelQuantity(form.getNumSpecimenLabels());
        int blockLabels = normalizePathologyLabelQuantity(form.getNumBlockLabels());
        int slideLabels = normalizePathologyLabelQuantity(form.getNumSlideLabels());
        int freezerLabels = normalizePathologyLabelQuantity(form.getNumFreezerLabels());

        LabelsSectionForm labelsSection = barcodeWorkflowPrintService.buildLabelsSection(orderLabels,
                List.of(specimenLabels));
        java.util.Map<String, Integer> orderQuantities = new LinkedHashMap<>();
        if (labelsSection.getOrderRow() != null && labelsSection.getOrderRow().getQuantities() != null) {
            orderQuantities.putAll(labelsSection.getOrderRow().getQuantities());
        }
        orderQuantities.put("block", blockLabels);
        orderQuantities.put("slide", slideLabels);
        orderQuantities.put("freezer", freezerLabels);
        labelsSection.getOrderRow().setQuantities(orderQuantities);
        labelsSection.getOrderRow().setRowTotal(sumQuantities(orderQuantities));
        int sampleRowTotal = labelsSection.getSampleRows() == null ? 0
                : labelsSection.getSampleRows().stream().mapToInt(LabelRowForm::getRowTotal).sum();
        labelsSection.setRunningTotal(labelsSection.getOrderRow().getRowTotal() + sampleRowTotal);

        String accessionNumber = pathologySample.getSample() == null ? null
                : pathologySample.getSample().getAccessionNumber();
        PostSavePrintDialogForm postSavePrintDialog = barcodeWorkflowPrintService
                .buildPostSavePrintDialog(accessionNumber, labelsSection);

        form.setLabelsSection(labelsSection);
        form.setPostSavePrintDialog(postSavePrintDialog);
    }

    private int sumQuantities(java.util.Map<String, Integer> quantities) {
        return quantities.values().stream().mapToInt(quantity -> quantity == null ? 0 : quantity).sum();
    }

    private int normalizePathologyLabelQuantity(Integer quantity) {
        return quantity != null && quantity > 0 ? quantity : 1;
    }

    private void persistPathologyBarcodeCountsIfSupplied(PathologySample pathologySample, PathologySampleForm form) {
        if (form.getNumOrderLabels() == null || form.getNumSpecimenLabels() == null || form.getNumBlockLabels() == null
                || form.getNumSlideLabels() == null || form.getNumFreezerLabels() == null) {
            return;
        }
        if (form.getNumOrderLabels() < 1 || form.getNumSpecimenLabels() < 1 || form.getNumBlockLabels() < 1
                || form.getNumSlideLabels() < 1 || form.getNumFreezerLabels() < 1) {
            return;
        }

        barcodeInfoService.saveBarcodeInfoForSampleAndSampleItemsPathology(pathologySample.getSample(),
                form.getNumOrderLabels(), form.getNumSpecimenLabels(), form.getNumBlockLabels(),
                form.getNumSlideLabels(), form.getNumFreezerLabels());
    }

    private void validatePathologySample(PathologySample pathologySample, PathologySampleForm form,
            Authorization authorization) {
        pathologySample.setStatus(PathologyStatus.COMPLETED);
        Sample sample = pathologySample.getSample();
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
                    testResultItem.setResultValue(MessageUtil.getMessage("result.pathology.seereport"));
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
                    // Existing Result rows are loaded as detached copies that still point
                    // at the persisted source Analysis. Keep the whole release write-set
                    // on the single detached target used for the audited Analysis update.
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
                SpecialtyResultRelease.pathology(pathologySample));
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

    private void referToImmunoHistoChemistry(PathologySample pathologySample, PathologySampleForm form,
            List<Analysis> pathologyAnalyses) {
        TestSection immunohistochemistrySection = testSectionService
                .getTestSectionByName(SpecialtyCaseWriteGuard.IMMUNOHISTOCHEMISTRY_SECTION);
        if (immunohistochemistrySection == null || immunohistochemistrySection.getId() == null
                || pathologyAnalyses == null || pathologyAnalyses.isEmpty()
                || form.getImmunoHistoChemistryTestIds() == null
                || form.getImmunoHistoChemistryTestIds().isEmpty()) {
            throw new AccessDeniedException("error.notauthorized");
        }
        java.util.Map<String, Test> immunoHistologyTests = new LinkedHashMap<>();
        for (String id : form.getImmunoHistoChemistryTestIds()) {
            Test test = id != null && id.matches("[1-9][0-9]{0,9}") ? testService.get(id) : null;
            if (test == null || !id.equals(test.getId()) || !test.isActive() || test.getTestSection() == null
                    || !immunohistochemistrySection.getId().equals(test.getTestSection().getId())) {
                throw new AccessDeniedException("error.notauthorized");
            }
            immunoHistologyTests.putIfAbsent(test.getId(), test);
        }

        Analysis currentAnalysis = pathologyAnalyses.get(0);
        if (currentAnalysis == null || currentAnalysis.getSampleItem() == null
                || currentAnalysis.getSampleItem().getId() == null) {
            throw new AccessDeniedException("error.notauthorized");
        }

        ImmunohistochemistrySample immunoHistoSample = immunohistochemistrySampleService
                .getByPathologySampleId(pathologySample.getId());
        boolean completedCase = immunoHistoSample != null
                && immunoHistoSample.getStatus() == ImmunohistochemistrySample.ImmunohistochemistryStatus.COMPLETED;
        List<Test> missingTests = new ArrayList<>();
        for (Test test : immunoHistologyTests.values()) {
            Analysis existing = analysisService.getAnalysisBySampleItemAndTest(currentAnalysis.getSampleItem().getId(),
                    test.getId());
            if (existing == null) {
                missingTests.add(test);
            } else if (existing.getTest() == null || !test.getId().equals(existing.getTest().getId())
                    || existing.getSampleItem() == null
                    || !currentAnalysis.getSampleItem().getId().equals(existing.getSampleItem().getId())
                    || existing.getTestSection() == null
                    || !immunohistochemistrySection.getId().equals(existing.getTestSection().getId())) {
                throw new AccessDeniedException("error.notauthorized");
            }
        }
        if (completedCase) {
            if (!missingTests.isEmpty()) {
                throw new AccessDeniedException("error.notauthorized");
            }
            return;
        }
        if (immunoHistoSample == null) {
            immunoHistoSample = new ImmunohistochemistrySample();
        }
        immunoHistoSample.setProgram(pathologySample.getProgram());
        immunoHistoSample.setQuestionnaireResponseUuid(pathologySample.getQuestionnaireResponseUuid());
        immunoHistoSample.setSample(pathologySample.getSample());
        immunoHistoSample.setPathologySample(pathologySample);
        immunoHistoSample.setReffered(true);
        immunoHistoSample.setSysUserId(form.getSystemUserId());
        immunohistochemistrySampleService.save(immunoHistoSample);
        for (Test test : missingTests) {
            createNewAnalysis(test, currentAnalysis, pathologySample.getProgram().getProgramName(),
                    form.getSystemUserId(), immunohistochemistrySection);
        }
    }

    protected void createNewAnalysis(Test immunoHistologyTest, Analysis currentAnalysis, String programmeName,
            String systemUserId, TestSection immunohistochemistrySection) {
        Analysis analysis = new Analysis();
        analysis.setTest(immunoHistologyTest);
        analysis.setIsReportable(currentAnalysis.getIsReportable());
        analysis.setAnalysisType(currentAnalysis.getAnalysisType());
        analysis.setRevision(currentAnalysis.getRevision());
        analysis.setStartedDate(DateUtil.getNowAsTimestamp());
        analysis.setStatusId(SpringContext.getBean(IStatusService.class).getStatusID(AnalysisStatus.NotStarted));
        analysis.setParentAnalysis(currentAnalysis);
        analysis.setSampleItem(currentAnalysis.getSampleItem());
        analysis.setTestSection(immunohistochemistrySection);
        analysis.setSampleTypeName(currentAnalysis.getSampleTypeName());
        analysis.setSysUserId(systemUserId);
        analysisService.insert(analysis);

        List<Note> notes = new ArrayList<>();
        Note note = noteService.createSavableNote(analysis, NoteType.INTERNAL,
                "Refered From Pathology Programme : " + programmeName + "to Immunohistochemistry",
                "Refered to Immunohistochemistry", systemUserId);
        if (!noteService.duplicateNoteExists(note)) {
            notes.add(note);
        }
        noteService.saveAll(notes);
    }

    private PathologyConclusion createConclusion(String text, ConclusionType type) {
        PathologyConclusion conclusion = new PathologyConclusion();
        conclusion.setValue(text);
        conclusion.setType(type);
        return conclusion;
    }

    private PathologyRequest createRequest(String text, RequestType type, RequestStatus status) {
        PathologyRequest request = new PathologyRequest();
        request.setValue(text);
        request.setType(type);
        request.setStatus(status);
        return request;
    }

    private PathologyTechnique createTechnique(String text, TechniqueType type) {
        PathologyTechnique request = new PathologyTechnique();
        request.setValue(text);
        request.setType(type);
        return request;
    }

    @Override
    public List<PathologySample> searchWithStatusAndTerm(List<PathologyStatus> statuses, String searchTerm) {
        List<PathologySample> pathologySamples = baseObjectDAO.getWithStatus(statuses);
        if (StringUtils.isNotBlank(searchTerm)) {
            Sample sample = sampleService.getSampleByAccessionNumber(searchTerm);
            if (sample != null) {
                pathologySamples = baseObjectDAO.searchWithStatusAndAccesionNumber(statuses, searchTerm);
            } else {
                List<PathologySample> filteredpathologySamples = new ArrayList<>();
                pathologySamples.forEach(pathologySample -> {
                    Patient patient = sampleService.getPatient(pathologySample.getSample());
                    if (patient.getPerson().getFirstName().equals(searchTerm)
                            || patient.getPerson().getLastName().equals(searchTerm)) {
                        filteredpathologySamples.add(pathologySample);
                    }
                });
                pathologySamples = filteredpathologySamples;
            }
        }

        return pathologySamples;
    }

    @Override
    public Long getCountWithStatusBetweenDates(List<PathologyStatus> statuses, Timestamp from, Timestamp to) {
        return baseObjectDAO.getCountWithStatusBetweenDates(statuses, from, to);
    }
}
