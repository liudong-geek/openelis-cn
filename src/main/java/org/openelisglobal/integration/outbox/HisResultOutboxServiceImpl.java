package org.openelisglobal.integration.outbox;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HisResultOutboxServiceImpl implements HisResultOutboxService {

  private static final int MAX_LIST_LIMIT = 200;
  private final HisResultOutboxRepository repository;

  public HisResultOutboxServiceImpl(HisResultOutboxRepository repository) {
    this.repository = repository;
  }

  @Override
  @Transactional
  public HisResultOutbox enqueue(
      String sourceSystem,
      String businessId,
      HisResultEventType eventType,
      String idempotencyKey,
      String payload,
      int maxAttempts,
      String owner,
      OffsetDateTime now) {
    String normalizedKey = required(idempotencyKey, "idempotencyKey");
    String normalizedPayload = required(payload, "payload");
    String payloadHash = sha256(normalizedPayload);
    var existing = repository.findByIdempotencyKey(normalizedKey);
    if (existing.isPresent()) {
      if (!payloadHash.equals(existing.get().getPayloadHash())) {
        throw new IllegalStateException("Idempotency key already belongs to a different payload");
      }
      return existing.get();
    }

    HisResultOutbox message = new HisResultOutbox();
    message.setSourceSystem(required(sourceSystem, "sourceSystem"));
    message.setBusinessId(required(businessId, "businessId"));
    message.setEventType(eventType == null ? HisResultEventType.RESULT : eventType);
    message.setIdempotencyKey(normalizedKey);
    message.setPayload(normalizedPayload);
    message.setPayloadHash(payloadHash);
    message.setStatus(HisResultOutboxStatus.PENDING);
    message.setAttemptCount(0);
    message.setMaxAttempts(Math.max(1, Math.min(maxAttempts, 20)));
    message.setOwner(trimToNull(owner));
    message.setCreatedAt(now);
    message.setNextAttemptAt(now);
    return repository.save(message);
  }

  @Override
  @Transactional(readOnly = true)
  public List<HisResultOutbox> list(HisResultOutboxStatus status, int limit) {
    return repository.findRecent(status, Math.max(1, Math.min(limit, MAX_LIST_LIMIT)));
  }

  @Override
  @Transactional
  public HisResultOutbox recordAttempt(
      Long id,
      boolean acknowledged,
      String responseCode,
      String responseBody,
      String error,
      OffsetDateTime now) {
    HisResultOutbox message = locked(id);
    if (message.getStatus() == HisResultOutboxStatus.ACKNOWLEDGED && acknowledged) {
      return message;
    }
    ensureMutable(message);
    message.setAttemptCount(message.getAttemptCount() + 1);
    message.setResponseCode(trimToNull(responseCode));
    message.setResponseBody(trimToNull(responseBody));
    if (acknowledged) {
      message.setStatus(HisResultOutboxStatus.ACKNOWLEDGED);
      message.setAcknowledgedAt(now);
      message.setLastError(null);
      message.setNextAttemptAt(null);
    } else {
      message.setLastError(required(error, "error"));
      if (message.getAttemptCount() >= message.getMaxAttempts()) {
        message.setStatus(HisResultOutboxStatus.DEAD_LETTER);
        message.setNextAttemptAt(null);
      } else {
        message.setStatus(HisResultOutboxStatus.FAILED);
        long delaySeconds = Math.min(3600L, 60L << Math.min(message.getAttemptCount() - 1, 5));
        message.setNextAttemptAt(now.plusSeconds(delaySeconds));
      }
    }
    return repository.save(message);
  }

  @Override
  @Transactional
  public HisResultOutbox retry(Long id, String owner, OffsetDateTime now) {
    HisResultOutbox message = mutable(id);
    message.setStatus(HisResultOutboxStatus.PENDING);
    message.setNextAttemptAt(now);
    message.setOwner(trimToNull(owner));
    message.setCloseReason(null);
    return repository.save(message);
  }

  @Override
  @Transactional
  public HisResultOutbox close(Long id, String reason, String owner) {
    String normalizedReason = required(reason, "reason");
    HisResultOutbox message = mutable(id);
    message.setStatus(HisResultOutboxStatus.CLOSED);
    message.setCloseReason(normalizedReason);
    message.setOwner(trimToNull(owner));
    message.setNextAttemptAt(null);
    return repository.save(message);
  }

  private HisResultOutbox mutable(Long id) {
    HisResultOutbox message = locked(id);
    ensureMutable(message);
    return message;
  }

  private HisResultOutbox locked(Long id) {
    return repository
        .findForUpdate(id)
        .orElseThrow(() -> new IllegalArgumentException("Outbox message not found"));
  }

  private void ensureMutable(HisResultOutbox message) {
    if (message.getStatus() == HisResultOutboxStatus.ACKNOWLEDGED
        || message.getStatus() == HisResultOutboxStatus.CLOSED) {
      throw new IllegalStateException("Completed outbox message cannot be changed");
    }
  }

  private static String required(String value, String field) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      throw new IllegalArgumentException(field + " is required");
    }
    return normalized;
  }

  private static String trimToNull(String value) {
    if (value == null || value.trim().isEmpty()) {
      return null;
    }
    return value.trim();
  }

  static String sha256(String value) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 is not available", e);
    }
  }
}
