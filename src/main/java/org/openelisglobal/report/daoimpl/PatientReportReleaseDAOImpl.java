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
    public PatientReportRelease lockRelease(Long releaseId) {
        PatientReportRelease release = entityManager.find(PatientReportRelease.class, releaseId,
                jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        if (release != null) {
            // An earlier authorization lookup may already have placed the entity in this
            // transaction's cache.
            entityManager.refresh(release, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        }
        return release;
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

    @Override
    public List<Long> getPublicationIds(java.time.Instant through, Long afterId, int limit) {
        if (through == null || afterId == null || afterId < 0 || limit < 1)
            throw new IllegalArgumentException("Invalid publication page");
        String hql = "SELECT r.id FROM PatientReportRelease r WHERE r.id > :afterId "
                + "AND r.reportDocumentId IS NOT NULL AND " + "((r.status = :issued AND r.issuedAt <= :through) "
                + "OR (r.status = :voided AND r.voidedAt <= :through)) ORDER BY r.id";
        return entityManager.createQuery(hql, Long.class).setParameter("issued", PatientReportReleaseStatus.ISSUED)
                .setParameter("voided", PatientReportReleaseStatus.VOIDED)
                .setParameter("through", java.sql.Timestamp.from(through)).setParameter("afterId", afterId)
                .setMaxResults(Math.min(limit, 100)).getResultList();
    }

    @Override
    public List<PatientReportRelease> getPublishedByAnalysisUuid(java.util.UUID uuid) {
        return entityManager
                .createQuery("SELECT DISTINCT r FROM PatientReportRelease r, ReportDocumentMember m, Analysis a "
                        + "WHERE m.document.id = r.reportDocumentId AND m.analysisId = a.id AND a.fhirUuid = :uuid "
                        + "AND r.status = :issued", PatientReportRelease.class)
                .setParameter("uuid", uuid).setParameter("issued", PatientReportReleaseStatus.ISSUED).getResultList();
    }

    @Override
    public List<PatientReportRelease> findPublished(String reportNumber, String patientId, int limit) {
        if ((reportNumber == null || reportNumber.isBlank()) && (patientId == null || patientId.isBlank()))
            throw new IllegalArgumentException("Publication identity is required");
        var query = entityManager
                .createQuery("FROM PatientReportRelease r WHERE r.reportDocumentId IS NOT NULL "
                        + "AND r.status IN (:states)" + (reportNumber == null ? "" : " AND r.reportNumber = :number")
                        + (patientId == null ? "" : " AND r.patientId = :patient") + " ORDER BY r.id DESC",
                        PatientReportRelease.class)
                .setParameter("states", List.of(PatientReportReleaseStatus.ISSUED, PatientReportReleaseStatus.VOIDED))
                .setMaxResults(Math.max(1, Math.min(limit, 100)));
        if (reportNumber != null)
            query.setParameter("number", reportNumber);
        if (patientId != null)
            query.setParameter("patient", patientId);
        return query.getResultList();
    }

    @Override
    public void flush() {
        entityManager.flush();
    }
}
