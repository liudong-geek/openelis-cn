package org.openelisglobal.result.service;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.formfields.FormFields.Field;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.ResultSaveService;
import org.openelisglobal.common.services.StatusService.OrderStatus;
import org.openelisglobal.common.services.beanAdapters.ResultSaveBeanAdapter;
import org.openelisglobal.common.services.registration.ResultUpdateRegister;
import org.openelisglobal.common.services.registration.interfaces.IResultUpdate;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.common.util.ControllerUtills;
import org.openelisglobal.dataexchange.orderresult.OrderResponseWorker.Event;
import org.openelisglobal.internationalization.MessageUtil;
import org.openelisglobal.note.service.NoteService;
import org.openelisglobal.note.valueholder.Note;
import org.openelisglobal.referral.service.ReferralResultService;
import org.openelisglobal.referral.service.ReferralService;
import org.openelisglobal.referral.service.ReferralSetService;
import org.openelisglobal.referral.valueholder.ReferralResult;
import org.openelisglobal.referral.valueholder.ReferralSet;
import org.openelisglobal.result.action.util.ResultSet;
import org.openelisglobal.result.action.util.ResultUtil;
import org.openelisglobal.result.action.util.ResultsUpdateDataSet;
import org.openelisglobal.result.exception.ResultSaveValidationException;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.openelisglobal.testcalculated.action.util.TestCalculatedUtil;
import org.openelisglobal.testreflex.action.util.TestReflexBean;
import org.openelisglobal.testreflex.action.util.TestReflexUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class LogbookPersistServiceImpl implements LogbookResultsPersistService {

    @Autowired
    private AnalysisService analysisService;
    @Autowired
    private ResultService resultService;
    @Autowired
    private ResultSignatureService resultSigService;
    @Autowired
    private ResultInventoryService resultInventoryService;
    @Autowired
    private NoteService noteService;
    @Autowired
    private SampleService sampleService;
    @Autowired
    private ReferralService referralService;
    @Autowired
    private ReferralResultService referralResultService;
    @Autowired
    private ReferralSetService referralSetService;
    @Autowired
    private ResultSpecimenWriteGuard specimenWriteGuard;
    @Autowired
    private UserService userService;
    @Autowired
    private org.openelisglobal.audittrail.dao.HistoryDAO historyDAO;
    @Autowired
    private org.openelisglobal.systemuser.service.SystemUserService systemUserService;

    /**
     * Ordinary entry owns preparation AND persistence. It must not join an outer
     * transaction: callers may dispatch FHIR/notifications only after this returns.
     */
    @Override
    @Transactional(isolation = org.springframework.transaction.annotation.Isolation.SERIALIZABLE, rollbackFor = Exception.class)
    public ResultEntrySaveOutcome saveSingleResult(TestResultItem item, HttpServletRequest request) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionAspectSupport.currentTransactionStatus().isNewTransaction()) {
            throw new ResultSaveValidationException(ResultSpecimenWriteGuard.BLOCKED);
        }
        String userId = ControllerUtills.getSysUserId(request);
        if (userId == null || !userId.matches("[1-9][0-9]*"))
            throw new AccessDeniedException("error.notauthorized");
        var entrySession = request.getSession(false);
        Runnable verifyActor = () -> {
            if (entrySession == null || request.getSession(false) != entrySession
                    || !userId.equals(ControllerUtills.getSysUserId(request)))
                throw new AccessDeniedException("error.notauthorized");
        };
        verifyActor.run();
        Analysis analysis = specimenWriteGuard.lockForEntry(item == null ? null : item.getAnalysisId());
        if (analysis == null)
            return ResultEntrySaveOutcome.rejected(404, Map.of());
        requireEntryPermission(userId, analysis);

        item.setModified(true);
        ResultsUpdateDataSet data = new ResultsUpdateDataSet(userId);
        data.filterModifiedItems(List.of(item));
        // ResultUtil must reuse precisely this locked object before its first setter.
        data.getModifiedAnalysis().add(analysis);
        Runnable verifyOriginal = specimenWriteGuard.begin(data);
        String token = item.getAnalysisLastupdated();
        if (analysis.getLastupdated() == null || token == null || !token.matches("[0-9]{1,19}")
                || !String.valueOf(analysis.getLastupdated().getTime()).equals(token)) {
            Map<String, Object> response = new HashMap<>();
            response.put("error", "error.results.staleSave");
            response.put("modifiedBy", lastModifier(analysis));
            if (analysis.getLastupdated() != null) {
                response.put("analysisLastupdated", String.valueOf(analysis.getLastupdated().getTime()));
                response.put("modifiedAt", analysis.getLastupdated().toString());
            }
            return ResultEntrySaveOutcome.rejected(409, response);
        }
        if (!Objects.equals(item.getSampleItemId(), analysis.getSampleItem().getId()) || !Objects
                .equals(item.getAccessionNumber(), analysis.getSampleItem().getSample().getAccessionNumber()))
            throw new ResultSaveValidationException("error.results.orderMismatch");
        ResultSaveService resultBuilder = new ResultSaveService(analysis, userId);
        var bean = ResultSaveBeanAdapter.fromTestResultItem(item);
        if (data.getModifiedItems().isEmpty())
            resultBuilder.validateResultIdentity(bean);
        else if (!resultBuilder.validateResultEntry(bean) && ResultUtil.areResults(item)
                && !ResultUtil.isRejected(item))
            return ResultEntrySaveOutcome.rejected(400,
                    Map.of("error", MessageUtil.getMessage("errors.result.required")));
        var errors = data.validateModifiedItems();
        if (errors.hasErrors())
            return ResultEntrySaveOutcome.rejected(400, Map.of("error", errors.getAllErrors().stream()
                    .map(e -> MessageUtil.getMessage(e.getCode())).collect(java.util.stream.Collectors.joining("; "))));

        var config = ConfigurationProperties.getInstance();
        verifyActor.run();
        ResultUtil.createResultsFromItems(data, FormFields.getInstance().useField(Field.ResultsReferral),
                config.isPropertyValueEqual(Property.ALWAYS_VALIDATE_RESULTS, "true"),
                config.isPropertyValueEqual(Property.resultTechnicianName, "true"),
                config.getPropertyValueUpperCase(Property.StatusRules), request);
        ResultUtil.createAnalysisOnlyUpdates(data, request);
        List<IResultUpdate> updaters = ResultUpdateRegister.getRegisteredUpdaters();
        Map<String, Object> response = new HashMap<>();
        Runnable verify = () -> {
            verifyActor.run();
            requireEntryPermission(userId, analysis);
            requireSingleAnalysis(data, analysis);
            verifyOriginal.run();
            if (!response.isEmpty() && (!Objects.equals(response.get("analysisStatusId"), analysis.getStatusId())
                    || analysis.getLastupdated() == null || !Objects.equals(response.get("analysisLastupdated"),
                            String.valueOf(analysis.getLastupdated().getTime()))))
                throw new ResultSaveValidationException("error.results.staleSave");
        };
        // Keep the original source-state closure; never re-read the newly prepared
        // status as though it were the state on which the editor based this save.
        verify.run();
        List<Analysis> reflex = persistGuardedDataSet(data, updaters, userId, verify);
        response.put("reflex", reflex.stream().filter(a -> !a.getResultCalculated())
                .map(analysisService::getOrderAccessionNumber).toList());
        response.put("calculated", reflex.stream().filter(Analysis::getResultCalculated)
                .map(analysisService::getOrderAccessionNumber).toList());
        response.put("analysisStatusId", analysis.getStatusId());
        if (analysis.getLastupdated() != null)
            response.put("analysisLastupdated", String.valueOf(analysis.getLastupdated().getTime()));
        return new ResultEntrySaveOutcome(200, response, data, updaters);
    }

    private void requireEntryPermission(String userId, Analysis analysis) {
        var allowed = userService.filterAnalysesByLabUnitRoles(userId, List.of(analysis), Constants.ROLE_RESULTS);
        if (allowed == null || allowed.size() != 1 || allowed.get(0) != analysis)
            throw new AccessDeniedException("error.notauthorized");
    }

    private String lastModifier(Analysis analysis) {
        try {
            var rows = historyDAO.getHistoryByRefIdAndRefTableId(analysis.getId(),
                    org.openelisglobal.analysis.service.AnalysisServiceImpl.getTableReferenceId());
            var latest = rows.stream().filter(r -> r.getTimestamp() != null).max(
                    java.util.Comparator.comparing(org.openelisglobal.audittrail.valueholder.History::getTimestamp));
            if (latest.isPresent()) {
                var user = systemUserService.getUserById(latest.get().getSysUserId());
                if (user != null && user.getDisplayName() != null)
                    return user.getDisplayName();
            }
        } catch (RuntimeException failure) {
            org.openelisglobal.common.log.LogEvent.logError(failure);
        }
        return MessageUtil.getMessage("label.results.anotherUser");
    }

    private void requireSingleAnalysis(ResultsUpdateDataSet data, Analysis analysis) {
        if (data.getModifiedAnalysis().size() != 1 || data.getModifiedAnalysis().get(0) != analysis)
            throw new ResultSaveValidationException("error.results.analysisMismatch");
        List<org.openelisglobal.result.valueholder.Result> results = new ArrayList<>(data.getDeletableResults());
        data.getNewResults().forEach(r -> results.add(r.result));
        data.getModifiedResults().forEach(r -> results.add(r.result));
        if (results.stream().anyMatch(
                r -> r == null || r.getAnalysis() == null || !analysis.getId().equals(r.getAnalysis().getId()))
                || data.getSavableReferralSets().stream().anyMatch(r -> r == null || r.getReferral() == null
                        || !analysis.getId().equals(r.getReferral().getAnalysis().getId())))
            throw new ResultSaveValidationException("error.results.analysisMismatch");
    }

    @Override
    @Transactional(isolation = org.springframework.transaction.annotation.Isolation.SERIALIZABLE, rollbackFor = Exception.class)
    public List<Analysis> persistDataSet(ResultsUpdateDataSet actionDataSet, List<IResultUpdate> updaters,
            String sysUserId) {
        Runnable verifySpecimens = specimenWriteGuard.begin(actionDataSet);
        return persistGuardedDataSet(actionDataSet, updaters, sysUserId, verifySpecimens);
    }

    private List<Analysis> persistGuardedDataSet(ResultsUpdateDataSet actionDataSet, List<IResultUpdate> updaters,
            String sysUserId, Runnable verifySpecimens) {
        for (Note note : actionDataSet.getNoteList()) {
            noteService.insert(note);
        }

        for (ResultSet resultSet : actionDataSet.getNewResults()) {
            resultSet.result.setResultEvent(Event.PRELIMINARY_RESULT);
            resultSet.result.setFhirUuid(UUID.randomUUID());
            String resultId;

            // Check if result already exists for this specific Analysis (not Sample+Test)
            // This allows different aliquots (SampleItems) of the same sample to have
            // results for the same test type, since each aliquot has its own Analysis
            if (resultSet.result.getId() == null) {
                resultId = resultService.insert(resultSet.result);
            } else {
                continue;
            }

            if (resultSet.signature != null) {
                resultSet.signature.setResultId(resultSet.result.getId());
                resultSigService.insert(resultSet.signature);
            }

            if (resultSet.testKit != null && resultSet.testKit.getInventoryLocationId() != null) {
                resultSet.testKit.setResultId(resultSet.result.getId());
                resultInventoryService.insert(resultSet.testKit);
            }
            resultSet.result.setId(resultId);
        }

        for (ReferralSet referralSet : actionDataSet.getSavableReferralSets()) {
            if (referralSet != null) {
                saveReferralsWithRequiredObjects(referralSet, sysUserId);
            }
        }

        for (ResultSet resultSet : actionDataSet.getModifiedResults()) {
            resultSet.result.setResultEvent(Event.RESULT);
            resultService.update(resultSet.result);

            if (resultSet.signature != null) {
                resultSet.signature.setResultId(resultSet.result.getId());
                if (resultSet.alwaysInsertSignature) {
                    resultSigService.insert(resultSet.signature);
                } else {
                    resultSigService.update(resultSet.signature);
                }
            }

            if (resultSet.testKit != null && resultSet.testKit.getInventoryLocationId() != null) {
                resultSet.testKit.setResultId(resultSet.result.getId());
                if (resultSet.testKit.getId() == null) {
                    resultInventoryService.insert(resultSet.testKit);
                } else {
                    resultInventoryService.update(resultSet.testKit);
                }
            }
        }

        for (Analysis analysis : actionDataSet.getModifiedAnalysis()) {
            analysisService.update(analysis);
        }

        ResultSaveService.removeDeletedResultsInTransaction(actionDataSet.getDeletableResults(), sysUserId);

        List<Analysis> reflexAnalysises = setTestReflexes(actionDataSet, sysUserId);

        setSampleStatus(actionDataSet, sysUserId);

        for (IResultUpdate updater : updaters) {
            updater.transactionalUpdate(actionDataSet);
        }
        verifySpecimens.run();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void beforeCommit(boolean readOnly) {
                verifySpecimens.run();
            }
        });
        return reflexAnalysises;
    }

    private void saveReferralsWithRequiredObjects(ReferralSet referralSet, String sysUserId) {

        if (referralSet.getReferral().getId() != null) {
            referralService.update(referralSet.getReferral());
        } else {
            referralService.insert(referralSet.getReferral());
            ReferralResult referralResult = referralSet.getNextReferralResult();
            referralResult.setReferralId(referralSet.getReferral().getId());
            referralResult.setSysUserId(sysUserId);
            referralResultService.insert(referralResult);
        }

        referralSetService.updateReferralSets(Arrays.asList(referralSet), new ArrayList<>(), new HashSet<>(),
                new ArrayList<>(), sysUserId);
    }

    protected List<Analysis> setTestReflexes(ResultsUpdateDataSet actionDataSet, String sysUserId) {
        TestReflexUtil testReflexUtil = new TestReflexUtil();
        TestCalculatedUtil testCaliculatedUtil = new TestCalculatedUtil();
        List allResults = actionDataSet.getNewResults();
        allResults.addAll(actionDataSet.getModifiedResults());
        List<Analysis> reflexAnalysises = testReflexUtil
                .addNewTestsToDBForReflexTests(convertToTestReflexBeanList(allResults), sysUserId);
        testReflexUtil.updateModifiedReflexes(convertToTestReflexBeanList(actionDataSet.getModifiedResults()),
                sysUserId);
        List<Analysis> caclculatedAnalyses = testCaliculatedUtil.addNewTestsToDBForCalculatedTests(allResults,
                sysUserId);
        reflexAnalysises.addAll(caclculatedAnalyses);
        return reflexAnalysises;
    }

    private List<TestReflexBean> convertToTestReflexBeanList(List<ResultSet> resultSetList) {
        List<TestReflexBean> reflexBeanList = new ArrayList<>();

        for (ResultSet resultSet : resultSetList) {
            TestReflexBean reflex = new TestReflexBean();
            reflex.setPatient(resultSet.patient);

            if (resultSet.triggersToSelectedReflexesMap.size() > 0 && resultSet.multipleResultsForAnalysis) {
                for (String trigger : resultSet.triggersToSelectedReflexesMap.keySet()) {
                    if (trigger.equals(resultSet.result.getValue())) {
                        HashMap<String, List<String>> reducedMap = new HashMap<>(1);
                        reducedMap.put(trigger, resultSet.triggersToSelectedReflexesMap.get(trigger));
                        reflex.setTriggersToSelectedReflexesMap(reducedMap);
                    }
                }
                if (reflex.getTriggersToSelectedReflexesMap() == null) {
                    reflex.setTriggersToSelectedReflexesMap(new HashMap<String, List<String>>());
                }
            } else {
                reflex.setTriggersToSelectedReflexesMap(resultSet.triggersToSelectedReflexesMap);
            }

            reflex.setResult(resultSet.result);
            reflex.setSample(resultSet.sample);
            reflexBeanList.add(reflex);
        }

        return reflexBeanList;
    }

    private void setSampleStatus(ResultsUpdateDataSet actionDataSet, String sysUserId) {
        Set<Sample> sampleSet = new HashSet<>();

        for (ResultSet resultSet : actionDataSet.getNewResults()) {
            sampleSet.add(resultSet.sample);
        }

        String sampleTestingStartedId = SpringContext.getBean(IStatusService.class).getStatusID(OrderStatus.Started);
        String sampleNonConformingId = SpringContext.getBean(IStatusService.class)
                .getStatusID(OrderStatus.NonConforming_depricated);

        for (Sample sample : sampleSet) {
            if (!(sample.getStatusId().equals(sampleNonConformingId)
                    || sample.getStatusId().equals(sampleTestingStartedId))) {
                Sample newSample = sampleService.get(sample.getId());

                newSample.setStatusId(sampleTestingStartedId);
                newSample.setSysUserId(sysUserId);
                sampleService.update(newSample);
            }
        }
    }
}
