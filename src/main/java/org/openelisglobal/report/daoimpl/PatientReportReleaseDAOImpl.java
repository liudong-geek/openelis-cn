package org.openelisglobal.report.daoimpl;

import java.util.List;
import org.hibernate.Session;
import org.hibernate.query.Query;
import org.openelisglobal.common.daoimpl.BaseDAOImpl;
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
    public int getNextVersion(String documentId) {
        Integer current = entityManager.unwrap(Session.class).createQuery(
                "SELECT MAX(r.reportVersion) FROM PatientReportRelease r WHERE r.reportDocumentId = :documentId",
                Integer.class).setParameter("documentId", documentId).uniqueResult();
        return current == null ? 1 : current + 1;
    }

    @Override
    public PatientReportRelease getDraft(String documentId) {
        Query<PatientReportRelease> query = entityManager.unwrap(Session.class)
                .createQuery("FROM PatientReportRelease r WHERE r.reportDocumentId = :documentId "
                        + "AND r.status = :status ORDER BY r.createdAt DESC", PatientReportRelease.class)
                .setParameter("documentId", documentId).setParameter("status", PatientReportReleaseStatus.DRAFT)
                .setMaxResults(1);
        return query.uniqueResult();
    }

    @Override
    public PatientReportRelease getLatestIssued(String documentId) {
        Query<PatientReportRelease> query = entityManager.unwrap(Session.class)
                .createQuery("FROM PatientReportRelease r WHERE r.reportDocumentId = :documentId "
                        + "AND r.status = :status ORDER BY r.reportVersion DESC", PatientReportRelease.class)
                .setParameter("documentId", documentId).setParameter("status", PatientReportReleaseStatus.ISSUED)
                .setMaxResults(1);
        return query.uniqueResult();
    }

    @Override
    public PatientReportRelease getLatestReleased(String documentId) {
        Query<PatientReportRelease> query = entityManager.unwrap(Session.class)
                .createQuery(
                        "FROM PatientReportRelease r WHERE r.reportDocumentId = :documentId "
                                + "AND r.status <> :draftStatus ORDER BY r.reportVersion DESC",
                        PatientReportRelease.class)
                .setParameter("documentId", documentId).setParameter("draftStatus", PatientReportReleaseStatus.DRAFT)
                .setMaxResults(1);
        return query.uniqueResult();
    }

    @Override
    public List<PatientReportRelease> getByDocument(String documentId) {
        return entityManager.unwrap(Session.class)
                .createQuery("FROM PatientReportRelease r WHERE r.reportDocumentId = :documentId "
                        + "ORDER BY r.reportVersion DESC", PatientReportRelease.class)
                .setParameter("documentId", documentId).list();
    }
}
