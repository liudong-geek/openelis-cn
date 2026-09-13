package org.openelisglobal.sample.daoimpl;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Map;
import org.hibernate.Session;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.sample.dao.SpecimenReceiptDAO;
import org.openelisglobal.sample.exception.EntrySubmissionException;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.springframework.stereotype.Repository;

/**
 * Locks have a stable order. No flush/refresh of an unrelated pending form is
 * allowed.
 */
@Repository
public class SpecimenReceiptDAOImpl implements SpecimenReceiptDAO {
    private final EntityManager entityManager;
    private static final Map<String, Object> TIMEOUT = Map.of("jakarta.persistence.lock.timeout", 15000);

    public SpecimenReceiptDAOImpl(EntityManagerFactory entityManagerFactory) {
        // HibernateConfig exposes a factory, not an EntityManager bean. Use the
        // same transaction-bound manager as the existing @PersistenceContext DAOs.
        this.entityManager = org.springframework.orm.jpa.SharedEntityManagerCreator
                .createSharedEntityManager(entityManagerFactory);
    }

    private Session session() {
        return entityManager.unwrap(Session.class);
    }

    @Override
    public void requireCleanContext() {
        if (session().isDefaultReadOnly() || session().isDirty()) {
            throw new EntrySubmissionException(409, "SPECIMEN_RECEIPT_CONTEXT_CHANGED", "当前会话有其他未完成的更改，请重新核对申请后签收。");
        }
    }

    private <T> List<T> locked(String hql, Class<T> type, String sampleId) {
        var rows = session().createQuery(hql, type).setParameter("id", sampleId)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE).setTimeout(15).list();
        rows.forEach(row -> entityManager.refresh(row, LockModeType.PESSIMISTIC_WRITE, TIMEOUT));
        return rows;
    }

    @Override
    public Sample lockOrder(String sampleId) {
        var rows = locked("from Sample s where s.id = :id", Sample.class, sampleId);
        return rows.size() == 1 ? rows.get(0) : null;
    }

    @Override
    public List<SampleTypeRequest> lockRequests(String sampleId) {
        return locked("from SampleTypeRequest r where r.sample.id = :id order by r.id", SampleTypeRequest.class,
                sampleId);
    }

    @Override
    public List<SampleItem> lockItems(String sampleId) {
        return locked("from SampleItem si where si.sample.id = :id order by si.id", SampleItem.class, sampleId);
    }

    @Override
    public List<Analysis> lockAnalyses(String sampleId) {
        return locked("from Analysis a where a.sampleItem.sample.id = :id order by a.id", Analysis.class, sampleId);
    }

    @Override
    public List<String> clinicalPatientIds(String sampleId) {
        return session().createQuery("select p.id from SampleHuman sh, Patient p where sh.sampleId = :id"
                + " and p.id = sh.patientId and not exists (select oh.id from ObservationHistory oh, ObservationHistoryType ot"
                + " where oh.sampleId = :id and oh.observationHistoryTypeId = ot.id"
                + " and ot.typeName = 'envWorkflowType' and oh.value = 'environmental')", String.class)
                .setParameter("id", sampleId).setMaxResults(2).setTimeout(15).list();
    }

    @Override
    public String statusName(String id, String type) {
        return session()
                .createQuery("select s.statusOfSampleName from StatusOfSample s where s.id = :id"
                        + " and s.statusType = :type", String.class)
                .setParameter("id", id).setParameter("type", type).setTimeout(15).uniqueResult();
    }

    @Override
    public void flush() {
        session().flush();
    }
}
