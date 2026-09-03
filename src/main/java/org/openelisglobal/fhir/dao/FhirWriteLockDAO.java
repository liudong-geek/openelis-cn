package org.openelisglobal.fhir.dao;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Database-scoped locks serialize replay checks across application instances.
 */
@Repository
public class FhirWriteLockDAO {
    @PersistenceContext
    private EntityManager entityManager;

    public void lock(String key) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("FHIR write locks require a service transaction");
        }
        entityManager.createNativeQuery("SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(:lockKey, 0))")
                .setParameter("lockKey", key).getSingleResult();
    }
}
