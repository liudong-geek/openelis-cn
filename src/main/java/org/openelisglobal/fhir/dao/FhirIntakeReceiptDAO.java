package org.openelisglobal.fhir.dao;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.List;
import java.util.UUID;
import org.openelisglobal.fhir.valueholder.FhirIntakeReceipt;
import org.springframework.stereotype.Repository;

@Repository
public class FhirIntakeReceiptDAO {
    @PersistenceContext
    private EntityManager entityManager;

    public FhirIntakeReceipt find(UUID id) {
        return entityManager.find(FhirIntakeReceipt.class, id);
    }

    public void insert(FhirIntakeReceipt receipt) {
        entityManager.persist(receipt);
        entityManager.flush();
    }

    public List<FhirIntakeReceipt> findBySample(String sampleId) {
        return entityManager
                .createQuery("from FhirIntakeReceipt r where r.sample.id = :sampleId", FhirIntakeReceipt.class)
                .setParameter("sampleId", sampleId).getResultList();
    }
}
