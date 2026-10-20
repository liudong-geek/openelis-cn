/**
 * The contents of this file are subject to the Mozilla Public License Version 1.1 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy of the
 * License at http://www.mozilla.org/MPL/
 *
 * <p>Software distributed under the License is distributed on an "AS IS" basis, WITHOUT WARRANTY OF
 * ANY KIND, either express or implied. See the License for the specific language governing rights
 * and limitations under the License.
 *
 * <p>The Original Code is OpenELIS code.
 *
 * <p>Copyright (C) The Minnesota Department of Health. All Rights Reserved.
 *
 * <p>Contributor(s): CIRG, University of Washington, Seattle WA.
 */
package org.openelisglobal.analyzerresults.daoimpl;

import jakarta.persistence.LockModeType;
import java.util.ArrayList;
import java.util.List;
import org.hibernate.Session;
import org.hibernate.query.Query;
import org.openelisglobal.analyzer.valueholder.Analyzer;
import org.openelisglobal.analyzerresults.dao.AnalyzerResultsDAO;
import org.openelisglobal.analyzerresults.valueholder.AnalyzerResults;
import org.openelisglobal.common.daoimpl.BaseDAOImpl;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.log.LogEvent;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Transactional
public class AnalyzerResultsDAOImpl extends BaseDAOImpl<AnalyzerResults, String> implements AnalyzerResultsDAO {

    public AnalyzerResultsDAOImpl() {
        super(AnalyzerResults.class);
    }

    @Override
    @Transactional(readOnly = true)
    public List<AnalyzerResults> getDuplicateResultByAccessionAndTest(AnalyzerResults result) {
        try {
            if (result.getAnalyzerId() == null || result.getAnalyzerId().trim().isEmpty()) {
                return null;
            }

            List<AnalyzerResults> list = new ArrayList<>();

            // OGC-1129: a multiplex test stages one row per component, all sharing the
            // same testName. Include component_id so distinct components of one test are
            // not treated as duplicates of each other (null = PRIMARY, today's behavior).
            String sql = "from AnalyzerResults a where a.analyzerId = :analyzerId and "
                    + "a.accessionNumber = :assessionNumber and a.testName = :testName and a.isControl = :isControl and "
                    + "((:componentId is null and a.componentId is null) or a.componentId = :componentId)";
            Query<AnalyzerResults> query = entityManager.unwrap(Session.class).createQuery(sql, AnalyzerResults.class);
            query.setParameter("analyzerId", result.getAnalyzerId());
            query.setParameter("assessionNumber", result.getAccessionNumber());
            query.setParameter("testName", result.getTestName());
            query.setParameter("isControl", result.getIsControl());
            query.setParameter("componentId", result.getComponentId());

            list = query.list();

            return list.size() > 0 ? list : null;

        } catch (RuntimeException e) {
            LogEvent.logError(e);
            throw new LIMSRuntimeException("Error in duplicateAnalyzerResultsExists()", e);
        }
    }

    @Override
    public AnalyzerResults readAnalyzerResults(String idString) throws LIMSRuntimeException {
        AnalyzerResults data = null;
        try {
            data = entityManager.unwrap(Session.class).get(AnalyzerResults.class, idString);
        } catch (RuntimeException e) {
            LogEvent.logError(e);
            throw new LIMSRuntimeException("Error in AnalyzerResults readAnalyzerResults()", e);
        }
        return data;
    }

    @Override
    @Transactional(readOnly = true)
    public List<AnalyzerResults> findWithImportIssues(int limit) {
        try {
            String hql = "FROM AnalyzerResults a WHERE a.importIssueReason IS NOT NULL "
                    + "ORDER BY a.lastupdated DESC NULLS LAST, a.id DESC";
            Query<AnalyzerResults> query = entityManager.unwrap(Session.class).createQuery(hql, AnalyzerResults.class);
            query.setMaxResults(Math.max(1, limit));
            return query.list();
        } catch (RuntimeException e) {
            LogEvent.logError(e);
            throw new LIMSRuntimeException("Error in AnalyzerResults findWithImportIssues()", e);
        }
    }

    @Override
    public void lockQCAnalyzer(String analyzerId) {
        Analyzer analyzer = entityManager.find(Analyzer.class, analyzerId, LockModeType.PESSIMISTIC_WRITE);
        if (analyzer == null) {
            throw new IllegalArgumentException("QC analyzer does not exist");
        }
    }

    @Override
    public AnalyzerResults findQCBySourceKey(String analyzerId, String sourceKey) {
        return entityManager
                .createQuery("FROM AnalyzerResults a WHERE a.isControl = true "
                        + "AND ((:analyzerId IS NULL AND a.analyzerId IS NULL) OR a.analyzerId = :analyzerId) "
                        + "AND a.qcSourceKey = :sourceKey", AnalyzerResults.class)
                .setParameter("analyzerId", analyzerId).setParameter("sourceKey", sourceKey).getResultStream()
                .findFirst().orElse(null);
    }

    @Override
    public AnalyzerResults lockQCStaging(String id) {
        AnalyzerResults result = entityManager.find(AnalyzerResults.class, id, LockModeType.PESSIMISTIC_WRITE);
        if (result != null) {
            // A row loaded earlier in this transaction may predate another committed
            // attempt.
            entityManager.refresh(result, LockModeType.PESSIMISTIC_WRITE);
        }
        return result;
    }

    @Override
    public boolean hasQCSourceIdentity(String sourceIdentity) {
        return !entityManager.createQuery(
                "SELECT a.id FROM AnalyzerResults a WHERE a.isControl = true AND a.qcSourceIdentity = :identity",
                String.class).setParameter("identity", sourceIdentity).setMaxResults(1).getResultList().isEmpty();
    }

    @Override
    @Transactional(readOnly = true)
    public List<AnalyzerResults> findQCStaging(String status, int limit, int offset) {
        String filter = qcStatusFilter(status);
        var query = entityManager.createQuery(
                "FROM AnalyzerResults a WHERE a.isControl = true" + filter + " ORDER BY a.id DESC",
                AnalyzerResults.class);
        if (filter.contains(":status")) {
            query.setParameter("status", status);
        }
        return query.setFirstResult(Math.max(0, offset)).setMaxResults(Math.max(1, Math.min(100, limit)))
                .getResultList();
    }

    @Override
    @Transactional(readOnly = true)
    public long countQCStaging(String status) {
        String filter = qcStatusFilter(status);
        var query = entityManager
                .createQuery("SELECT count(a) FROM AnalyzerResults a WHERE a.isControl = true" + filter, Long.class);
        if (filter.contains(":status")) {
            query.setParameter("status", status);
        }
        return query.getSingleResult();
    }

    private String qcStatusFilter(String status) {
        if (status == null || "ALL".equals(status)) {
            return "";
        }
        if ("OPEN".equals(status)) {
            return " AND a.qcProcessingStatus IN ('PENDING', 'NOT_PROCESSED', 'UNKNOWN')";
        }
        return " AND a.qcProcessingStatus = :status";
    }
}
