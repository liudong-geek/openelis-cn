package org.openelisglobal.result.service;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.Test;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.*;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.sample.form.SpecimenIntakeEvidence;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision.Decision;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;

/** Pure SIM facts. No clinical or database acceptance claim. */
public class ResultIntakeAdmissionTest {
    static final String TIME = "2026-09-01T01:02:03.123456Z";

    public static IntakeState accepted(String item, String analysis) {
        var tube = new IntakeTube(item, "301", "SIM-RESULT-301", TIME, "601", true, TIME, TIME, TIME, null, null, "H",
                "H");
        var request = new IntakeRequest("501", "301", item, "601", SampleTypeRequest.Status.COLLECTED, "401", TIME);
        var evidence = new SpecimenIntakeEvidence(1, TIME, TIME, TIME, "601", TIME, TIME,
                List.of(new SpecimenIntakeEvidence.Analysis(analysis, "401", TIME)));
        var record = SpecimenIntakeDecision.record("11111111-1111-4111-8111-111111111111", "301", "SIM-RESULT-301",
                "701", "501", item, Decision.ACCEPTED, null, evidence, "801",
                Clock.fixed(Instant.parse("2026-09-02T01:00:00Z"), ZoneOffset.UTC));
        record.setId("901");
        return new IntakeState(tube, List.of("701"), List.of(request), List.of(new IntakeTest(analysis, "401", "Y")),
                List.of(record));
    }

    public static void allow(OrdinaryResultSaveStateDAO dao, String item, String analysis) {
        var state = accepted(item, analysis);
        when(dao.findIntakeState(item)).thenReturn(state);
        when(dao.managedIntakeState(item)).thenReturn(state);
    }

    private String reason(IntakeState state) {
        return ResultIntakeAdmission.reason(state, "301", "201", "101", "401");
    }

    @Test
    public void explicitCurrentAcceptedTubePasses() {
        assertNull(reason(accepted("201", "101")));
    }

    @Test
    public void missingDecisionDoesNotMeanAccepted() {
        var s = accepted("201", "101");
        assertEquals(ResultIntakeAdmission.MISSING,
                reason(new IntakeState(s.tube(), s.patients(), s.requests(), s.tests(), List.of())));
    }

    @Test
    public void movedPatientIsNotAccepted() {
        var s = accepted("201", "101");
        assertEquals(ResultIntakeAdmission.CHANGED,
                reason(new IntakeState(s.tube(), List.of("702"), s.requests(), s.tests(), s.decisions())));
    }

    @Test
    public void duplicatePatientOrRequestIsNotAccepted() {
        var s = accepted("201", "101");
        assertEquals(ResultIntakeAdmission.CHANGED,
                reason(new IntakeState(s.tube(), List.of("701", "701"), s.requests(), s.tests(), s.decisions())));
        assertEquals(ResultIntakeAdmission.CHANGED, reason(new IntakeState(s.tube(), s.patients(),
                List.of(s.requests().get(0), s.requests().get(0)), s.tests(), s.decisions())));
    }

    @Test
    public void newReflexDoesNotBlockOriginalButCannotBorrowItsAcceptance() {
        var s = accepted("201", "101");
        var state = new IntakeState(s.tube(), s.patients(), s.requests(),
                List.of(s.tests().get(0), new IntakeTest("102", "402", "Y")), s.decisions());
        assertNull(reason(state));
        assertEquals(ResultIntakeAdmission.TEST_CHANGED,
                ResultIntakeAdmission.reason(state, "301", "201", "102", "402"));
    }

    @Test
    public void disabledTestIsNotAccepted() {
        var s = accepted("201", "101");
        assertEquals(ResultIntakeAdmission.TEST_CHANGED, reason(new IntakeState(s.tube(), s.patients(), s.requests(),
                List.of(new IntakeTest("101", "401", "N")), s.decisions())));
    }

    @Test
    public void changedRequestVersionRequiresRecheck() {
        var s = accepted("201", "101");
        var r = s.requests().get(0);
        var changed = new IntakeRequest(r.id(), r.sampleId(), r.itemId(), r.typeId(), r.status(), r.tests(),
                "2026-09-03T01:00:00Z");
        assertEquals(ResultIntakeAdmission.CHANGED,
                reason(new IntakeState(s.tube(), s.patients(), List.of(changed), s.tests(), s.decisions())));
    }

    @Test
    public void anotherTubeCannotBorrowAcceptance() {
        assertEquals(ResultIntakeAdmission.CHANGED, reason(accepted("202", "101")));
    }

    @Test
    public void clinicalDomainAndConfigurationMustBePresentAndMatch() {
        var s = accepted("201", "101");
        var t = s.tube();
        for (String[] values : new String[][] { { "E", "H" }, { "H", null }, { "H", "" }, { null, "H" } }) {
            var changed = new IntakeTube(t.itemId(), t.sampleId(), t.labNo(), t.registered(), t.typeId(), t.active(),
                    t.collected(), t.received(), t.version(), t.parentId(), t.rejectReason(), values[0], values[1]);
            assertEquals(ResultIntakeAdmission.CHANGED,
                    reason(new IntakeState(changed, s.patients(), s.requests(), s.tests(), s.decisions())));
        }
    }

    @Test
    public void typeReceiptCollectionAndTubeVersionCannotChange() {
        var s = accepted("201", "101");
        var t = s.tube();
        for (int field = 0; field < 7; field++) {
            String later = "2026-09-03T01:00:00Z";
            var changed = new IntakeTube(t.itemId(), t.sampleId(), field == 0 ? "SIM-OTHER" : t.labNo(), t.registered(),
                    field == 1 ? "602" : t.typeId(), field != 2, field == 3 ? later : t.collected(),
                    field == 4 ? later : t.received(), field == 5 ? later : t.version(), field == 6 ? "999" : null,
                    null, t.domain(), t.clinicalDomain());
            assertEquals("field " + field, ResultIntakeAdmission.CHANGED,
                    reason(new IntakeState(changed, s.patients(), s.requests(), s.tests(), s.decisions())));
        }
    }

    @Test
    public void historicalRejectionSurvivesClearedLegacyFlags() {
        var s = accepted("201", "101");
        var original = s.decisions().get(0);
        var rejected = SpecimenIntakeDecision.record(original.getOperationId(), "301", "SIM-RESULT-301", "701", "501",
                "201", Decision.REJECTED,
                new SpecimenIntakeDecision.Reason("DICTIONARY:resultRejectionReasons", "901", TIME, "模拟溶血"),
                original.evidence(), "801", Clock.fixed(Instant.parse("2026-09-02T01:00:00Z"), ZoneOffset.UTC));
        rejected.setId("902");
        assertEquals("error.results.specimenRejected",
                reason(new IntakeState(s.tube(), s.patients(), s.requests(), s.tests(), List.of(rejected))));
    }

    @Test
    public void canceledOrMovedRequestDoesNotReuseDecision() {
        var s = accepted("201", "101");
        var r = s.requests().get(0);
        for (IntakeRequest changed : List.of(
                new IntakeRequest("502", r.sampleId(), r.itemId(), r.typeId(), r.status(), r.tests(), r.version()),
                new IntakeRequest(r.id(), "302", r.itemId(), r.typeId(), r.status(), r.tests(), r.version()),
                new IntakeRequest(r.id(), r.sampleId(), r.itemId(), r.typeId(), SampleTypeRequest.Status.CANCELLED,
                        r.tests(), r.version()))) {
            assertEquals(ResultIntakeAdmission.CHANGED,
                    reason(new IntakeState(s.tube(), s.patients(), List.of(changed), s.tests(), s.decisions())));
        }
    }

    @Test
    public void badEvidenceAndDuplicateDecisionsFailClosed() {
        var s = accepted("201", "101");
        var record = s.decisions().get(0);
        assertEquals(ResultIntakeAdmission.CHANGED,
                reason(new IntakeState(s.tube(), s.patients(), s.requests(), s.tests(), List.of(record, record))));
        org.springframework.test.util.ReflectionTestUtils.setField(record, "evidenceDigest", "0".repeat(64));
        assertEquals(ResultIntakeAdmission.CHANGED, reason(s));
    }

    @Test
    public void missingOriginalAnalysisAndDuplicateAnalysisRequireRecheck() {
        var s = accepted("201", "101");
        assertEquals(ResultIntakeAdmission.TEST_CHANGED,
                reason(new IntakeState(s.tube(), s.patients(), s.requests(), List.of(), s.decisions())));
        assertEquals(ResultIntakeAdmission.CHANGED, reason(new IntakeState(s.tube(), s.patients(), s.requests(),
                List.of(s.tests().get(0), s.tests().get(0)), s.decisions())));
    }
}
