package org.openelisglobal.sample.daoimpl;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.util.List;
import java.util.Map;
import org.openelisglobal.dictionary.valueholder.Dictionary;
import org.openelisglobal.dictionarycategory.valueholder.DictionaryCategory;
import org.openelisglobal.referencetables.valueholder.ReferenceTables;
import org.openelisglobal.sample.dao.SpecimenIntakeDecisionWriteDAO;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.test.valueholder.Test;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Repository
@Transactional(propagation = Propagation.MANDATORY)
public class SpecimenIntakeDecisionWriteDAOImpl implements SpecimenIntakeDecisionWriteDAO {
    @PersistenceContext
    private EntityManager em;
    private static final Map<String, Object> TIMEOUT = Map.of("jakarta.persistence.lock.timeout", 15000);
    private static final String AUDIT_HQL = "FROM ReferenceTables r WHERE lower(trim(r.tableName)) IN :names ORDER BY r.id";
    private static final List<String> AUDIT_TABLES = List.of("sample_item", "specimen_intake_decision");

    @Override
    public List<SpecimenIntakeDecision> lockClaims(String operation, String item) {
        var rows = em.createQuery(
                "FROM SpecimenIntakeDecision d WHERE d.operationId = :operation OR d.sampleItemId = :item ORDER BY d.id",
                SpecimenIntakeDecision.class).setParameter("operation", operation).setParameter("item", item)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE).setHint("jakarta.persistence.lock.timeout", 15000)
                .getResultList();
        rows.forEach(row -> em.refresh(row, LockModeType.PESSIMISTIC_WRITE, TIMEOUT));
        return rows;
    }

    private <T> T locked(Class<T> type, String id) {
        T value = em.find(type, id, LockModeType.PESSIMISTIC_WRITE, TIMEOUT);
        if (value != null) {
            em.refresh(value, LockModeType.PESSIMISTIC_WRITE, TIMEOUT);
        }
        return value;
    }

    @Override
    public TypeOfSample lockType(String id) {
        return locked(TypeOfSample.class, id);
    }

    @Override
    public Dictionary lockReason(String id) {
        return locked(Dictionary.class, id);
    }

    @Override
    public DictionaryCategory lockReasonCategory(String id) {
        return locked(DictionaryCategory.class, id);
    }

    @Override
    public List<org.openelisglobal.statusofsample.valueholder.StatusOfSample> lockRejectedStatuses() {
        var rows = em.createQuery(
                "FROM StatusOfSample s WHERE s.statusType = :type AND s.statusOfSampleName = :name ORDER BY s.id",
                org.openelisglobal.statusofsample.valueholder.StatusOfSample.class).setParameter("type", "SAMPLE")
                .setParameter("name", "Sample Rejected").setLockMode(LockModeType.PESSIMISTIC_WRITE)
                .setHint("jakarta.persistence.lock.timeout", 15000).getResultList();
        rows.forEach(row -> em.refresh(row, LockModeType.PESSIMISTIC_WRITE, TIMEOUT));
        return rows;
    }

    @Override
    public List<Test> lockTests(List<String> ids) {
        var rows = em.createQuery("FROM Test t WHERE t.id IN :ids ORDER BY t.id", Test.class).setParameter("ids", ids)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE).setHint("jakarta.persistence.lock.timeout", 15000)
                .getResultList();
        rows.forEach(row -> em.refresh(row, LockModeType.PESSIMISTIC_WRITE, TIMEOUT));
        return rows;
    }

    @Override
    public List<ReferenceTables> lockAuditReferences() {
        var rows = em.createQuery(AUDIT_HQL, ReferenceTables.class).setParameter("names", AUDIT_TABLES)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE).setHint("jakarta.persistence.lock.timeout", 15000)
                .getResultList();
        rows.forEach(row -> em.refresh(row, LockModeType.PESSIMISTIC_WRITE, TIMEOUT));
        return rows;
    }

    @Override
    public List<ReferenceTables> auditReferences() {
        // No refresh once writing begins. SERIALIZABLE service boundary also protects
        // phantoms.
        return em.createQuery(AUDIT_HQL, ReferenceTables.class).setParameter("names", AUDIT_TABLES).getResultList();
    }

    @Override
    public SpecimenIntakeDecision insert(SpecimenIntakeDecision value) {
        if (value.getId() != null) {
            throw new IllegalArgumentException("First-decision record already has an identity");
        }
        value.validateRecord();
        em.persist(value);
        // Detect operation/tube uniqueness conflicts before touching the original tube.
        em.flush();
        return value;
    }

    @Override
    public SampleItem currentItem(String id) {
        return em.find(SampleItem.class, id);
    }

    @Override
    public void requireManaged(List<?> entities) {
        if (entities.stream().anyMatch(value -> value == null || !em.contains(value))) {
            throw new IllegalStateException("Intake graph was replaced in the current transaction");
        }
    }
}
