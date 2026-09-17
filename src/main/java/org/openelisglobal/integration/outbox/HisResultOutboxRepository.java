package org.openelisglobal.integration.outbox;

import java.util.List;
import java.util.Optional;

public interface HisResultOutboxRepository {

  Optional<HisResultOutbox> findByIdempotencyKey(String idempotencyKey);

  Optional<HisResultOutbox> findForUpdate(Long id);

  List<HisResultOutbox> findRecent(HisResultOutboxStatus status, int limit);

  HisResultOutbox save(HisResultOutbox message);
}
