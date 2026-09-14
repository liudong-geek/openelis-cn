package org.openelisglobal.result.daoimpl;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.sql.Timestamp;
import java.util.Date;
import org.hibernate.FlushMode;
import org.hibernate.LockMode;
import org.hibernate.Session;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class OrdinaryResultSaveStateDAOImpl implements OrdinaryResultSaveStateDAO {
    @PersistenceContext
    private EntityManager entityManager;

    @Override
    @Transactional(readOnly = true)
    public State findState(String analysisId) {
        Object[] row = entityManager.unwrap(Session.class)
                .createQuery("select a.id, a.statusId, a.releasedDate, a.printedDate from Analysis a where a.id = :id",
                        Object[].class)
                .setParameter("id", analysisId).setHibernateFlushMode(FlushMode.MANUAL).setTimeout(15).uniqueResult();
        return row == null ? null : new State((String) row[0], (String) row[1], (Timestamp) row[2], (Date) row[3]);
    }

    @Override
    @Transactional(readOnly = true)
    public SpecimenState findSpecimenState(String analysisId) {
        Object[] row = entityManager.unwrap(Session.class)
                .createQuery("select a.id, a.test.id, si.id, si.sample.id, si.statusId, si.rejected, si.voided "
                        + "from Analysis a join a.sampleItem si where a.id = :id", Object[].class)
                .setParameter("id", analysisId).setHibernateFlushMode(FlushMode.MANUAL).setTimeout(15).uniqueResult();
        return row == null ? null
                : new SpecimenState((String) row[0], (String) row[1], (String) row[2], (String) row[3], (String) row[4],
                        (Boolean) row[5], (Boolean) row[6]);
    }

    @Override
    @Transactional
    public SampleItem lockSpecimen(String sampleItemId) {
        // The legacy controller may have already changed a managed Analysis.
        // Lock without flushing it; the caller then reads scalar persisted facts.
        SampleItem item = entityManager.unwrap(Session.class)
                .createQuery("select si from SampleItem si where si.id = :id", SampleItem.class)
                .setParameter("id", sampleItemId).setHibernateFlushMode(FlushMode.MANUAL)
                .setLockMode("si", LockMode.PESSIMISTIC_WRITE).setTimeout(15).uniqueResult();
        if (item == null) {
            throw new org.openelisglobal.result.exception.ResultSaveValidationException(
                    "error.results.specimenNotEligible");
        }
        return item;
    }

    @Override
    @Transactional
    public Analysis lockAnalysis(String analysisId) {
        Analysis analysis = entityManager.unwrap(Session.class)
                .createQuery("select a from Analysis a where a.id = :id", Analysis.class).setParameter("id", analysisId)
                .setHibernateFlushMode(FlushMode.MANUAL).setLockMode("a", LockMode.PESSIMISTIC_WRITE).setTimeout(15)
                .uniqueResult();
        if (analysis == null) {
            throw new org.openelisglobal.result.exception.ResultSaveValidationException(
                    "error.results.specimenNotEligible");
        }
        return analysis;
    }
}
