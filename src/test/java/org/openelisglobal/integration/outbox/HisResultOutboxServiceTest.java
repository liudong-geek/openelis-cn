package org.openelisglobal.integration.outbox;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.Before;
import org.junit.Test;

public class HisResultOutboxServiceTest {

  private static final OffsetDateTime NOW =
      OffsetDateTime.of(2026, 9, 17, 10, 0, 0, 0, ZoneOffset.UTC);
  private HisResultOutboxRepository repository;
  private HisResultOutboxServiceImpl service;

  @Before
  public void setUp() {
    repository = mock(HisResultOutboxRepository.class);
    service = new HisResultOutboxServiceImpl(repository);
    when(repository.save(any()))
        .thenAnswer(
            invocation -> {
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

    HisResultOutbox replay =
        service.enqueue("HIS", "1", HisResultEventType.RESULT, "KEY", "payload", 3, "9", NOW);

    assertSame(existing, replay);
  }

  @Test
  public void enqueueRejectsIdempotencyKeyReuseWithDifferentPayload() {
    HisResultOutbox existing = message(HisResultOutboxStatus.PENDING, 0, 3);
    existing.setPayloadHash(HisResultOutboxServiceImpl.sha256("original"));
    when(repository.findByIdempotencyKey("KEY")).thenReturn(Optional.of(existing));

    assertThrows(
        IllegalStateException.class,
        () ->
            service.enqueue("HIS", "1", HisResultEventType.RESULT, "KEY", "changed", 3, "9", NOW));
  }

  @Test
  public void acknowledgedReceiptCompletesOnceAndDuplicateAckIsIdempotent() {
    HisResultOutbox message = message(HisResultOutboxStatus.PENDING, 0, 3);
    when(repository.findForUpdate(17L)).thenReturn(Optional.of(message));

    HisResultOutbox acknowledged = service.recordAttempt(17L, true, "AA", "accepted", null, NOW);
    HisResultOutbox replay =
        service.recordAttempt(17L, true, "AA", "accepted", null, NOW.plusMinutes(1));

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
  public void listCapsRequestedPageSize() {
    when(repository.findRecent(null, 200)).thenReturn(List.of());
    service.list(null, 5000);
    verify(repository).findRecent(null, 200);
  }

  private HisResultOutbox message(HisResultOutboxStatus status, int attempts, int maxAttempts) {
    HisResultOutbox message = new HisResultOutbox();
    message.setId(17L);
    message.setStatus(status);
    message.setAttemptCount(attempts);
    message.setMaxAttempts(maxAttempts);
    message.setPayloadHash(HisResultOutboxServiceImpl.sha256("payload"));
    message.setCreatedAt(NOW);
    return message;
  }
}
