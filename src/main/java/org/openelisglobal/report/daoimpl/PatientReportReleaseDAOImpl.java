package org.openelisglobal.report.daoimpl;

import java.util.List;
import jakarta.persistence.LockModeType;
import org.hibernate.Session;
import org.hibernate.query.Query;
import org.openelisglobal.common.daoimpl.BaseDAOImpl;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.report.dao.PatientReportReleaseDAO;
import org.openelisglobal.report.valueholder.PatientReportRelease;
import org.openelisglobal.report.valueholder.PatientReportReleaseStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Transactional
public class PatientReportReleaseDAOImpl extends BaseDAOImpl<PatientReportRelease, Long>
        implements PatientReportReleaseDAO {

    public PatientReportReleaseDAOImpl() {
        super(PatientReportRelease.class);
    }

    @Override
    public void lockPatientVersion(String patientId) {
        entityManager.unwrap(Session.class).createQuery("FROM Patient p WHERE p.id = :patientId", Patient.class)
                .setParameter("patientId", patientId).setLockMode(LockModeType.PESSIMISTIC_WRITE).getSingleResult();
    }

    @Override
    public int getNextVersion(String patientId) {
        Integer current = entityManager.unwrap(Session.class)
                .createQuery("SELECT MAX(r.reportVersion) FROM PatientReportRelease r WHERE r.patientId = :patientId",
                        Integer.class)
                .setParameter("patientId", patientId).uniqueResult();
        return current == null ? 1 : current + 1;
    }

    @Override
    public PatientReportRelease getDraft(String patientId) {
        Query<PatientReportRelease> query = entityManager.unwrap(Session.class)
                .createQuery("FROM PatientReportRelease r WHERE r.patientId = :patientId "
                        + "AND r.status = :status ORDER BY r.createdAt DESC",
                        PatientReportRelease.class)
                .setParameter("patientId", patientId).setParameter("status", PatientReportReleaseStatus.DRAFT)
                .setMaxResults(1);
        return query.uniqueResult();
    }

    @Override
    public PatientReportRelease getLatestIssued(String patientId) {
        Query<PatientReportRelease> query = entityManager.unwrap(Session.class)
                .createQuery("FROM PatientReportRelease r WHERE r.patientId = :patientId "
                        + "AND r.status = :status ORDER BY r.reportVersion DESC", PatientReportRelease.class)
                .setParameter("patientId", patientId).setParameter("status", PatientReportReleaseStatus.ISSUED)
                .setMaxResults(1);
        return query.uniqueResult();
    }

    @Override
    public PatientReportRelease getLatestReleased(String patientId) {
        Query<PatientReportRelease> query = entityManager.unwrap(Session.class)
                .createQuery("FROM PatientReportRelease r WHERE r.patientId = :patientId "
                        + "AND r.status <> :draftStatus ORDER BY r.reportVersion DESC", PatientReportRelease.class)
                .setParameter("patientId", patientId).setParameter("draftStatus", PatientReportReleaseStatus.DRAFT)
                .setMaxResults(1);
        return query.uniqueResult();
    }

    @Override
    public List<PatientReportRelease> getByPatient(String patientId) {
        return entityManager.unwrap(Session.class)
                .createQuery("FROM PatientReportRelease r WHERE r.patientId = :patientId "
                        + "ORDER BY r.reportVersion DESC", PatientReportRelease.class)
                .setParameter("patientId", patientId).list();
    }
}
