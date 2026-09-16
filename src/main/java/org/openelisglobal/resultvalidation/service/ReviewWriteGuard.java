package org.openelisglobal.resultvalidation.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;
import org.apache.commons.lang3.StringUtils;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.result.service.ResultIntakeAdmission;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.resultvalidation.bean.AnalysisItem;
import org.openelisglobal.resultvalidation.dao.ReviewSaveStateDAO;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.testresultcomponent.service.TestResultComponentService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

/** Locks and verifies clinical evidence before the first review mutation. */
@Service
public class ReviewWriteGuard {
    private final OrdinaryResultSaveStateDAO specimenStates;
    private final ReviewSaveStateDAO states;
    private final UserService users;
    private final IStatusService statuses;
    private final DefaultConfigurationProperties configuration;
    private final TestResultComponentService components;

    public ReviewWriteGuard(OrdinaryResultSaveStateDAO specimenStates, ReviewSaveStateDAO states, UserService users,
            IStatusService statuses, DefaultConfigurationProperties configuration,
            TestResultComponentService components) {
        this.specimenStates = specimenStates;
        this.states = states;
        this.users = users;
        this.statuses = statuses;
        this.configuration = configuration;
        this.components = components;
    }

    public record Locked(Map<String, Analysis> analyses, Map<String, List<Result>> results,
            Map<String, List<AnalysisItem>> decisions, Runnable verify, Runnable verifyResultsAndAccess) {
    }

    public Locked begin(String actor, List<AnalysisItem> rows) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                || !Integer.valueOf(java.sql.Connection.TRANSACTION_SERIALIZABLE)
                        .equals(TransactionSynchronizationManager.getCurrentTransactionIsolationLevel()))
            throw conflict();
        if (StringUtils.isBlank(actor) || rows == null)
            throw forbidden();
        Map<String, List<AnalysisItem>> decisions = selected(rows);
        Map<String, ReviewSaveStateDAO.AnalysisState> originals = new LinkedHashMap<>();
        for (String id : decisions.keySet()) {
            var state = states.analysis(id);
            if (state == null || !id.equals(state.id()) || !positive(state.itemId()))
                throw conflict();
            originals.put(id, state);
        }
        // All receipt/result entry flows lock tubes before analyses. Deterministic
        // ordering
        // also prevents opposing multi-tube batches from deadlocking one another.
        originals.values().stream().map(ReviewSaveStateDAO.AnalysisState::itemId).distinct().sorted(numeric())
                .forEach(specimenStates::lockSpecimen);
        Map<String, Analysis> analyses = new LinkedHashMap<>();
        Map<String, List<Result>> results = new LinkedHashMap<>();
        for (String id : decisions.keySet())
            analyses.put(id, specimenStates.lockAnalysis(id));
        for (String id : decisions.keySet())
            results.put(id, states.lockResults(id));
        Runnable verify = () -> {
            Set<String> allowed = users
                    .filterAnalysesByLabUnitRoles(actor, new ArrayList<>(analyses.values()), Constants.ROLE_VALIDATION)
                    .stream().map(Analysis::getId).collect(Collectors.toSet());
            for (String id : decisions.keySet()) {
                if (!allowed.contains(id))
                    throw forbidden();
                var state = states.analysis(id);
                if (!Objects.equals(originals.get(id), state))
                    throw conflict();
                requireReady(state);
                var analysis = analyses.get(id);
                if (analysis == null || analysis.getSampleItem() == null || analysis.getTest() == null
                        || analysis.getTestSection() == null
                        || !Objects.equals(state.sectionId(), analysis.getTestSection().getId())
                        || !Objects.equals(state.itemId(), analysis.getSampleItem().getId())
                        || !Objects.equals(state.sampleId(), analysis.getSampleItem().getSample().getId())
                        || !Objects.equals(state.testId(), analysis.getTest().getId())
                        || !Objects.equals(state.statusId(), analysis.getStatusId())
                        || analysis.getLastupdated() == null
                        || !Objects.equals(state.version(), String.valueOf(analysis.getLastupdated().getTime()))
                        || analysis.getReleasedDate() != null || analysis.getPrintedDate() != null)
                    throw conflict();
                requireSpecimen(state);
                verifyEvidence(state, decisions.get(id), results.get(id));
            }
        };
        verify.run();
        Runnable verifyResultsAndAccess = () -> {
            Set<String> allowed = users
                    .filterAnalysesByLabUnitRoles(actor, new ArrayList<>(analyses.values()), Constants.ROLE_VALIDATION)
                    .stream().map(Analysis::getId).collect(Collectors.toSet());
            for (String id : decisions.keySet()) {
                if (!allowed.contains(id))
                    throw forbidden();
                var original = originals.get(id);
                var current = states.analysis(id);
                var managed = analyses.get(id);
                if (current == null || !Objects.equals(original.testId(), current.testId())
                        || !Objects.equals(original.itemId(), current.itemId())
                        || !Objects.equals(original.sampleId(), current.sampleId())
                        || !Objects.equals(original.accession(), current.accession())
                        || !Objects.equals(original.sectionId(), current.sectionId())
                        || managed.getTestSection() == null
                        || !Objects.equals(original.sectionId(), managed.getTestSection().getId())
                        || managed.getSampleItem() == null
                        || !Objects.equals(original.itemId(), managed.getSampleItem().getId())
                        || managed.getTest() == null || !Objects.equals(original.testId(), managed.getTest().getId())
                        || managed.getSampleItem().getSample() == null
                        || !Objects.equals(original.sampleId(), managed.getSampleItem().getSample().getId())
                        || !Objects.equals(original.accession(),
                                managed.getSampleItem().getSample().getAccessionNumber())
                        || !Objects.equals(original.id(), managed.getId()))
                    throw conflict();
                requireSpecimen(original);
                verifyEvidence(original, decisions.get(id), results.get(id));
            }
        };
        return new Locked(analyses, results, decisions, verify, verifyResultsAndAccess);
    }

    /**
     * Scalar readback after flush verifies the target actually reached persistence.
     */
    public void verifyPersisted(Locked locked) {
        for (var entry : locked.analyses().entrySet()) {
            var current = states.analysis(entry.getKey());
            var managed = entry.getValue();
            if (current == null || !Objects.equals(current.statusId(), managed.getStatusId())
                    || managed.getLastupdated() == null
                    || !Objects.equals(current.version(), String.valueOf(managed.getLastupdated().getTime()))
                    || current.released() != (managed.getReleasedDate() != null)
                    || current.printed() != (managed.getPrintedDate() != null))
                throw conflict();
        }
    }

    private Map<String, List<AnalysisItem>> selected(List<AnalysisItem> rows) {
        Map<String, List<AnalysisItem>> all = new TreeMap<>(numeric());
        for (AnalysisItem row : rows) {
            if (row == null || !positive(row.getAnalysisId()))
                throw conflict();
            all.computeIfAbsent(row.getAnalysisId(), ignored -> new ArrayList<>()).add(row);
        }
        Map<String, List<AnalysisItem>> selected = new LinkedHashMap<>();
        all.forEach((id, group) -> {
            if (group.stream().noneMatch(r -> r.getIsAccepted() || r.getIsRejected()))
                return;
            boolean accepted = group.get(0).getIsAccepted();
            String note = StringUtils.trimToEmpty(group.get(0).getNote());
            for (AnalysisItem row : group) {
                if (row.isReadOnly() || !row.isShowAcceptReject() || row.getIsAccepted() == row.getIsRejected()
                        || row.getIsAccepted() != accepted || !note.equals(StringUtils.trimToEmpty(row.getNote()))
                        || row.getNote() != null && row.getNote().length() > 2000)
                    throw badRequest("Review all components of an analysis together with the same decision and note");
                if (row.getIsRejected() && note.isEmpty())
                    throw badRequest("A return reason is required");
            }
            selected.put(id, group);
        });
        if (selected.isEmpty())
            throw badRequest("Select at least one analysis to review");
        return selected;
    }

    private void requireReady(ReviewSaveStateDAO.AnalysisState state) {
        String accepted = statuses.getStatusID(AnalysisStatus.TechnicalAcceptance);
        String rejected = statuses.getStatusID(AnalysisStatus.TechnicalRejected);
        String finalized = statuses.getStatusID(AnalysisStatus.Finalized);
        String returned = statuses.getStatusID(AnalysisStatus.BiologistRejected);
        if (java.util.stream.Stream.of(accepted, rejected, finalized, returned).anyMatch(id -> !positive(id))
                || java.util.stream.Stream.of(accepted, rejected, finalized, returned).distinct().count() != 4)
            throw conflict();
        boolean allowRejected = "true".equals(configuration.getPropertyValue(
                org.openelisglobal.common.util.ConfigurationProperties.Property.VALIDATE_REJECTED_TESTS));
        if (state.released() || state.printed()
                || !(accepted.equals(state.statusId()) || allowRejected && rejected.equals(state.statusId())))
            throw conflict();
    }

    private void requireSpecimen(ReviewSaveStateDAO.AnalysisState state) {
        var specimen = specimenStates.findSpecimenState(state.id());
        var item = specimenStates.lockSpecimen(state.itemId());
        String eligible = statuses.getStatusID(SampleStatus.Entered);
        if (specimen == null || !positive(eligible) || !Objects.equals(state.testId(), specimen.testId())
                || !Objects.equals(state.itemId(), specimen.sampleItemId())
                || !Objects.equals(state.sampleId(), specimen.sampleId()) || !eligible.equals(specimen.statusId())
                || !Boolean.FALSE.equals(specimen.rejected()) || !Boolean.FALSE.equals(specimen.voided())
                || item == null || item.isRejected() || item.isVoided() || !eligible.equals(item.getStatusId()))
            throw conflict();
        var persisted = specimenStates.findIntakeState(state.itemId());
        var managed = specimenStates.managedIntakeState(state.itemId());
        if (!Objects.equals(persisted, managed) || ResultIntakeAdmission.reason(persisted, state.sampleId(),
                state.itemId(), state.id(), state.testId()) != null)
            throw conflict();
    }

    private void verifyEvidence(ReviewSaveStateDAO.AnalysisState state, List<AnalysisItem> rows, List<Result> managed) {
        Map<String, AnalysisItem.ResultMember> expected = new TreeMap<>();
        for (AnalysisItem row : rows) {
            if (!Objects.equals(state.testId(), row.getTestId())
                    || !Objects.equals(state.itemId(), row.getSampleItemId())
                    || !Objects.equals(state.sampleId(), row.getSampleId())
                    || !Objects.equals(state.accession(), row.getAccessionNumber())
                    || !Objects.equals(state.version(), row.getAnalysisLastupdated())
                    || !Objects.equals(state.statusId(), row.getStatusId()) || row.getResultMembers() == null
                    || row.getResultMembers().isEmpty())
                throw conflict();
            if (row.isHasQualifiedResult() && StringUtils.isBlank(row.getQualifiedResultValue()))
                throw badRequest("Required result details are missing");
            for (var member : row.getResultMembers()) {
                if (member == null || !positive(member.resultId()) || member.lastupdated() == null
                        || member.parentResultId() == null && StringUtils.isBlank(member.rawResultValue())
                        || expected.putIfAbsent(member.resultId(), member) != null)
                    throw conflict();
            }
        }
        var current = states.members(state.id());
        if (managed == null || current.size() != expected.size() || managed.size() != expected.size())
            throw conflict();
        var primary = components.getActiveComponentsByTestId(state.testId());
        String primaryId = primary == null || primary.isEmpty() ? null
                : primary.stream().filter(c -> Boolean.TRUE.equals(c.getIsPrimary())).findFirst().orElse(primary.get(0))
                        .getId();
        Map<String, ReviewSaveStateDAO.Member> currentById = current.stream()
                .collect(Collectors.toMap(ReviewSaveStateDAO.Member::id, m -> m));
        Map<String, Result> managedById = managed.stream().collect(Collectors.toMap(Result::getId, r -> r));
        for (var member : current) {
            var parent = member.parentId() == null ? member : currentById.get(member.parentId());
            if (parent == null)
                throw conflict();
            String component = StringUtils.isBlank(parent.component()) ? primaryId : parent.component();
            var actual = new AnalysisItem.ResultMember(member.id(), member.value(), member.type(), component,
                    member.parentId(), member.grouping(), member.version());
            var entity = managedById.get(member.id());
            if (!actual.equals(expected.get(member.id())) || entity == null
                    || !Objects.equals(member.value(), entity.getValue())
                    || !Objects.equals(member.type(), entity.getResultType()) || entity.getLastupdated() == null
                    || !member.version().equals(entity.getLastupdated().toInstant().toString())
                    || entity.getAnalysis() == null || !Objects.equals(state.id(), entity.getAnalysis().getId())
                    || !Objects.equals(member.component(),
                            entity.getTestResult() == null ? null : entity.getTestResult().getComponentId())
                    || !Objects.equals(member.parentId(),
                            entity.getParentResult() == null ? null : entity.getParentResult().getId())
                    || member.grouping() != entity.getGrouping())
                throw conflict();
        }
    }

    private static boolean positive(String id) {
        return id != null && id.matches("[1-9][0-9]{0,9}");
    }

    private static Comparator<String> numeric() {
        return Comparator.comparing(java.math.BigInteger::new);
    }

    static ResponseStatusException conflict() {
        return new ResponseStatusException(HttpStatus.CONFLICT, "Review evidence changed; search again");
    }

    static ResponseStatusException forbidden() {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, "Review permission changed; search again");
    }

    static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
