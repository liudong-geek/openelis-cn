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
    @org.springframework.beans.factory.annotation.Autowired
    private org.openelisglobal.common.util.DefaultConfigurationProperties configuration;

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

    private <T> org.hibernate.query.Query<T> intakeQuery(String hql, Class<T> type, String id) {
        return entityManager.unwrap(Session.class).createQuery(hql, type).setParameter("id", id)
                .setHibernateFlushMode(FlushMode.MANUAL).setTimeout(15);
    }

    @Override
    @Transactional(readOnly = true)
    public IntakeState findIntakeState(String id) {
        var row = intakeQuery("select si.id, s.id, s.accessionNumber, s.receivedTimestamp, t.id, t.active, "
                + "si.collectionDate, si.receivedDate, si.lastupdated, parent.id, si.rejectReasonId, s.domain "
                + "from SampleItem si join si.sample s left join si.typeOfSample t left join si.parentSampleItem parent "
                + "where si.id = :id", Object[].class, id).uniqueResult();
        if (row == null)
            return null;
        var tube = new IntakeTube((String) row[0], (String) row[1], (String) row[2], time(row[3]), (String) row[4],
                (Boolean) row[5], time(row[6]), time(row[7]), time(row[8]), (String) row[9], (String) row[10],
                (String) row[11], configuration.getPropertyValue("domain.human"));
        var requests = intakeQuery("select r.id, r.sample.id, r.sampleItem.id, r.typeOfSample.id, r.status, "
                + "r.requestedTests, r.lastupdated from SampleTypeRequest r where r.sampleItem.id = :id order by r.id",
                Object[].class, id)
                .setMaxResults(2).list().stream()
                .map(r -> new IntakeRequest(r[0].toString(), (String) r[1], (String) r[2], (String) r[3],
                        (org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest.Status) r[4], (String) r[5],
                        time(r[6])))
                .toList();
        var tests = intakeQuery("select a.id, a.test.id, a.test.isActive from Analysis a "
                + "where a.sampleItem.id = :id order by a.id", Object[].class, id).setMaxResults(5001).list().stream()
                .map(r -> new IntakeTest((String) r[0], (String) r[1], (String) r[2])).toList();
        return new IntakeState(tube, patients(tube.sampleId()), requests, tests, decisions(id));
    }

    @Override
    @Transactional(readOnly = true)
    public IntakeState managedIntakeState(String id) {
        var item = intakeQuery("from SampleItem si where si.id = :id", SampleItem.class, id).uniqueResult();
        if (item == null || item.getSample() == null || item.getTypeOfSample() == null)
            return null;
        var sample = item.getSample();
        var tube = new IntakeTube(item.getId(), sample.getId(), sample.getAccessionNumber(),
                time(sample.getReceivedTimestamp()), item.getTypeOfSample().getId(), item.getTypeOfSample().isActive(),
                time(item.getCollectionDate()), time(item.getReceivedDate()), time(item.getLastupdated()),
                item.getParentSampleItem() == null ? null : item.getParentSampleItem().getId(),
                item.getRejectReasonId(), sample.getDomain(), configuration.getPropertyValue("domain.human"));
        var requests = intakeQuery("from SampleTypeRequest r where r.sampleItem.id = :id order by r.id",
                org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest.class, id).setMaxResults(2).list()
                .stream()
                .map(r -> new IntakeRequest(r.getId() == null ? null : r.getId().toString(),
                        r.getSample() == null ? null : r.getSample().getId(),
                        r.getSampleItem() == null ? null : r.getSampleItem().getId(),
                        r.getTypeOfSample() == null ? null : r.getTypeOfSample().getId(), r.getStatus(),
                        r.getRequestedTests(), time(r.getLastupdated())))
                .toList();
        var tests = intakeQuery("from Analysis a where a.sampleItem.id = :id order by a.id", Analysis.class, id)
                .setMaxResults(5001).list().stream()
                .map(a -> new IntakeTest(a.getId(), a.getTest() == null ? null : a.getTest().getId(),
                        a.getTest() == null ? null : a.getTest().getIsActive()))
                .toList();
        return new IntakeState(tube, patients(sample.getId()), requests, tests, decisions(id));
    }

    private java.util.List<String> patients(String sampleId) {
        return intakeQuery(
                "select p.id from SampleHuman sh left join Patient p on p.id = sh.patientId where sh.sampleId = :id "
                        + "and not exists (select oh.id from ObservationHistory oh, ObservationHistoryType ot "
                        + "where oh.sampleId = :id and oh.observationHistoryTypeId = ot.id "
                        + "and ot.typeName = 'envWorkflowType' and oh.value = 'environmental')",
                String.class, sampleId).setMaxResults(2).list();
    }

    private java.util.List<org.openelisglobal.sample.valueholder.SpecimenIntakeDecision> decisions(String id) {
        return intakeQuery("from SpecimenIntakeDecision d where d.sampleItemId = :id order by d.id",
                org.openelisglobal.sample.valueholder.SpecimenIntakeDecision.class, id).setMaxResults(2).list();
    }

    private static String time(Object value) {
        return value == null ? null : ((Timestamp) value).toInstant().toString();
    }

    @Override
    @Transactional
    public void flush() {
        entityManager.flush();
    }
}
