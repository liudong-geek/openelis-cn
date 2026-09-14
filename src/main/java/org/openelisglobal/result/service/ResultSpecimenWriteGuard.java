package org.openelisglobal.result.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.result.action.util.ResultSet;
import org.openelisglobal.result.action.util.ResultsUpdateDataSet;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.SpecimenState;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.result.exception.ResultSaveValidationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Prevents ordinary result writes from reviving an unavailable physical tube.
 * This is not proof of clinical acceptance, result review or release authority.
 */
@Service
public class ResultSpecimenWriteGuard {
    public static final String BLOCKED = "error.results.specimenNotEligible";
    private final OrdinaryResultSaveStateDAO states;
    private final IStatusService statuses;

    public ResultSpecimenWriteGuard(OrdinaryResultSaveStateDAO states, IStatusService statuses) {
        this.states = states;
        this.statuses = statuses;
    }

    private record Owner(String testId, String itemId, String sampleId) {
    }

    public Runnable begin(ResultsUpdateDataSet data) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isSynchronizationActive()
                || TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                || !Integer.valueOf(java.sql.Connection.TRANSACTION_SERIALIZABLE)
                        .equals(TransactionSynchronizationManager.getCurrentTransactionIsolationLevel())) {
            throw blocked();
        }
        String eligible = statuses.getStatusID(SampleStatus.Entered);
        if (!positive(eligible)) {
            throw blocked();
        }
        requireStatusConfiguration(eligible);
        Map<String, Owner> owners = owners(data, eligible);
        if (owners.isEmpty())
            return () -> {
            };
        // Stable tube order, compatible with the existing receipt lock order.
        List<String> itemIds = owners.values().stream().map(Owner::itemId).distinct()
                .sorted(java.util.Comparator.comparing(java.math.BigInteger::new)).toList();
        Map<String, org.openelisglobal.sampleitem.valueholder.SampleItem> lockedItems = new TreeMap<>();
        for (String id : itemIds) {
            lockedItems.put(id, states.lockSpecimen(id));
        }
        Map<String, Analysis> lockedAnalyses = new TreeMap<>();
        owners.keySet().stream().sorted(java.util.Comparator.comparing(java.math.BigInteger::new))
                .forEach(id -> lockedAnalyses.put(id, states.lockAnalysis(id)));
        Runnable managedCheck = () -> {
            Map<String, Owner> current = new TreeMap<>();
            lockedAnalyses.forEach((id, analysis) -> {
                add(current, analysis, eligible);
                if (!id.equals(analysis.getId())) {
                    throw blocked();
                }
            });
            if (!owners.equals(current)) {
                throw blocked();
            }
            owners.values().forEach(owner -> {
                var item = lockedItems.get(owner.itemId());
                if (item == null || !owner.itemId().equals(item.getId()) || item.getSample() == null
                        || !owner.sampleId().equals(item.getSample().getId()) || item.isRejected() || item.isVoided()
                        || !eligible.equals(item.getStatusId())) {
                    throw blocked();
                }
            });
        };
        managedCheck.run();
        Map<String, SpecimenState> frozen = new TreeMap<>();
        owners.forEach((id, owner) -> frozen.put(id, verify(id, owner, eligible)));
        return () -> {
            if (!owners.equals(owners(data, eligible))
                    || !eligible.equals(statuses.getStatusID(SampleStatus.Entered))) {
                throw blocked();
            }
            managedCheck.run();
            requireStatusConfiguration(eligible);
            // Complete pending writes inside this transaction before the final scalar
            // check, including parent/request changes made by another registered updater.
            states.flush();
            owners.forEach((id, owner) -> {
                if (!frozen.get(id).equals(verify(id, owner, eligible))) {
                    throw blocked();
                }
            });
        };
    }

    private SpecimenState verify(String id, Owner owner, String eligible) {
        SpecimenState state = states.findSpecimenState(id);
        if (state == null || !id.equals(state.analysisId()) || !owner.testId().equals(state.testId())
                || !owner.itemId().equals(state.sampleItemId()) || !owner.sampleId().equals(state.sampleId())
                || !eligible.equals(state.statusId()) || !Boolean.FALSE.equals(state.rejected())
                || !Boolean.FALSE.equals(state.voided())) {
            throw blocked();
        }
        var persisted = states.findIntakeState(owner.itemId());
        String reason = ResultIntakeAdmission.reason(persisted, owner.sampleId(), owner.itemId(), id, owner.testId());
        if (reason != null)
            throw new ResultSaveValidationException(reason);
        var managed = states.managedIntakeState(owner.itemId());
        reason = ResultIntakeAdmission.reason(managed, owner.sampleId(), owner.itemId(), id, owner.testId());
        if (reason != null || !persisted.equals(managed)) {
            throw new ResultSaveValidationException(reason == null ? ResultIntakeAdmission.CHANGED : reason);
        }
        return state;
    }

    private Map<String, Owner> owners(ResultsUpdateDataSet data, String eligible) {
        if (data == null) {
            throw blocked();
        }
        Map<String, Owner> owners = new TreeMap<>();
        for (Analysis analysis : data.getModifiedAnalysis()) {
            add(owners, analysis, eligible);
        }
        List<ResultSet> results = new ArrayList<>(data.getNewResults());
        results.addAll(data.getModifiedResults());
        for (ResultSet result : results) {
            if (result == null || result.result == null || result.sample == null) {
                throw blocked();
            }
            Analysis analysis = result.result.getAnalysis();
            add(owners, analysis, eligible);
            if (!owners.get(analysis.getId()).sampleId().equals(result.sample.getId())) {
                throw blocked();
            }
        }
        for (var result : data.getDeletableResults()) {
            if (result == null) {
                throw blocked();
            }
            add(owners, result.getAnalysis(), eligible);
        }
        for (var referral : data.getSavableReferralSets()) {
            if (referral != null) {
                if (referral.getReferral() == null) {
                    throw blocked();
                }
                add(owners, referral.getReferral().getAnalysis(), eligible);
                for (var result : referral.getUpdatableReferralResults()) {
                    if (result == null) {
                        throw blocked();
                    }
                    // A new referral may legitimately have no returned result yet.
                    if (result.getResult() != null) {
                        add(owners, result.getResult().getAnalysis(), eligible);
                    }
                }
            }
        }
        List<org.openelisglobal.test.beanItems.TestResultItem> items = new ArrayList<>(data.getModifiedItems());
        items.addAll(data.getAnalysisOnlyChangeResults());
        for (var item : items) {
            if (item == null || !owners.containsKey(item.getAnalysisId())) {
                throw blocked();
            }
        }
        if (owners.isEmpty() && !data.getNoteList().isEmpty()) {
            throw blocked();
        }
        return owners;
    }

    private void add(Map<String, Owner> owners, Analysis analysis, String eligible) {
        if (analysis == null || !positive(analysis.getId()) || analysis.getTest() == null
                || !positive(analysis.getTest().getId()) || analysis.getSampleItem() == null
                || !positive(analysis.getSampleItem().getId()) || analysis.getSampleItem().getSample() == null
                || !positive(analysis.getSampleItem().getSample().getId()) || analysis.getSampleItem().isRejected()
                || analysis.getSampleItem().isVoided() || !eligible.equals(analysis.getSampleItem().getStatusId())) {
            throw blocked();
        }
        Owner owner = new Owner(analysis.getTest().getId(), analysis.getSampleItem().getId(),
                analysis.getSampleItem().getSample().getId());
        Owner previous = owners.putIfAbsent(analysis.getId(), owner);
        if (previous != null && !previous.equals(owner)) {
            throw blocked();
        }
    }

    private static boolean positive(String value) {
        return value != null && value.matches("[1-9][0-9]{0,9}");
    }

    private void requireStatusConfiguration(String eligible) {
        var ids = new java.util.HashSet<String>();
        ids.add(eligible);
        for (var status : List.of(SampleStatus.SampleRejected, SampleStatus.Canceled, SampleStatus.Disposed)) {
            String id = statuses.getStatusID(status);
            if (positive(id) && !ids.add(id))
                throw blocked();
        }
    }

    private static ResultSaveValidationException blocked() {
        return new ResultSaveValidationException(BLOCKED);
    }
}
