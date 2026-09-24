package org.openelisglobal.sample.service;

import static org.junit.Assert.*;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.TimeZone;
import org.junit.Test;
import org.openelisglobal.sample.form.SpecimenIntakeEvidence;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision.Decision;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision.Reason;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Contract-only SIM tests. No persistence or acceptance permission is granted.
 */
public class SpecimenIntakeDecisionTest {
    static final String TIME = "2026-09-14T04:00:00Z";
    static final String OPERATION = "b945a9d1-26bc-4a68-94ed-68229507c751";
    static final Clock CLOCK = Clock.fixed(Instant.parse("2026-09-14T04:01:00.123456Z"), ZoneOffset.UTC);

    public static SpecimenIntakeEvidence evidence() {
        return new SpecimenIntakeEvidence(1, TIME, TIME, TIME, "31", TIME, TIME,
                List.of(new SpecimenIntakeEvidence.Analysis("901", "41", TIME)));
    }

    @Test
    public void wallClockAndInstantColumnsDoNotGainASecondShanghaiOffset() {
        TimeZone original = TimeZone.getDefault();
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("Asia/Shanghai"));
            String instant = "2026-09-14T04:00:00.123456Z";
            Timestamp wallClock = Timestamp.valueOf(LocalDateTime.parse("2026-09-14T12:00:00.123456"));
            assertEquals(instant, SpecimenIntakeEvidence.wallClockTime(wallClock));
            assertEquals(instant,
                    SpecimenIntakeEvidence.wallClockTime(SpecimenIntakeEvidence.wallClockTimestamp(instant)));
            assertEquals(instant, SpecimenIntakeEvidence.instantTime(Timestamp.from(Instant.parse(instant))));
        } finally {
            TimeZone.setDefault(original);
        }
    }

    public static SpecimenIntakeDecision row(String item, Decision decision) {
        var value = SpecimenIntakeDecision.record(OPERATION, "301", "SIM-INTAKE", "601", "701", item, decision,
                decision == Decision.REJECTED ? reason() : null, evidence(), "7", CLOCK);
        value.setId("101");
        return value;
    }

    static Reason reason() {
        return new Reason("DICTIONARY:resultRejectionReasons", "51", TIME, "模拟：容器不符");
    }

    @Test
    public void storesExplicitDecisionAndServerProvenanceWithoutGrantingAnything() {
        var row = row("801", Decision.ACCEPTED);
        row.validateRecord();
        assertEquals("101", row.getStringId());
        assertEquals("301", row.getSampleId());
        assertEquals("601", row.getPatientId());
        assertEquals("701", row.getRequestId());
        assertEquals("801", row.getSampleItemId());
        assertEquals("7", row.getCreatedBy());
        assertEquals("2026-09-14T04:01:00.123Z", row.getCreatedAt().toString());
        assertEquals(Decision.ACCEPTED, row.getDecision());
        assertNull(row.reason());
        assertEquals(evidence(), row.evidence());
    }

    @Test
    public void rejectionRequiresFrozenReasonWithAnExplicitSource() {
        var row = row("801", Decision.REJECTED);
        assertEquals(reason(), row.reason());
        assertThrows(IllegalArgumentException.class, () -> SpecimenIntakeDecision.record(OPERATION, "301", "SIM-INTAKE",
                "601", "701", "801", Decision.REJECTED, null, evidence(), "7", CLOCK));
        assertThrows(IllegalArgumentException.class, () -> SpecimenIntakeDecision.record(OPERATION, "301", "SIM-INTAKE",
                "601", "701", "801", Decision.ACCEPTED, reason(), evidence(), "7", CLOCK));
    }

    @Test
    public void ambiguousLegacyReasonAndInvalidDecisionCannotBeClaimed() {
        for (String source : List.of("51", "dictionary", "", "QA")) {
            assertThrows(IllegalArgumentException.class, () -> new Reason(source, "51", TIME, "模拟原因"));
        }
        assertThrows(IllegalArgumentException.class, () -> new Reason("QA_EVENT", "51", TIME, " "));
        assertThrows(IllegalArgumentException.class, () -> SpecimenIntakeDecision.record(OPERATION, "301", "SIM-INTAKE",
                "601", "701", "801", null, null, evidence(), "7", CLOCK));
    }

    @Test
    public void identifiersHaveTheSamePositiveIntegerRangeAsExistingAudit() {
        for (String id : List.of("0", "-1", "01", "2147483648", "1.0", "1 OR 1=1")) {
            assertThrows(id, IllegalArgumentException.class, () -> SpecimenIntakeDecision.record(OPERATION, id,
                    "SIM-INTAKE", "601", "701", "801", Decision.ACCEPTED, null, evidence(), "7", CLOCK));
        }
        assertThrows(IllegalArgumentException.class, () -> SpecimenIntakeDecision.record("1-1-1-1-1", "301",
                "SIM-INTAKE", "601", "701", "801", Decision.ACCEPTED, null, evidence(), "7", CLOCK));
    }

    @Test
    public void recordAndEvidenceCannotBeSilentlyRewritten() {
        var row = row("801", Decision.REJECTED);
        assertThrows(IllegalStateException.class, () -> row.setId("102"));
        assertThrows(IllegalStateException.class, row::denyMutation);
        ReflectionTestUtils.setField(row, "evidenceJson", row.getEvidenceJson().replace("\"41\"", "\"42\""));
        assertThrows(IllegalArgumentException.class, row::validateRecord);
    }

    @Test
    public void evidenceIsDefensiveCanonicalAndKeepsMicrosecondVersions() {
        var list = new ArrayList<>(List.of(new SpecimenIntakeEvidence.Analysis("902", "42", TIME),
                new SpecimenIntakeEvidence.Analysis("901", "41", TIME)));
        var value = new SpecimenIntakeEvidence(1, TIME, TIME, "2026-09-14T04:00:00.123456Z", "31", TIME, TIME, list);
        list.clear();
        assertEquals(2, value.analyses().size());
        assertEquals("901", value.analyses().get(0).id());
        assertThrows(UnsupportedOperationException.class, () -> value.analyses().clear());
        assertEquals(value, SpecimenIntakeEvidence.decode(value.encode()));
        assertEquals("2026-09-14T04:00:00.123456Z", value.itemVersion());
    }

    @Test
    public void malformedOrExtraEvidenceNeverBecomesAValidDecision() {
        String json = evidence().encode();
        for (String value : List.of(json + " {}", json.replace("\"schema\":1", "\"schema\":2"),
                json.replace("\"schema\":1", "\"schema\":1,\"schema\":1"),
                json.replace("\"schema\":1", "\"schema\":1,\"accepted\":true"), json.replace("\"31\"", "31"),
                json.replace(TIME, "2026-02-30T04:00:00Z"))) {
            assertThrows(value, IllegalArgumentException.class, () -> SpecimenIntakeEvidence.decode(value));
        }
    }

    @Test
    public void duplicateAnalysesOrImpossibleReceiptTimesAreRejected() {
        assertThrows(IllegalArgumentException.class,
                () -> new SpecimenIntakeEvidence(1, TIME, TIME, TIME, "31", TIME, TIME,
                        List.of(new SpecimenIntakeEvidence.Analysis("901", "41", TIME),
                                new SpecimenIntakeEvidence.Analysis("901", "42", TIME))));
        assertThrows(IllegalArgumentException.class, () -> new SpecimenIntakeEvidence(1, TIME, TIME, TIME, "31",
                "2026-09-14T05:00:00Z", TIME, List.of(new SpecimenIntakeEvidence.Analysis("901", "41", TIME))));
        assertThrows(IllegalArgumentException.class,
                () -> SpecimenIntakeDecision.record(OPERATION, "301", "SIM-INTAKE", "601", "701", "801",
                        Decision.ACCEPTED, null, evidence(), "7",
                        Clock.fixed(Instant.parse("2026-09-14T03:59:00Z"), ZoneOffset.UTC)));
    }

    @Test
    public void purportedPriorFactsAndReasonCannotBeFromAfterTheDecision() {
        String future = "2026-09-14T05:00:00Z";
        for (var facts : List.of(
                new SpecimenIntakeEvidence(1, future, TIME, TIME, "31", TIME, TIME, evidence().analyses()),
                new SpecimenIntakeEvidence(1, TIME, future, TIME, "31", TIME, TIME, evidence().analyses()),
                new SpecimenIntakeEvidence(1, TIME, TIME, future, "31", TIME, TIME, evidence().analyses()),
                new SpecimenIntakeEvidence(1, TIME, TIME, TIME, "31", TIME, TIME,
                        List.of(new SpecimenIntakeEvidence.Analysis("901", "41", future))))) {
            assertThrows(IllegalArgumentException.class, () -> SpecimenIntakeDecision.record(OPERATION, "301",
                    "SIM-INTAKE", "601", "701", "801", Decision.ACCEPTED, null, facts, "7", CLOCK));
        }
        assertThrows(IllegalArgumentException.class,
                () -> SpecimenIntakeDecision.record(OPERATION, "301", "SIM-INTAKE", "601", "701", "801",
                        Decision.REJECTED, new Reason("QA_EVENT", "51", future, "模拟拒收"), evidence(), "7", CLOCK));
    }
}
