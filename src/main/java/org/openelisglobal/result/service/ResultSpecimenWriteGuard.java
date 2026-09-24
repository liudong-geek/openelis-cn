package org.openelisglobal.result.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.atomic.AtomicReference;
import org.openelisglobal.analysis.service.AnalysisServiceImpl;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.result.action.util.ResultSet;
import org.openelisglobal.result.action.util.ResultsUpdateDataSet;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.SpecimenState;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.State;
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

    private record NoteOwner(String tableId, String analysisId) {
    }

    private static void requireTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isSynchronizationActive()
                || TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                || !Integer.valueOf(java.sql.Connection.TRANSACTION_SERIALIZABLE)
                        .equals(TransactionSynchronizationManager.getCurrentTransactionIsolationLevel())) {
            throw blocked();
        }
    }

    /** Discover and lock the original graph without flushing any entity changes. */
    Analysis lockForEntry(String analysisId) {
        requireTransaction();
        if (!positive(analysisId))
            throw new ResultSaveValidationException("error.results.analysisMismatch");
        var original = states.findSpecimenState(analysisId);
        if (original == null)
            return null;
        if (!analysisId.equals(original.analysisId()) || !positive(original.sampleItemId()))
            throw blocked();
        states.lockSpecimen(original.sampleItemId());
        return states.lockAnalysis(analysisId);
    }

    public Runnable begin(ResultsUpdateDataSet data) {
        return begin(data, null);
    }

    /**
     * The three case-report services publish their report and result in one
     * transaction. They deliberately target Finalized/released analyses, so they
     * use this explicit path while retaining the ordinary specimen and ownership
     * checks.
     */
    public Runnable beginSpecialtyRelease(ResultsUpdateDataSet data, SpecialtyResultRelease release) {
        if (release == null) {
            throw blocked();
        }
        return begin(data, release);
    }

    private Runnable begin(ResultsUpdateDataSet data, SpecialtyResultRelease specialtyRelease) {
        requireTransaction();
        String eligible = statuses.getStatusID(SampleStatus.Entered);
        if (!positive(eligible)) {
            throw blocked();
        }
        requireStatusConfiguration(eligible);
        OrdinaryResultReviewPolicy review = OrdinaryResultReviewPolicy.read(statuses);
        var rejecting = explicitRejections(data);
        if (specialtyRelease != null && !rejecting.isEmpty()) {
            throw blocked();
        }
        var specialtyOwner = specialtyRelease == null ? null : specialtyOwner(specialtyRelease);
        Map<String, Owner> owners = owners(data, eligible, review, rejecting, specialtyRelease);
        List<NoteOwner> noteOwners = noteOwners(data, owners.keySet());
        if (specialtyRelease != null && owners.isEmpty()) {
            throw blocked();
        }
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
                // A specialty batch carries detached analyses already changed to its
                // required release target. The locked entities are the persisted source
                // state and therefore must not be required to be released before the
                // write occurs. Ordinary result entry keeps its existing source/target
                // policy checks. The flushed scalar check below proves the specialty
                // target was actually persisted.
                add(current, analysis, eligible, review, rejecting, specialtyRelease, false);
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
        owners.forEach((id, owner) -> {
            frozen.put(id, verify(id, owner, eligible));
            var original = states.findState(id);
            if (original == null || !id.equals(original.analysisId()))
                throw new ResultSaveValidationException(OrdinaryResultReviewPolicy.UNAVAILABLE);
            OrdinaryResultReviewPolicy.require(review.sourceReason(original));
        });
        // Audited updates may evict the locked Analysis and merge a replacement.
        // Freeze the intended write-set state at the first final check instead of
        // retaining an entity instance that may no longer be managed.
        var frozenTargets = new AtomicReference<Map<String, State>>();
        return () -> {
            if (!review.sameConfiguration(OrdinaryResultReviewPolicy.read(statuses)))
                throw new ResultSaveValidationException(OrdinaryResultReviewPolicy.CONFIGURATION);
            if (!rejecting.equals(explicitRejections(data)))
                throw new ResultSaveValidationException(OrdinaryResultReviewPolicy.UNAVAILABLE);
            if (!owners.equals(owners(data, eligible, review, rejecting, specialtyRelease))
                    || !eligible.equals(statuses.getStatusID(SampleStatus.Entered))) {
                throw blocked();
            }
            if (!noteOwners.equals(noteOwners(data, owners.keySet()))) {
                throw new ResultSaveValidationException(OrdinaryResultReviewPolicy.UNAVAILABLE);
            }
            managedCheck.run();
            requireStatusConfiguration(eligible);
            Map<String, State> currentTargets = targetStates(data, owners.keySet());
            Map<String, State> expectedTargets = frozenTargets.get();
            if (expectedTargets == null) {
                frozenTargets.compareAndSet(null, currentTargets);
                expectedTargets = frozenTargets.get();
            }
            if (!expectedTargets.equals(currentTargets))
                throw new ResultSaveValidationException(OrdinaryResultReviewPolicy.UNAVAILABLE);
            Map<String, State> targetsToVerify = expectedTargets;
            // Complete pending writes inside this transaction before the final scalar
            // check, including parent/request changes made by another registered updater.
            states.flush();
            owners.forEach((id, owner) -> {
                if (!frozen.get(id).equals(verify(id, owner, eligible))) {
                    throw blocked();
                }
                var persisted = states.findState(id);
                if (specialtyRelease == null) {
                    OrdinaryResultReviewPolicy.require(review.targetReason(persisted, rejecting.contains(id)));
                } else {
                    requireSpecialtyTarget(persisted);
                }
                if (!id.equals(persisted.analysisId()) || !persisted.equals(targetsToVerify.get(id)))
                    throw new ResultSaveValidationException(OrdinaryResultReviewPolicy.UNAVAILABLE);
            });
            if (specialtyRelease != null) {
                var persistedOwner = specialtyOwner(specialtyRelease);
                if (!specialtyOwner.ownerId().equals(persistedOwner.ownerId())
                        || !specialtyOwner.sampleId().equals(persistedOwner.sampleId())
                        || !"COMPLETED".equals(persistedOwner.status())) {
                    throw blocked();
                }
            }
        };
    }

    /**
     * Result-entry notes are analysis notes and may only target this locked batch.
     */
    private List<NoteOwner> noteOwners(ResultsUpdateDataSet data, Set<String> analysisIds) {
        String analysisTableId = AnalysisServiceImpl.getTableReferenceId();
        List<NoteOwner> bindings = new ArrayList<>();
        for (var note : data.getNoteList()) {
            if (note == null || analysisTableId == null || !analysisTableId.equals(note.getReferenceTableId())
                    || !positive(note.getReferenceId()) || !analysisIds.contains(note.getReferenceId())) {
                throw identityMismatch();
            }
            bindings.add(new NoteOwner(note.getReferenceTableId(), note.getReferenceId()));
        }
        return List.copyOf(bindings);
    }

    /** Validate result classification and persisted owner before any write. */
    void validateResultIdentities(ResultsUpdateDataSet data) {
        if (data == null) {
            throw identityMismatch();
        }
        Set<String> existingIds = new java.util.HashSet<>();
        for (ResultSet resultSet : data.getNewResults()) {
            if (resultSet == null || resultSet.result == null || resultSet.result.getId() != null) {
                throw identityMismatch();
            }
            targetOwner(resultSet.result);
        }
        for (ResultSet resultSet : data.getModifiedResults()) {
            if (resultSet == null || resultSet.result == null) {
                throw identityMismatch();
            }
            validateExistingResult(resultSet.result, existingIds);
        }
        for (var result : data.getDeletableResults()) {
            if (result == null) {
                throw identityMismatch();
            }
            validateExistingResult(result, existingIds);
        }
    }

    void requireInsertedResultIdentity(org.openelisglobal.result.valueholder.Result result, String insertedId) {
        if (!positive(insertedId) || result == null || !insertedId.equals(result.getId())) {
            throw identityMismatch();
        }
    }

    private void validateExistingResult(org.openelisglobal.result.valueholder.Result result, Set<String> ids) {
        if (!positive(result.getId()) || !ids.add(result.getId())) {
            throw identityMismatch();
        }
        var persisted = states.findResultOwnerState(result.getId());
        if (persisted == null || !persisted.equals(targetOwner(result))) {
            throw identityMismatch();
        }
    }

    private org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.ResultOwnerState targetOwner(
            org.openelisglobal.result.valueholder.Result result) {
        Analysis analysis = result.getAnalysis();
        if (analysis == null || !positive(analysis.getId()) || analysis.getTest() == null
                || !positive(analysis.getTest().getId()) || analysis.getSampleItem() == null
                || !positive(analysis.getSampleItem().getId()) || analysis.getSampleItem().getSample() == null
                || !positive(analysis.getSampleItem().getSample().getId())) {
            throw identityMismatch();
        }
        return new org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.ResultOwnerState(result.getId(),
                analysis.getId(), analysis.getTest().getId(), analysis.getSampleItem().getId(),
                analysis.getSampleItem().getSample().getId());
    }

    private org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.SpecialtyOwnerState specialtyOwner(
            SpecialtyResultRelease release) {
        var owner = switch (release.kind()) {
        case PATHOLOGY -> states.findPathologyOwnerState(release.ownerId());
        case CYTOLOGY -> states.findCytologyOwnerState(release.ownerId());
        case IMMUNOHISTOCHEMISTRY -> states.findImmunohistochemistryOwnerState(release.ownerId());
        };
        if (owner == null || !release.ownerId().equals(owner.ownerId())
                || !release.sampleId().equals(owner.sampleId())) {
            throw blocked();
        }
        return owner;
    }

    private void requireSpecialtyTarget(State state) {
        String finalized = statuses.getStatusID(AnalysisStatus.Finalized);
        if (state == null || !positive(finalized) || !finalized.equals(state.statusId())
                || state.releasedDate() == null) {
            throw blocked();
        }
    }

    /** Snapshot every Analysis object that contributes to this write batch. */
    private Map<String, State> targetStates(ResultsUpdateDataSet data, Set<String> expectedIds) {
        Map<String, State> targets = new TreeMap<>();
        data.getModifiedAnalysis().forEach(a -> addTarget(targets, a));
        List<ResultSet> results = new ArrayList<>(data.getNewResults());
        results.addAll(data.getModifiedResults());
        results.forEach(r -> {
            if (r == null || r.result == null)
                throw blocked();
            addTarget(targets, r.result.getAnalysis());
        });
        data.getDeletableResults().forEach(r -> {
            if (r == null)
                throw blocked();
            addTarget(targets, r.getAnalysis());
        });
        data.getSavableReferralSets().forEach(set -> {
            if (set != null) {
                if (set.getReferral() == null)
                    throw blocked();
                addTarget(targets, set.getReferral().getAnalysis());
                set.getUpdatableReferralResults().forEach(r -> {
                    if (r != null && r.getResult() != null)
                        addTarget(targets, r.getResult().getAnalysis());
                });
            }
        });
        if (!targets.keySet().equals(expectedIds))
            throw blocked();
        return Map.copyOf(targets);
    }

    private void addTarget(Map<String, State> targets, Analysis analysis) {
        if (analysis == null || !positive(analysis.getId()))
            throw blocked();
        State target = snapshot(analysis);
        State previous = targets.putIfAbsent(analysis.getId(), target);
        if (previous != null && !previous.equals(target))
            throw new ResultSaveValidationException(OrdinaryResultReviewPolicy.UNAVAILABLE);
    }

    private State snapshot(Analysis analysis) {
        var released = analysis.getReleasedDate();
        java.sql.Timestamp releasedCopy = null;
        if (released != null) {
            releasedCopy = new java.sql.Timestamp(released.getTime());
            releasedCopy.setNanos(released.getNanos());
        }
        var printed = analysis.getPrintedDate();
        java.util.Date printedCopy = printed == null ? null : new java.util.Date(printed.getTime());
        return new State(analysis.getId(), analysis.getStatusId(), releasedCopy, printedCopy);
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

    private Map<String, Owner> owners(ResultsUpdateDataSet data, String eligible, OrdinaryResultReviewPolicy review,
            java.util.Set<String> rejecting, SpecialtyResultRelease specialtyRelease) {
        if (data == null) {
            throw blocked();
        }
        Map<String, Owner> owners = new TreeMap<>();
        for (Analysis analysis : data.getModifiedAnalysis()) {
            add(owners, analysis, eligible, review, rejecting, specialtyRelease);
        }
        List<ResultSet> results = new ArrayList<>(data.getNewResults());
        results.addAll(data.getModifiedResults());
        for (ResultSet result : results) {
            if (result == null || result.result == null || result.sample == null) {
                throw blocked();
            }
            Analysis analysis = result.result.getAnalysis();
            add(owners, analysis, eligible, review, rejecting, specialtyRelease);
            if (!owners.get(analysis.getId()).sampleId().equals(result.sample.getId())) {
                throw blocked();
            }
        }
        for (var result : data.getDeletableResults()) {
            if (result == null) {
                throw blocked();
            }
            add(owners, result.getAnalysis(), eligible, review, rejecting, specialtyRelease);
        }
        for (var referral : data.getSavableReferralSets()) {
            if (referral != null) {
                if (referral.getReferral() == null) {
                    throw blocked();
                }
                add(owners, referral.getReferral().getAnalysis(), eligible, review, rejecting, specialtyRelease);
                for (var result : referral.getUpdatableReferralResults()) {
                    if (result == null) {
                        throw blocked();
                    }
                    // A new referral may legitimately have no returned result yet.
                    if (result.getResult() != null) {
                        add(owners, result.getResult().getAnalysis(), eligible, review, rejecting, specialtyRelease);
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

    private void add(Map<String, Owner> owners, Analysis analysis, String eligible, OrdinaryResultReviewPolicy review,
            java.util.Set<String> rejecting, SpecialtyResultRelease specialtyRelease) {
        add(owners, analysis, eligible, review, rejecting, specialtyRelease, true);
    }

    private void add(Map<String, Owner> owners, Analysis analysis, String eligible, OrdinaryResultReviewPolicy review,
            java.util.Set<String> rejecting, SpecialtyResultRelease specialtyRelease,
            boolean requireSubmittedSpecialtyTarget) {
        if (analysis == null || !positive(analysis.getId()) || analysis.getTest() == null
                || !positive(analysis.getTest().getId()) || analysis.getSampleItem() == null
                || !positive(analysis.getSampleItem().getId()) || analysis.getSampleItem().getSample() == null
                || !positive(analysis.getSampleItem().getSample().getId()) || analysis.getSampleItem().isRejected()
                || analysis.getSampleItem().isVoided() || !eligible.equals(analysis.getSampleItem().getStatusId())) {
            throw blocked();
        }
        if (specialtyRelease == null) {
            OrdinaryResultReviewPolicy.require(review.targetReason(OrdinaryResultReviewPolicy.state(analysis),
                    rejecting.contains(analysis.getId())));
        } else {
            if (requireSubmittedSpecialtyTarget) {
                requireSpecialtyTarget(OrdinaryResultReviewPolicy.state(analysis));
            } else {
                OrdinaryResultReviewPolicy.require(review.sourceReason(OrdinaryResultReviewPolicy.state(analysis)));
            }
            if (!specialtyRelease.sampleId().equals(analysis.getSampleItem().getSample().getId())) {
                throw blocked();
            }
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

    private static java.util.Set<String> explicitRejections(ResultsUpdateDataSet data) {
        if (data == null)
            throw blocked();
        Map<String, Boolean> decisions = new TreeMap<>();
        for (var item : data.getModifiedItems()) {
            if (item == null || !positive(item.getAnalysisId()))
                throw blocked();
            Boolean previous = decisions.putIfAbsent(item.getAnalysisId(), item.isShadowRejected());
            if (previous != null && previous != item.isShadowRejected())
                throw new ResultSaveValidationException(OrdinaryResultReviewPolicy.UNAVAILABLE);
        }
        return decisions.entrySet().stream().filter(Map.Entry::getValue).map(Map.Entry::getKey)
                .collect(java.util.stream.Collectors.toUnmodifiableSet());
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

    private static ResultSaveValidationException identityMismatch() {
        return new ResultSaveValidationException("error.results.analysisMismatch");
    }
}
