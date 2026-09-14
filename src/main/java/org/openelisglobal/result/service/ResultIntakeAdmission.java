package org.openelisglobal.result.service;

import java.time.Instant;
import java.util.HashSet;
import java.util.Objects;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.IntakeState;
import org.openelisglobal.sample.form.SpecimenIntakeEvidence;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision.Decision;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;

/**
 * Current result-entry prerequisite, not report approval or a replacement
 * intake record.
 */
public final class ResultIntakeAdmission {
    public static final String MISSING = "error.results.specimenIntakeMissing";
    public static final String CHANGED = "error.results.specimenIntakeChanged";
    public static final String TEST_CHANGED = "error.results.testIntakeChanged";

    private ResultIntakeAdmission() {
    }

    public static String reason(IntakeState state, String sampleId, String itemId, String analysisId, String testId) {
        try {
            if (state == null || state.tube() == null || state.decisions() == null)
                return CHANGED;
            var tube = state.tube();
            if (!Objects.equals(itemId, tube.itemId()) || !Objects.equals(sampleId, tube.sampleId())
                    || state.patients() == null || state.patients().size() != 1 || state.requests() == null
                    || state.requests().size() != 1)
                return CHANGED;
            var request = state.requests().get(0);
            if (request == null || !sampleId.equals(request.sampleId()) || !itemId.equals(request.itemId())
                    || request.status() != SampleTypeRequest.Status.COLLECTED
                    || !Objects.equals(tube.typeId(), request.typeId()) || tube.parentId() != null
                    || !Boolean.TRUE.equals(tube.active()) || tube.registered() == null || tube.labNo() == null
                    || tube.labNo().isBlank() || tube.clinicalDomain() == null || tube.clinicalDomain().isBlank()
                    || !tube.clinicalDomain().equals(tube.domain())
                    || SpecimenIntakeEvidence.time(tube.registered()).isAfter(Instant.now()))
                return CHANGED;
            var patient = SpecimenIntakeEvidence.requireId(state.patients().get(0));
            SpecimenIntakeEvidence.requireId(tube.typeId());
            SpecimenIntakeEvidence.requireId(request.id());
            if (state.decisions().isEmpty())
                return MISSING;
            if (state.decisions().size() != 1 || state.decisions().get(0) == null)
                return CHANGED;
            var decision = state.decisions().get(0);
            decision.validateRecord();
            if (decision.getId() == null || decision.getCreatedAt().isAfter(Instant.now())
                    || !sampleId.equals(decision.getSampleId()) || !itemId.equals(decision.getSampleItemId())
                    || !patient.equals(decision.getPatientId()) || !tube.labNo().equals(decision.getLabNo())
                    || !request.id().equals(decision.getRequestId()))
                return CHANGED;
            if (decision.getDecision() == Decision.REJECTED)
                return "error.results.specimenRejected";
            var evidence = decision.evidence();
            // Result saves legitimately advance Sample/Analysis versions. Only the original
            // tube, receipt and collection request must still match the accepted facts.
            if (!Objects.equals(tube.typeId(), evidence.typeOfSampleId())
                    || !sameTime(tube.version(), evidence.itemVersion())
                    || !sameTime(request.version(), evidence.requestVersion())
                    || !sameTime(tube.collected(), evidence.collectionDate())
                    || !sameTime(tube.received(), evidence.receivedDate()) || tube.rejectReason() != null)
                return CHANGED;
            var planned = new HashSet<String>();
            if (request.tests() == null)
                return CHANGED;
            for (var id : request.tests().split(",", -1)) {
                if (!planned.add(SpecimenIntakeEvidence.requireId(id.trim())))
                    return CHANGED;
            }
            var covered = new HashSet<String>();
            evidence.analyses().forEach(a -> covered.add(a.testId()));
            if (!covered.containsAll(planned) || state.tests() == null || state.tests().size() > 5000)
                return CHANGED;
            var currentIds = new HashSet<String>();
            for (var current : state.tests()) {
                if (current == null || !currentIds.add(SpecimenIntakeEvidence.requireId(current.id())))
                    return CHANGED;
            }
            // New reflex/calculated analyses may be created by the same result save, but
            // they never inherit the old decision as authority to enter their own results.
            var current = state.tests().stream().filter(a -> analysisId.equals(a.id())).toList();
            if (current.size() != 1 || !testId.equals(current.get(0).testId()) || !"Y".equals(current.get(0).active())
                    || evidence.analyses().stream()
                            .noneMatch(a -> analysisId.equals(a.id()) && testId.equals(a.testId())))
                return TEST_CHANGED;
            for (var accepted : evidence.analyses()) {
                if (state.tests().stream()
                        .noneMatch(a -> accepted.id().equals(a.id()) && accepted.testId().equals(a.testId())))
                    return CHANGED;
            }
            return null;
        } catch (IllegalArgumentException | NullPointerException invalid) {
            return CHANGED;
        }
    }

    private static boolean sameTime(String actual, String expected) {
        return SpecimenIntakeEvidence.time(expected).equals(SpecimenIntakeEvidence.time(actual));
    }
}
