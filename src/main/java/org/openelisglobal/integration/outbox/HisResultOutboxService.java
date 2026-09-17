package org.openelisglobal.integration.outbox;

import java.time.OffsetDateTime;
import java.util.List;

public interface HisResultOutboxService {

  HisResultOutbox enqueue(
      String sourceSystem,
      String businessId,
      HisResultEventType eventType,
      String idempotencyKey,
      String payload,
      int maxAttempts,
      String owner,
      OffsetDateTime now);

  List<HisResultOutbox> list(HisResultOutboxStatus status, int limit);

  HisResultOutbox recordAttempt(
      Long id,
      boolean acknowledged,
      String responseCode,
      String responseBody,
      String error,
      OffsetDateTime now);

  HisResultOutbox retry(Long id, String owner, OffsetDateTime now);

  HisResultOutbox close(Long id, String reason, String owner);
}
