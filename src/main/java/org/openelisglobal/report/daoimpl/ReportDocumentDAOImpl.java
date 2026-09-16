package org.openelisglobal.report.daoimpl;

import jakarta.persistence.LockModeType;
import java.util.List;
import org.openelisglobal.common.daoimpl.BaseDAOImpl;
import org.openelisglobal.report.dao.ReportDocumentDAO;
import org.openelisglobal.report.valueholder.ReportDocument;
import org.openelisglobal.report.valueholder.ReportDocumentMember;
import org.openelisglobal.sample.valueholder.Sample;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Transactional
public class ReportDocumentDAOImpl extends BaseDAOImpl<ReportDocument, String> implements ReportDocumentDAO {
    public ReportDocumentDAOImpl() {
        super(ReportDocument.class);
    }

    @Override
    public void lockSample(String sampleId) {
        entityManager.createQuery("FROM Sample s WHERE s.id = :id", Sample.class).setParameter("id", sampleId)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE).getSingleResult();
    }

    @Override
    public ReportDocument findBySampleAndGroup(String sampleId, String groupKey) {
        return entityManager
                .createQuery("SELECT DISTINCT d FROM ReportDocument d LEFT JOIN FETCH d.members "
                        + "WHERE d.sampleId = :sampleId AND d.reportGroupKey = :groupKey", ReportDocument.class)
                .setParameter("sampleId", sampleId).setParameter("groupKey", groupKey).getResultList().stream()
                .findFirst().orElse(null);
    }

    @Override
    public ReportDocument getWithMembers(String documentId, boolean lock) {
        // Lock the parent separately: PostgreSQL disallows FOR UPDATE on the nullable
        // side of an outer join.
        if (lock) {
            List<ReportDocument> parents = entityManager
                    .createQuery("FROM ReportDocument d WHERE d.id = :id", ReportDocument.class)
                    .setParameter("id", documentId).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
            if (parents.isEmpty())
                return null;
        }
        return entityManager
                .createQuery("SELECT DISTINCT d FROM ReportDocument d LEFT JOIN FETCH d.members WHERE d.id = :id",
                        ReportDocument.class)
                .setParameter("id", documentId).getResultList().stream().findFirst().orElse(null);
    }

    @Override
    public List<ReportDocument> getBySample(String sampleId) {
        return entityManager
                .createQuery("SELECT DISTINCT d FROM ReportDocument d LEFT JOIN FETCH d.members "
                        + "WHERE d.sampleId = :sampleId ORDER BY d.reportGroupKey", ReportDocument.class)
                .setParameter("sampleId", sampleId).getResultList();
    }

    @Override
    public void insertMember(ReportDocumentMember member) {
        entityManager.persist(member);
        entityManager.flush();
    }
}
