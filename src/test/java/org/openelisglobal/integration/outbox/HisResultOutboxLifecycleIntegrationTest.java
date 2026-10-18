package org.openelisglobal.integration.outbox;

import static org.junit.Assert.*;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Real repository predicates and commit boundaries, without a live recipient or
 * report-signing fixture.
 */
public class HisResultOutboxLifecycleIntegrationTest extends BaseWebContextSensitiveTest {
    @Autowired
    private HisResultOutboxService outbox;
    @Autowired
    private DataSource lifecycleDataSource;
    @Autowired
    private PlatformTransactionManager transactionManager;

    private JdbcTemplate lifecycleJdbc;
    private String fixturePrefix;
    private Long releaseId;
    private int sequence;
    private final List<Long> fixtureIds = new ArrayList<>();
    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-10-18T00:00:00Z");

    @Before
    public void prepareLifecycleFixture() {
        assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
        assertTrue(AopUtils.isAopProxy(outbox));
        lifecycleJdbc = new JdbcTemplate(lifecycleDataSource);
        fixturePrefix = "lifecycle-" + UUID.randomUUID();
        releaseId = UUID.randomUUID().getMostSignificantBits() & Long.MAX_VALUE;
    }

    @After
    public void removeOnlyLifecycleFixture() {
        for (Long id : fixtureIds) {
            lifecycleJdbc.update("DELETE FROM clinlims.his_result_outbox WHERE id = ?", id);
        }
        if (lifecycleJdbc != null && fixturePrefix != null) {
            lifecycleJdbc.update("DELETE FROM clinlims.his_result_outbox WHERE idempotency_key LIKE ?",
                    fixturePrefix + "%");
        }
    }

    @Test
    public void closureSelectsOnlyUnsentReportVersionsAndPreservesAcknowledgedHistory() {
        Long pending = enqueue("LIS-CN", releaseId, HisResultEventType.REPORT, 3);
        Long failed = enqueue("LIS-CN", releaseId, HisResultEventType.AMENDMENT, 3);
        outbox.recordAttempt(failed, false, "AE", "unavailable", "retry later", NOW);
        Long exhausted = enqueue("LIS-CN", releaseId, HisResultEventType.REPORT, 1);
        outbox.recordAttempt(exhausted, false, "AE", "unavailable", "budget exhausted", NOW);
        Long acknowledged = enqueue("LIS-CN", releaseId, HisResultEventType.REPORT, 3);
        outbox.recordAttempt(acknowledged, true, "AA", "accepted", null, NOW);
        Long closed = enqueue("LIS-CN", releaseId, HisResultEventType.REPORT, 3);
        outbox.close(closed, "previous closure", "1");
        Long withdrawal = enqueue("LIS-CN", releaseId, HisResultEventType.WITHDRAWAL, 3);
        Long anotherRelease = enqueue("LIS-CN", releaseId - 1, HisResultEventType.REPORT, 3);
        Long simulation = enqueue("SIMULATION", releaseId, HisResultEventType.REPORT, 3);
        Long nonReportEvent = enqueue("LIS-CN", releaseId, HisResultEventType.RESULT, 3);
        var acknowledgedBefore = row(acknowledged);
        var closedBefore = row(closed);

        assertEquals(3, outbox.closeUndeliveredReport(releaseId, "Report superseded", "1"));

        for (Long id : List.of(pending, failed, exhausted)) {
            var stored = row(id);
            assertEquals("CLOSED", stored.get("status"));
            assertEquals("Report superseded", stored.get("close_reason"));
            assertNull(stored.get("next_attempt_at"));
        }
        assertEquals(1, row(failed).get("attempt_count"));
        assertEquals("retry later", row(failed).get("last_error"));
        assertEquals("budget exhausted", row(exhausted).get("last_error"));
        assertEquals(acknowledgedBefore, row(acknowledged));
        assertEquals(closedBefore, row(closed));
        for (Long id : List.of(withdrawal, anotherRelease, simulation, nonReportEvent)) {
            assertEquals("PENDING", row(id).get("status"));
        }
        assertEquals(0, outbox.closeUndeliveredReport(releaseId, "Report superseded", "1"));
        assertThrows(IllegalStateException.class, () -> outbox.retry(pending, "1", NOW));
    }

    @Test
    public void closureAndWithdrawalIntentRollBackTogetherWhenParentTransactionFails() {
        Long pending = enqueue("LIS-CN", releaseId, HisResultEventType.REPORT, 3);
        var before = row(pending);
        var transaction = new TransactionTemplate(transactionManager);
        String withdrawalKey = fixturePrefix + "-rollback";

        assertThrows(IllegalStateException.class, () -> transaction.execute(status -> {
            assertEquals(1, outbox.closeUndeliveredReport(releaseId, "Report voided", "1"));
            outbox.enqueue("LIS-CN", releaseId.toString(), HisResultEventType.WITHDRAWAL, withdrawalKey,
                    "{\"fixture\":\"withdrawal\"}", 3, "1", NOW);
            throw new IllegalStateException("Simulated parent transaction failure");
        }));

        assertEquals(before, row(pending));
        assertEquals(0,
                lifecycleJdbc
                        .queryForObject("SELECT count(*) FROM clinlims.his_result_outbox WHERE idempotency_key = ?",
                                Integer.class, withdrawalKey)
                        .intValue());
    }

    private Long enqueue(String source, Long businessRelease, HisResultEventType event, int attempts) {
        HisResultOutbox value = outbox.enqueue(source, businessRelease.toString(), event,
                fixturePrefix + "-" + ++sequence, "{\"fixture\":\"lifecycle\"}", attempts, "1", NOW);
        fixtureIds.add(value.getId());
        return value.getId();
    }

    private java.util.Map<String, Object> row(Long id) {
        return lifecycleJdbc.queryForMap("SELECT * FROM clinlims.his_result_outbox WHERE id = ?", id);
    }
}
