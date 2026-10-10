package org.openelisglobal.result.service.impl;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.config.EntryRecoveryTransactionManager;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.IntakeState;
import org.openelisglobal.result.dao.ResultRestrictionDAO;
import org.openelisglobal.result.dao.ResultRestrictionDAO.AnalysisFacts;
import org.openelisglobal.result.form.ResultRestrictionRequest;
import org.openelisglobal.result.form.ResultRestrictionResponse;
import org.openelisglobal.result.form.ResultRestrictionResponse.*;
import org.openelisglobal.result.service.ResultIntakeAdmission;
import org.openelisglobal.result.service.ResultRestrictionAccess;
import org.openelisglobal.result.service.ResultRestrictionAccess.Action;
import org.openelisglobal.result.service.ResultRestrictionAccess.Phase;
import org.openelisglobal.result.service.ResultRestrictionAccess.Scope;
import org.openelisglobal.result.service.ResultRestrictionException;
import org.openelisglobal.result.service.ResultRestrictionService;
import org.openelisglobal.result.service.ResultSpecimenAvailabilityService;
import org.openelisglobal.sample.service.SpecimenLookupService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Current persisted facts and an independently authorized read-only intake
 * target.
 */
@Service
public class ResultRestrictionServiceImpl implements ResultRestrictionService {
    private final ResultRestrictionDAO dao;
    private final OrdinaryResultSaveStateDAO states;
    private final ResultRestrictionAccess access;
    private final IStatusService statuses;
    private final ResultSpecimenAvailabilityService availability;
    private final SpecimenLookupService lookups;

    public ResultRestrictionServiceImpl(ResultRestrictionDAO dao, OrdinaryResultSaveStateDAO states,
            ResultRestrictionAccess access, IStatusService statuses, ResultSpecimenAvailabilityService availability,
            SpecimenLookupService lookups) {
        this.dao = dao;
        this.states = states;
        this.access = access;
        this.statuses = statuses;
        this.availability = availability;
        this.lookups = lookups;
    }

    @Override
    @Transactional(transactionManager = EntryRecoveryTransactionManager.BEAN_NAME, propagation = Propagation.REQUIRES_NEW, isolation = Isolation.REPEATABLE_READ, readOnly = true, rollbackFor = Exception.class, timeout = 20)
    public ResultRestrictionResponse inspect(ResultRestrictionRequest query, HttpServletRequest request) {
        var scope = access.bind(request, Phase.RESULTS, Action.SELECT);
        request.setAttribute("resultRestrictionCurrentUserId", scope.actor().userId());
        var source = dao.findAnalysis(query.analysisId()).orElseThrow(() -> fail(404, "NOT_FOUND"));
        requireIdentity(query, source, scope);
        var state = states.findIntakeState(source.sampleItemId());
        List<String> codes = new ArrayList<>();
        var specimenStatus = status(source.specimenStatusId(), "SAMPLE", codes);
        var analysisStatus = status(source.analysisStatusId(), "ANALYSIS", codes);
        String blocked = blockedReason(source);
        var facts = facts(source, state, codes);
        if (!Boolean.FALSE.equals(source.rejected()) || !Boolean.FALSE.equals(source.voided()))
            add(codes, "SPECIMEN_STATE_INCONSISTENT");
        if ("error.results.reviewedResultLocked".equals(blocked))
            add(codes, "ANALYSIS_ENTRY_LOCKED");
        if ("error.results.analysisEntryUnavailable".equals(blocked))
            add(codes, "ANALYSIS_STATUS_UNAVAILABLE");
        if ("error.results.statusConfigurationInvalid".equals(blocked))
            add(codes, "STATUS_CONFIGURATION_UNAVAILABLE");
        if (ResultIntakeAdmission.CHANGED.equals(blocked))
            add(codes, "INTAKE_EVIDENCE_CHANGED");
        if (ResultIntakeAdmission.TEST_CHANGED.equals(blocked))
            add(codes, "TEST_INTAKE_CHANGED");

        var handoff = handoff(request, scope, source, facts);
        requireCurrent(query, source, scope);
        requireFactsCurrent(source, state);
        access.requireUnchanged(request, scope);
        if (handoff.scope() != null)
            access.requireUnchanged(request, handoff.scope());
        if (handoff.editScope() != null)
            access.requireUnchanged(request, handoff.editScope());
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void beforeCommit(boolean readOnly) {
                requireCurrent(query, source, scope);
                requireFactsCurrent(source, state);
                if (handoff.scope() != null)
                    access.requireUnchanged(request, handoff.scope());
                if (handoff.editScope() != null)
                    access.requireUnchanged(request, handoff.editScope());
            }
        });
        var identity = new Identity(source.sampleId(), source.sampleItemId(), source.analysisId(), source.testId(),
                source.labNumber(), millis(source.analysisVersion()), wall(source.sampleVersion()),
                wall(source.itemVersion()));
        List<String> warnings = source.sampleVersion() == null || source.itemVersion() == null
                ? List.of("OWNER_VERSION_UNAVAILABLE")
                : List.of();
        return new ResultRestrictionResponse("2", scope.actor().userId(), true, query, identity, specimenStatus,
                analysisStatus, blocked, facts, List.copyOf(codes), handoff.target() != null, handoff.reason(),
                handoff.editScope() != null, handoff.editReason(), handoff.target(), handoff.lookup(), warnings);
    }

    private void requireIdentity(ResultRestrictionRequest query, AnalysisFacts source, Scope scope) {
        if (source.sectionId() == null || !scope.sectionIds().contains(source.sectionId()))
            throw denied();
        if (!Objects.equals(query.analysisId(), source.analysisId()) || !Objects.equals(query.testId(), source.testId())
                || !Objects.equals(query.sampleItemId(), source.sampleItemId())
                || !Objects.equals(query.labNumber(), source.labNumber()) || source.sampleId() == null)
            throw fail(409, "IDENTITY_CHANGED");
        if (!Objects.equals(query.analysisLastupdated(), millis(source.analysisVersion())))
            throw fail(409, "VERSION_CHANGED");
    }

    private void requireCurrent(ResultRestrictionRequest query, AnalysisFacts before, Scope scope) {
        var now = dao.findAnalysis(query.analysisId()).orElseThrow(() -> fail(409, "IDENTITY_CHANGED"));
        requireIdentity(query, now, scope);
        if (!before.equals(now))
            throw fail(409, "IDENTITY_CHANGED");
    }

    private void requireFactsCurrent(AnalysisFacts source, IntakeState before) {
        if (!Objects.equals(before, states.findIntakeState(source.sampleItemId())))
            throw fail(409, "IDENTITY_CHANGED");
    }

    private Status status(String id, String type, List<String> codes) {
        var actual = id == null ? null : dao.findStatus(id).orElse(null);
        if (actual == null) {
            add(codes, "SAMPLE".equals(type) ? "SPECIMEN_STATUS_UNKNOWN" : "ANALYSIS_STATUS_UNAVAILABLE");
            return new Status(id, type, null, null, null, false);
        }
        boolean category = type.equalsIgnoreCase(actual.type());
        if (!category)
            add(codes, "SAMPLE".equals(type) ? "SPECIMEN_STATUS_CATEGORY_MISMATCH" : "ANALYSIS_STATUS_UNAVAILABLE");
        Enum<?> semantic = category && "Y".equals(actual.isActive())
                ? ("SAMPLE".equals(type) ? statuses.getSampleStatusForID(id) : statuses.getAnalysisStatusForID(id))
                : null;
        if (semantic != null && !Objects.equals(actual.name(), persistedName(semantic)))
            semantic = null;
        if (category && semantic == null)
            add(codes, "SAMPLE".equals(type) ? "SPECIMEN_STATUS_UNKNOWN" : "ANALYSIS_STATUS_UNAVAILABLE");
        return new Status(id, type, actual.type(), semantic == null ? null : semantic.name(), actual.name(),
                semantic != null);
    }

    /**
     * The exact names already recognized by StatusService; numeric codes do not
     * imply semantics.
     */
    private String persistedName(Enum<?> semantic) {
        if (semantic instanceof org.openelisglobal.common.services.StatusService.SampleStatus sample) {
            return switch (sample) {
            case Entered -> "SampleEntered";
            case Canceled -> "SampleCanceled";
            case Disposed -> "SampleDisposed";
            case SampleRejected -> "Sample Rejected";
            };
        }
        if (semantic instanceof org.openelisglobal.common.services.StatusService.AnalysisStatus analysis) {
            return switch (analysis) {
            case NotStarted -> "Not Tested";
            case Canceled -> "Test Canceled";
            case TechnicalAcceptance -> "Technical Acceptance";
            case TechnicalRejected -> "Technical Rejected";
            case BiologistRejected -> "Biologist Rejection";
            case Finalized -> "Finalized";
            case NonConforming_depricated -> "NonConforming";
            case SampleRejected -> "Sample Rejected";
            };
        }
        return null;
    }

    private String blockedReason(AnalysisFacts row) {
        // These transient objects are only inputs to the existing read explanation.
        // They are never attached, saved, or used as acceptance evidence.
        var sample = new Sample();
        sample.setId(row.sampleId());
        var item = new SampleItem();
        item.setId(row.sampleItemId());
        item.setSample(sample);
        item.setStatusId(row.specimenStatusId());
        item.setRejected(Boolean.TRUE.equals(row.rejected()));
        item.setVoided(Boolean.TRUE.equals(row.voided()));
        var test = new org.openelisglobal.test.valueholder.Test();
        test.setId(row.testId());
        var analysis = new Analysis();
        analysis.setId(row.analysisId());
        analysis.setSampleItem(item);
        analysis.setTest(test);
        analysis.setStatusId(row.analysisStatusId());
        analysis.setReleasedDate(row.releasedDate());
        analysis.setPrintedDate(row.printedDate());
        var display = new TestResultItem();
        display.setAnalysisId(row.analysisId());
        display.setSampleItemId(row.sampleItemId());
        display.setTestId(row.testId());
        availability.explain(analysis, List.of(display));
        return display.getResultEntryBlockedReason();
    }

    private Facts facts(AnalysisFacts owner, IntakeState state, List<String> codes) {
        var tube = state == null ? null : state.tube();
        boolean linked = tube != null && Objects.equals(owner.sampleId(), tube.sampleId())
                && Objects.equals(owner.sampleItemId(), tube.itemId())
                && Objects.equals(owner.labNumber(), tube.labNo());
        var collection = date(linked ? tube.collected() : null, linked, "COLLECTION_NOT_RECORDED", codes);
        var receipt = date(linked ? tube.received() : null, linked, "RECEIPT_NOT_RECORDED", codes);
        RequestFact request;
        var requests = state == null ? null : state.requests();
        if (!linked || requests == null)
            request = new RequestFact(FactState.UNKNOWN, null, null);
        else if (requests.isEmpty()) {
            add(codes, "REQUEST_NOT_LINKED");
            request = new RequestFact(FactState.MISSING, null, null);
        } else if (requests.size() != 1) {
            add(codes, "REQUEST_LINK_AMBIGUOUS");
            request = new RequestFact(FactState.INCONSISTENT, null, null);
        } else {
            var r = requests.get(0);
            boolean valid = r != null && Objects.equals(owner.sampleId(), r.sampleId())
                    && Objects.equals(owner.sampleItemId(), r.itemId()) && Objects.equals(tube.typeId(), r.typeId())
                    && positive(r.id()) && r.status() != null;
            if (!valid) {
                add(codes, "REQUEST_LINK_INCONSISTENT");
                request = new RequestFact(FactState.INCONSISTENT, null, null);
            } else {
                request = new RequestFact(FactState.RECORDED, r.id(), r.status().name());
                if (!"COLLECTED".equals(r.status().name()))
                    add(codes, "REQUEST_NOT_COLLECTED");
            }
        }
        var patients = state == null ? null : state.patients();
        if (patients == null || patients.size() != 1 || !positive(patients.get(0)))
            add(codes, "PATIENT_ASSOCIATION_UNVERIFIED");
        AcceptanceFact acceptance;
        var decisions = state == null ? null : state.decisions();
        if (!linked || decisions == null)
            acceptance = new AcceptanceFact(FactState.UNKNOWN, null, null);
        else if (decisions.isEmpty()) {
            add(codes, "INTAKE_NOT_RECORDED");
            acceptance = new AcceptanceFact(FactState.MISSING, null, null);
        } else if (decisions.size() != 1 || decisions.get(0) == null) {
            add(codes, "INTAKE_RECORD_INCONSISTENT");
            acceptance = new AcceptanceFact(FactState.INCONSISTENT, null, null);
        } else {
            var d = decisions.get(0);
            try {
                d.validateRecord();
                if (!positive(d.getId()) || !Objects.equals(owner.sampleId(), d.getSampleId())
                        || !Objects.equals(owner.sampleItemId(), d.getSampleItemId())
                        || !Objects.equals(owner.labNumber(), d.getLabNo()) || request.id() == null
                        || !Objects.equals(request.id(), d.getRequestId()) || patients == null || patients.size() != 1
                        || !Objects.equals(patients.get(0), d.getPatientId())
                        || d.getCreatedAt().isAfter(Instant.now()))
                    throw new IllegalArgumentException("Invalid persisted intake owner");
                acceptance = new AcceptanceFact(FactState.RECORDED, d.getId(), d.getDecision().name());
            } catch (IllegalArgumentException invalid) {
                add(codes, "INTAKE_RECORD_INCONSISTENT");
                acceptance = new AcceptanceFact(FactState.INCONSISTENT, null, null);
            }
        }
        return new Facts(collection, receipt, request, acceptance);
    }

    private DateFact date(String value, boolean linked, String missing, List<String> codes) {
        if (!linked)
            return new DateFact(FactState.UNKNOWN, null);
        if (value == null) {
            add(codes, missing);
            return new DateFact(FactState.MISSING, null);
        }
        try {
            Instant.parse(value);
            return new DateFact(FactState.RECORDED, value);
        } catch (java.time.format.DateTimeParseException invalid) {
            return new DateFact(FactState.INCONSISTENT, value);
        }
    }

    private record Handoff(Scope scope, String reason, Scope editScope, String editReason, Target target,
            SpecimenLookupService.Result lookup) {
    }

    private Handoff handoff(HttpServletRequest request, Scope resultScope, AnalysisFacts source, Facts facts) {
        if (resultScope.masked())
            return unavailable("CLINICAL_DATA_MASKED");
        final Scope reception;
        try {
            reception = access.forPhase(request, resultScope, Phase.RECEPTION, Action.SELECT);
        } catch (AccessDeniedException denied) {
            return unavailable("RECEPTION_PERMISSION_REQUIRED");
        }
        if (reception.masked())
            return unavailable("CLINICAL_DATA_MASKED");
        if (facts.request().state() != FactState.RECORDED || source.sortOrder() == null)
            return unavailable("TARGET_STATE_CONFLICT");
        String code = source.labNumber() + "." + source.sortOrder();
        if (!code.matches("[A-Za-z0-9._-]{1,30}"))
            return unavailable("TARGET_UNSUPPORTED");
        final SpecimenLookupService.Result lookup;
        try {
            lookup = lookups.lookup(code, request);
        } catch (AccessDeniedException denied) {
            return unavailable("ORDER_SCOPE_DENIED");
        } catch (SpecimenLookupService.Failure failed) {
            if (failed.status() == 503)
                throw fail(503, "UNAVAILABLE");
            return unavailable(failed.status() == 404 ? "TARGET_NOT_FOUND"
                    : failed.code().equals("SPECIMEN_LOOKUP_UNSUPPORTED")
                            || failed.code().equals("SPECIMEN_LOOKUP_LEGACY_READONLY") ? "TARGET_UNSUPPORTED"
                                    : "TARGET_STATE_CONFLICT");
        }
        String rid = facts.request().id();
        if (lookup == null || lookup.version() != 1 || !lookup.readOnly() || !"specimen_lookup".equals(lookup.source())
                || !"specimen".equals(lookup.matchedKind()) || lookup.selection() == null || lookup.current() == null
                || !source.sampleId().equals(lookup.selection().sampleId())
                || !source.sampleItemId().equals(lookup.selection().sampleItemId())
                || !rid.equals(lookup.selection().requestId()) || !source.sampleId().equals(lookup.current().sampleId())
                || !source.labNumber().equals(lookup.current().labNo()) || lookup.current().physicalSpecimens() == null
                || lookup.current().requestedSpecimens() == null
                || lookup.current().physicalSpecimens().stream()
                        .filter(p -> p != null && source.sampleItemId().equals(p.id())).count() != 1
                || lookup.current().requestedSpecimens().stream().filter(p -> p != null && rid.equals(p.id()))
                        .count() != 1
                || lookup.current().physicalSpecimens().stream()
                        .filter(p -> p != null && source.sampleItemId().equals(p.id()) && rid.equals(p.requestId())
                                && code.equals(source.labNumber() + "." + p.sortOrder()))
                        .count() != 1
                || lookup.current().requestedSpecimens().stream()
                        .filter(p -> p != null && rid.equals(p.id()) && source.sampleItemId().equals(p.sampleItemId()))
                        .count() != 1)
            return unavailable("TARGET_STATE_CONFLICT");
        if (lookup.current().patientMasked())
            return unavailable("CLINICAL_DATA_MASKED");
        Scope editing = null;
        try {
            editing = access.forPhase(request, resultScope, Phase.RECEPTION, Action.UPDATE);
        } catch (AccessDeniedException readOnly) {
            /* Authorized read remains available. */ }
        return new Handoff(reception, null, editing, editing == null ? "RECEPTION_UPDATE_PERMISSION_REQUIRED" : null,
                new Target(source.sampleId(), source.sampleItemId(), rid, source.analysisId(), source.testId(),
                        source.labNumber(), code),
                lookup);
    }

    private Handoff unavailable(String reason) {
        return new Handoff(null, reason, null, reason, null, null);
    }

    private static void add(List<String> codes, String code) {
        if (!codes.contains(code))
            codes.add(code);
    }

    private static String millis(java.sql.Timestamp value) {
        return value == null ? null : Long.toString(value.getTime());
    }

    private static String wall(java.sql.Timestamp value) {
        return value == null ? null : value.toString();
    }

    private static boolean positive(String id) {
        return id != null && id.matches("[1-9][0-9]{0,9}");
    }

    private static ResultRestrictionException fail(int status, String suffix) {
        return new ResultRestrictionException(status, "RESULT_RESTRICTION_" + suffix);
    }

    private static AccessDeniedException denied() {
        return new AccessDeniedException("RESULT_RESTRICTION_DENIED");
    }
}
