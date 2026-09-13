package org.openelisglobal.sample.dao;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.openelisglobal.sample.valueholder.EntrySubmissionReceipt;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Repository
@Transactional(propagation = Propagation.MANDATORY)
public class EntrySubmissionReceiptDAO {
    @PersistenceContext
    private EntityManager entityManager;

    public EntrySubmissionReceipt find(String id) {
        return entityManager.find(EntrySubmissionReceipt.class, id);
    }

    public void claim(EntrySubmissionReceipt receipt) {
        entityManager.persist(receipt);
        // Force global key contention before any patient/order writes. A conflict
        // escapes this transaction; never recover using the failed EntityManager.
        entityManager.flush();
    }

    public void complete(EntrySubmissionReceipt receipt, String response) {
        if (!entityManager.contains(receipt)) { throw new IllegalStateException("Unmanaged submission"); }
        receipt.complete(response);
        entityManager.flush();
    }
}
