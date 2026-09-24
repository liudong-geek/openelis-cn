package org.openelisglobal.result.service;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.services.registration.interfaces.IResultUpdate;
import org.openelisglobal.common.util.ControllerUtills;
import org.openelisglobal.result.action.util.ResultsUpdateDataSet;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.result.exception.ResultSaveValidationException;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Secures the retained batch result-entry endpoint. The legacy page cache is a
 * presentation aid, so every write target is locked, version checked and
 * authorized again in the same transaction that persists the results.
 */
@Service
public class LegacyResultEntryWriteService {
    private final OrdinaryResultSaveStateDAO states;
    private final UserService users;
    private final LogbookResultsPersistService persistence;

    public LegacyResultEntryWriteService(OrdinaryResultSaveStateDAO states, UserService users,
            LogbookResultsPersistService persistence) {
        this.states = states;
        this.users = users;
        this.persistence = persistence;
    }

    @Transactional(isolation = Isolation.SERIALIZABLE, rollbackFor = Exception.class)
    public List<Analysis> persist(HttpServletRequest request, ResultsUpdateDataSet data, List<IResultUpdate> updaters) {
        requireTransaction();
        HttpSession session = request == null ? null : request.getSession(false);
        String actor = request == null ? null : ControllerUtills.getSysUserId(request);
        Runnable verifyActor = () -> {
            if (session == null || request.getSession(false) != session || !positive(actor)
                    || !Objects.equals(actor, ControllerUtills.getSysUserId(request)) || data == null
                    || !Objects.equals(actor, data.getCurrentUserId())) {
                throw forbidden();
            }
        };
        verifyActor.run();

        Map<String, String> expectedVersions = expectedVersions(data);
        if (expectedVersions.isEmpty())
            return List.of();
        requirePreparedTargets(data, expectedVersions.keySet());

        Comparator<String> numeric = Comparator.comparing(BigInteger::new);
        Map<String, OrdinaryResultSaveStateDAO.SpecimenState> originals = new TreeMap<>(numeric);
        for (String id : expectedVersions.keySet()) {
            var state = states.findSpecimenState(id);
            if (state == null || !id.equals(state.analysisId()) || !positive(state.sampleItemId()))
                throw conflict("error.results.analysisMismatch");
            originals.put(id, state);
        }
        originals.values().stream().map(OrdinaryResultSaveStateDAO.SpecimenState::sampleItemId).distinct()
                .sorted(numeric).forEach(states::lockSpecimen);

        Map<String, Analysis> locked = new LinkedHashMap<>();
        expectedVersions.keySet().stream().sorted(numeric).forEach(id -> locked.put(id, states.lockAnalysis(id)));
        verifyActor.run();
        verifyTargets(data, expectedVersions, originals, locked);
        requireAuthorized(actor, locked, expectedVersions.keySet());

        Runnable verifyAccess = () -> {
            verifyActor.run();
            requirePreparedTargets(data, expectedVersions.keySet());
            requireAuthorized(actor, locked, expectedVersions.keySet());
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void beforeCommit(boolean readOnly) {
                    verifyAccess.run();
                }
            });
        }

        List<Analysis> reflex = persistence.persistDataSet(data, updaters, actor);
        verifyAccess.run();
        return reflex;
    }

    private Map<String, String> expectedVersions(ResultsUpdateDataSet data) {
        Map<String, String> versions = new TreeMap<>(Comparator.comparing(BigInteger::new));
        List<TestResultItem> rows = new ArrayList<>(data.getModifiedItems());
        rows.addAll(data.getAnalysisOnlyChangeResults());
        for (TestResultItem row : rows) {
            if (row == null || !positive(row.getAnalysisId()) || row.getAnalysisLastupdated() == null
                    || !row.getAnalysisLastupdated().matches("[0-9]{1,19}")) {
                throw conflict("error.results.staleSave");
            }
            String previous = versions.putIfAbsent(row.getAnalysisId(), row.getAnalysisLastupdated());
            if (previous != null && !previous.equals(row.getAnalysisLastupdated()))
                throw conflict("error.results.staleSave");
        }
        return versions;
    }

    private void requirePreparedTargets(ResultsUpdateDataSet data, Set<String> expected) {
        Set<String> prepared = new LinkedHashSet<>();
        for (Analysis analysis : data.getModifiedAnalysis()) {
            addPrepared(prepared, analysis);
        }
        data.getNewResults().forEach(result -> addPrepared(prepared,
                result == null || result.result == null ? null : result.result.getAnalysis()));
        data.getModifiedResults().forEach(result -> addPrepared(prepared,
                result == null || result.result == null ? null : result.result.getAnalysis()));
        data.getDeletableResults()
                .forEach(result -> addPrepared(prepared, result == null ? null : result.getAnalysis()));
        data.getSavableReferralSets().forEach(referral -> {
            if (referral == null || referral.getReferral() == null)
                throw conflict("error.results.analysisMismatch");
            addPrepared(prepared, referral.getReferral().getAnalysis());
            referral.getUpdatableReferralResults().forEach(result -> {
                if (result != null && result.getResult() != null)
                    addPrepared(prepared, result.getResult().getAnalysis());
            });
        });
        if (!prepared.equals(expected))
            throw conflict("error.results.analysisMismatch");
    }

    private void addPrepared(Set<String> prepared, Analysis analysis) {
        if (analysis == null || !positive(analysis.getId()))
            throw conflict("error.results.analysisMismatch");
        prepared.add(analysis.getId());
    }

    private void verifyTargets(ResultsUpdateDataSet data, Map<String, String> expectedVersions,
            Map<String, OrdinaryResultSaveStateDAO.SpecimenState> originals, Map<String, Analysis> locked) {
        List<TestResultItem> rows = new ArrayList<>(data.getModifiedItems());
        rows.addAll(data.getAnalysisOnlyChangeResults());
        for (TestResultItem row : rows) {
            var original = originals.get(row.getAnalysisId());
            var analysis = locked.get(row.getAnalysisId());
            String persistedVersion = states.findAnalysisVersion(row.getAnalysisId());
            if (original == null || analysis == null || analysis.getTest() == null || analysis.getSampleItem() == null
                    || analysis.getSampleItem().getSample() == null
                    || !Objects.equals(original.testId(), analysis.getTest().getId())
                    || !Objects.equals(original.sampleItemId(), analysis.getSampleItem().getId())
                    || !Objects.equals(original.sampleId(), analysis.getSampleItem().getSample().getId())
                    || !Objects.equals(original.testId(), row.getTestId())
                    || !Objects.equals(original.sampleItemId(), row.getSampleItemId())
                    || !Objects.equals(analysis.getSampleItem().getSample().getAccessionNumber(),
                            row.getAccessionNumber())) {
                throw conflict("error.results.orderMismatch");
            }
            if (!Objects.equals(expectedVersions.get(row.getAnalysisId()), persistedVersion))
                throw conflict("error.results.staleSave");
        }
    }

    private void requireAuthorized(String actor, Map<String, Analysis> locked, Set<String> expected) {
        List<Analysis> permitted = users.filterAnalysesByLabUnitRoles(actor, new ArrayList<>(locked.values()),
                Constants.ROLE_RESULTS);
        Set<String> permittedIds = permitted == null ? Set.of()
                : permitted.stream().filter(Objects::nonNull).map(Analysis::getId).collect(Collectors.toSet());
        if (!permittedIds.equals(expected))
            throw forbidden();
    }

    private static boolean positive(String value) {
        return value != null && value.matches("[1-9][0-9]{0,9}");
    }

    private static void requireTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isSynchronizationActive()
                || TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                || !Integer.valueOf(java.sql.Connection.TRANSACTION_SERIALIZABLE)
                        .equals(TransactionSynchronizationManager.getCurrentTransactionIsolationLevel())) {
            throw conflict("error.results.staleSave");
        }
    }

    private static ResultSaveValidationException conflict(String code) {
        return new ResultSaveValidationException(code);
    }

    private static AccessDeniedException forbidden() {
        return new AccessDeniedException("error.notauthorized");
    }
}
