package org.openelisglobal.integration.outbox;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Repository;

@Repository
public class HisResultOutboxRepositoryImpl implements HisResultOutboxRepository {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    public Optional<HisResultOutbox> findByIdempotencyKey(String idempotencyKey) {
        return entityManager.createQuery("FROM HisResultOutbox m WHERE m.idempotencyKey = :key", HisResultOutbox.class)
                .setParameter("key", idempotencyKey).setMaxResults(1).getResultStream().findFirst();
    }

    @Override
    public Optional<HisResultOutbox> findForUpdate(Long id) {
        return Optional.ofNullable(entityManager.find(HisResultOutbox.class, id, LockModeType.PESSIMISTIC_WRITE));
    }

    @Override
    public List<HisResultOutbox> findRecent(HisResultOutboxStatus status, int limit) {
        String hql = status == null ? "FROM HisResultOutbox m ORDER BY m.createdAt DESC, m.id DESC"
                : "FROM HisResultOutbox m WHERE m.status = :status ORDER BY m.createdAt DESC, m.id" + " DESC";
        var query = entityManager.createQuery(hql, HisResultOutbox.class).setMaxResults(limit);
        if (status != null) {
            query.setParameter("status", status);
        }
        return query.getResultList();
    }

    @Override
    public List<HisResultOutbox> findUndeliveredReportForUpdate(String releaseId) {
        return entityManager
                .createQuery(
                        "FROM HisResultOutbox m WHERE m.sourceSystem = :source AND m.businessId = :releaseId"
                                + " AND m.eventType IN :events AND m.status IN :statuses ORDER BY m.id",
                        HisResultOutbox.class)
                .setParameter("source", "LIS-CN").setParameter("releaseId", releaseId)
                .setParameter("events", List.of(HisResultEventType.REPORT, HisResultEventType.AMENDMENT))
                .setParameter("statuses",
                        List.of(HisResultOutboxStatus.PENDING, HisResultOutboxStatus.FAILED,
                                HisResultOutboxStatus.DEAD_LETTER))
                .setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
    }

    @Override
    public HisResultOutbox save(HisResultOutbox message) {
        if (message.getId() == null) {
            entityManager.persist(message);
            return message;
        }
        return entityManager.merge(message);
    }
}
