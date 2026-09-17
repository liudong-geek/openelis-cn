package org.openelisglobal.sample.daoimpl;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.util.List;
import java.util.Map;
import org.openelisglobal.referencetables.valueholder.ReferenceTables;
import org.openelisglobal.sample.dao.SpecimenRecollectionDAO;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision;
import org.openelisglobal.sample.valueholder.SpecimenRecollection;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Repository
@Transactional(propagation = Propagation.MANDATORY)
public class SpecimenRecollectionDAOImpl implements SpecimenRecollectionDAO {
    private static final Map<String, Object> TIMEOUT = Map.of("jakarta.persistence.lock.timeout", 15000);
    private static final List<String> AUDIT_TABLES = List.of("sample_type_request", "specimen_recollection");
    private static final String AUDIT = "FROM ReferenceTables r WHERE lower(trim(r.tableName)) IN :names ORDER BY r.id";
    @PersistenceContext
    private EntityManager em;

    @Override
    public List<SpecimenRecollection> lockClaims(String operation, String source) {
        var rows = em.createQuery(
                "FROM SpecimenRecollection r WHERE r.operationId = :operation OR r.sourceSampleItemId = :source ORDER BY r.id",
                SpecimenRecollection.class).setParameter("operation", operation).setParameter("source", source)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE).setHint("jakarta.persistence.lock.timeout", 15000)
                .getResultList();
        rows.forEach(row -> em.refresh(row, LockModeType.PESSIMISTIC_WRITE, TIMEOUT));
        return rows;
    }

    @Override
    public List<SpecimenRecollection> findForSources(List<String> sources) {
        if (sources == null || sources.isEmpty())
            return List.of();
        return em.createQuery("FROM SpecimenRecollection r WHERE r.sourceSampleItemId IN :sources ORDER BY r.id",
                SpecimenRecollection.class).setParameter("sources", sources).getResultList();
    }

    @Override
    public SpecimenRecollection findOperation(String operation) {
        var rows = em
                .createQuery("FROM SpecimenRecollection r WHERE r.operationId = :operation", SpecimenRecollection.class)
                .setParameter("operation", operation).setMaxResults(2).getResultList();
        if (rows.size() > 1)
            throw new IllegalStateException("Duplicate replacement operation");
        return rows.isEmpty() ? null : rows.get(0);
    }

    @Override
    public SpecimenIntakeDecision lockDecision(String operation) {
        var rows = em
                .createQuery("FROM SpecimenIntakeDecision d WHERE d.operationId = :operation",
                        SpecimenIntakeDecision.class)
                .setParameter("operation", operation).setMaxResults(2).setLockMode(LockModeType.PESSIMISTIC_WRITE)
                .setHint("jakarta.persistence.lock.timeout", 15000).getResultList();
        if (rows.size() > 1)
            throw new IllegalStateException("Duplicate specimen decision operation");
        if (rows.isEmpty())
            return null;
        em.refresh(rows.get(0), LockModeType.PESSIMISTIC_WRITE, TIMEOUT);
        return rows.get(0);
    }

    @Override
    public List<ReferenceTables> lockAuditReferences() {
        var rows = em.createQuery(AUDIT, ReferenceTables.class).setParameter("names", AUDIT_TABLES)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE).setHint("jakarta.persistence.lock.timeout", 15000)
                .getResultList();
        rows.forEach(row -> em.refresh(row, LockModeType.PESSIMISTIC_WRITE, TIMEOUT));
        return rows;
    }

    @Override
    public List<ReferenceTables> auditReferences() {
        return em.createQuery(AUDIT, ReferenceTables.class).setParameter("names", AUDIT_TABLES).getResultList();
    }

    @Override
    public SampleTypeRequest insertRequest(SampleTypeRequest request) {
        if (request.getId() != null || request.getStatus() != SampleTypeRequest.Status.REQUESTED
                || request.getSampleItem() != null)
            throw new IllegalArgumentException("A new uncollected request is required");
        em.persist(request);
        return request;
    }

    @Override
    public SpecimenRecollection insert(SpecimenRecollection row) {
        if (row.getId() != null)
            throw new IllegalArgumentException("A new replacement record is required");
        row.validateRecord();
        em.persist(row);
        return row;
    }

    @Override
    public void flush() {
        em.flush();
    }

    @Override
    public void requireManaged(List<?> values) {
        if (values == null || values.stream().anyMatch(value -> value == null || !em.contains(value))) {
            throw new IllegalStateException("Replacement transaction lost its managed evidence");
        }
    }
}
