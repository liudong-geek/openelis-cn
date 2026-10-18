package org.openelisglobal.integration.outbox;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyZeroInteractions;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.report.service.impl.ReportPublicationService;
import org.springframework.test.util.ReflectionTestUtils;

public class HisResultOutboxServiceTest {

    private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 9, 17, 10, 0, 0, 0, ZoneOffset.UTC);
    private HisResultOutboxRepository repository;
    private HisResultOutboxServiceImpl service;
    private ReportPublicationService publication;

    @Before
    public void setUp() {
        repository = mock(HisResultOutboxRepository.class);
        service = new HisResultOutboxServiceImpl(repository);
        publication = mock(ReportPublicationService.class);
        ReflectionTestUtils.setField(service, "reportPublication", publication);
        when(repository.save(any())).thenAnswer(invocation -> {
            HisResultOutbox value = invocation.getArgument(0);
            if (value.getId() == null) {
                value.setId(17L);
            }
            return value;
        });
    }

  @Test
  public void enqueueCreatesPendingMessageWithFrozenHashAndBoundedAttempts() {
    when(repository.findByIdempotencyKey("HIS-001")).thenReturn(Optional.empty());

    HisResultOutbox result =
        service.enqueue(
            " HIS ",
            " REPORT-001 ",
            HisResultEventType.REPORT,
            " HIS-001 ",
            " {\"report\":1} ",
            99,
            "9",
            NOW);

    assertEquals(HisResultOutboxStatus.PENDING, result.getStatus());
    assertEquals("HIS", result.getSourceSystem());
    assertEquals("REPORT-001", result.getBusinessId());
    assertEquals(20, result.getMaxAttempts());
    assertEquals(64, result.getPayloadHash().length());
    assertEquals(NOW, result.getNextAttemptAt());
    verify(repository).save(result);
  }

    @Test
    public void enqueueReturnsExistingMessageForExactIdempotentReplay() {
        HisResultOutbox existing = message(HisResultOutboxStatus.PENDING, 0, 3);
        existing.setPayloadHash(HisResultOutboxServiceImpl.sha256("payload"));
        when(repository.findByIdempotencyKey("KEY")).thenReturn(Optional.of(existing));

        HisResultOutbox replay = service.enqueue("HIS", "1", HisResultEventType.RESULT, "KEY", "payload", 3, "9", NOW);

        assertSame(existing, replay);
    }

    @Test
    public void enqueueRejectsIdempotencyKeyReuseWithDifferentPayload() {
        HisResultOutbox existing = message(HisResultOutboxStatus.PENDING, 0, 3);
        existing.setPayloadHash(HisResultOutboxServiceImpl.sha256("original"));
        when(repository.findByIdempotencyKey("KEY")).thenReturn(Optional.of(existing));

        assertThrows(IllegalStateException.class,
                () -> service.enqueue("HIS", "1", HisResultEventType.RESULT, "KEY", "changed", 3, "9", NOW));
    }

    @Test
    public void enqueueRejectsSamePayloadUnderAnotherBusinessOrEvent() {
        HisResultOutbox existing = message(HisResultOutboxStatus.PENDING, 0, 3);
        when(repository.findByIdempotencyKey("KEY")).thenReturn(Optional.of(existing));

        assertThrows(IllegalStateException.class,
                () -> service.enqueue("HIS", "2", HisResultEventType.RESULT, "KEY", "payload", 3, "9", NOW));
        assertThrows(IllegalStateException.class,
                () -> service.enqueue("HIS", "1", HisResultEventType.AMENDMENT, "KEY", "payload", 3, "9", NOW));
    }

    @Test
    public void acknowledgedReceiptCompletesOnceAndDuplicateAckIsIdempotent() {
        HisResultOutbox message = message(HisResultOutboxStatus.PENDING, 0, 3);
        when(repository.findForUpdate(17L)).thenReturn(Optional.of(message));

        HisResultOutbox acknowledged = service.recordAttempt(17L, true, "AA", "accepted", null, NOW);
        HisResultOutbox replay = service.recordAttempt(17L, true, "AA", "accepted", null, NOW.plusMinutes(1));

        assertEquals(HisResultOutboxStatus.ACKNOWLEDGED, acknowledged.getStatus());
        assertEquals(1, acknowledged.getAttemptCount());
        assertEquals(NOW, acknowledged.getAcknowledgedAt());
        assertNull(acknowledged.getNextAttemptAt());
        assertSame(acknowledged, replay);
        assertEquals(1, replay.getAttemptCount());
    }

    @Test
    public void failedAttemptSchedulesBackoffThenMovesToDeadLetterAtLimit() {
        HisResultOutbox message = message(HisResultOutboxStatus.PENDING, 0, 2);
        when(repository.findForUpdate(17L)).thenReturn(Optional.of(message));

        service.recordAttempt(17L, false, "AE", "rejected", "timeout", NOW);
        assertEquals(HisResultOutboxStatus.FAILED, message.getStatus());
        assertEquals(NOW.plusSeconds(60), message.getNextAttemptAt());

        service.retry(17L, "operator", NOW.plusSeconds(10));
        service.recordAttempt(17L, false, "AE", "rejected", "still unavailable", NOW.plusSeconds(10));
        assertEquals(HisResultOutboxStatus.DEAD_LETTER, message.getStatus());
        assertEquals(2, message.getAttemptCount());
        assertNull(message.getNextAttemptAt());
    }

    @Test
    public void manualRetryKeepsAttemptEvidenceAndRequeuesImmediately() {
        HisResultOutbox message = message(HisResultOutboxStatus.DEAD_LETTER, 5, 5);
        message.setLastError("endpoint down");
        when(repository.findForUpdate(17L)).thenReturn(Optional.of(message));

        HisResultOutbox retried = service.retry(17L, "interface-admin", NOW);

        assertEquals(HisResultOutboxStatus.PENDING, retried.getStatus());
        assertEquals(5, retried.getAttemptCount());
        assertEquals("endpoint down", retried.getLastError());
        assertEquals(NOW, retried.getNextAttemptAt());
        assertEquals("interface-admin", retried.getOwner());
        verifyZeroInteractions(publication);
    }

    @Test
    public void closeRequiresReasonAndCompletedMessageCannotBeChanged() {
        HisResultOutbox message = message(HisResultOutboxStatus.FAILED, 1, 3);
        when(repository.findForUpdate(17L)).thenReturn(Optional.of(message));

        assertThrows(IllegalArgumentException.class, () -> service.close(17L, " ", "9"));
        HisResultOutbox closed = service.close(17L, "HIS cancelled the order", "9");

        assertEquals(HisResultOutboxStatus.CLOSED, closed.getStatus());
        assertTrue(closed.getCloseReason().contains("cancelled"));
        assertThrows(IllegalStateException.class, () -> service.retry(17L, "9", NOW));
    }

    @Test
    public void officialReportRetryRequiresCurrentSignedVersionBeforeChangingEvidence() {
        HisResultOutbox message = message(HisResultOutboxStatus.FAILED, 1, 3);
        message.setSourceSystem("LIS-CN");
        message.setEventType(HisResultEventType.REPORT);
        message.setNextAttemptAt(NOW.minusMinutes(1));
        message.setOwner("original-owner");
        when(repository.findForUpdate(17L)).thenReturn(Optional.of(message));
        doThrow(new IllegalStateException("Report has been voided")).when(publication).validateOutboxRetry(message);

        assertThrows(IllegalStateException.class, () -> service.retry(17L, "new-owner", NOW));

        assertEquals(HisResultOutboxStatus.FAILED, message.getStatus());
        assertEquals(NOW.minusMinutes(1), message.getNextAttemptAt());
        assertEquals("original-owner", message.getOwner());
        verify(repository, never()).save(any());
    }

    @Test
    public void validatedWithdrawalCanRetryKeepingAttemptCount() {
        HisResultOutbox withdrawal = message(HisResultOutboxStatus.DEAD_LETTER, 3, 3);
        withdrawal.setSourceSystem("LIS-CN");
        withdrawal.setEventType(HisResultEventType.WITHDRAWAL);
        when(repository.findForUpdate(17L)).thenReturn(Optional.of(withdrawal));
        assertSame(withdrawal, service.retry(17L, "operator", NOW));
        verify(publication).validateOutboxRetry(withdrawal);
        assertEquals(HisResultOutboxStatus.PENDING, withdrawal.getStatus());
        assertEquals(3, withdrawal.getAttemptCount());
    }

    @Test
    public void supersessionClosesAllUnsentAttemptsWithoutDestroyingFailureEvidence() {
        HisResultOutbox pending = message(HisResultOutboxStatus.PENDING, 0, 3);
        HisResultOutbox failed = message(HisResultOutboxStatus.FAILED, 1, 3);
        HisResultOutbox exhausted = message(HisResultOutboxStatus.DEAD_LETTER, 3, 3);
        for (HisResultOutbox value : List.of(pending, failed, exhausted)) {
            value.setSourceSystem("LIS-CN");
            value.setEventType(HisResultEventType.REPORT);
            value.setNextAttemptAt(NOW);
            value.setLastError("retained diagnostic");
        }
        when(repository.findUndeliveredReportForUpdate("1")).thenReturn(List.of(pending, failed, exhausted));

        assertEquals(3, service.closeUndeliveredReport(1L, " superseded by release 2 ", "7"));

        for (HisResultOutbox value : List.of(pending, failed, exhausted)) {
            assertEquals(HisResultOutboxStatus.CLOSED, value.getStatus());
            assertEquals("superseded by release 2", value.getCloseReason());
            assertEquals("7", value.getOwner());
            assertNull(value.getNextAttemptAt());
            assertEquals("retained diagnostic", value.getLastError());
            verify(repository).save(value);
        }
        assertEquals(0, pending.getAttemptCount());
        assertEquals(1, failed.getAttemptCount());
        assertEquals(3, exhausted.getAttemptCount());
        when(repository.findForUpdate(17L)).thenReturn(Optional.of(failed));
        assertThrows(IllegalStateException.class, () -> service.retry(17L, "operator", NOW));
        verifyZeroInteractions(publication);
    }

  @Test
  public void listCapsRequestedPageSize() {
    when(repository.findRecent(null, 200)).thenReturn(List.of());
    service.list(null, 5000);
    verify(repository).findRecent(null, 200);
  }

    private HisResultOutbox message(HisResultOutboxStatus status, int attempts, int maxAttempts) {
        HisResultOutbox message = new HisResultOutbox();
        message.setId(17L);
        message.setSourceSystem("HIS");
        message.setBusinessId("1");
        message.setEventType(HisResultEventType.RESULT);
        message.setStatus(status);
        message.setAttemptCount(attempts);
        message.setMaxAttempts(maxAttempts);
        message.setPayloadHash(HisResultOutboxServiceImpl.sha256("payload"));
        message.setCreatedAt(NOW);
        return message;
    }
}
