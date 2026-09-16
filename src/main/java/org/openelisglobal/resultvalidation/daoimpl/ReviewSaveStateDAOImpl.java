package org.openelisglobal.resultvalidation.daoimpl;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.sql.Timestamp;
import java.util.List;
import org.hibernate.FlushMode;
import org.hibernate.LockMode;
import org.hibernate.Session;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.resultvalidation.dao.ReviewSaveStateDAO;
import org.springframework.stereotype.Repository;

@Repository
public class ReviewSaveStateDAOImpl implements ReviewSaveStateDAO {
    @PersistenceContext private EntityManager entityManager;

    private <T> org.hibernate.query.Query<T> query(String hql, Class<T> type, String id) {
        return entityManager.unwrap(Session.class).createQuery(hql, type).setParameter("id", id)
                .setHibernateFlushMode(FlushMode.MANUAL).setTimeout(15);
    }

    @Override
    public AnalysisState analysis(String id) {
        Object[] r = query("select a.id, a.test.id, si.id, s.id, s.accessionNumber, ts.id, a.statusId, "
                + "a.lastupdated, a.releasedDate, a.printedDate from Analysis a join a.sampleItem si "
                + "join si.sample s left join a.testSection ts where a.id = :id", Object[].class, id).uniqueResult();
        return r == null ? null : new AnalysisState((String) r[0], (String) r[1], (String) r[2], (String) r[3],
                (String) r[4], (String) r[5], (String) r[6], r[7] == null ? null : String.valueOf(((Timestamp) r[7]).getTime()),
                r[8] != null, r[9] != null);
    }

    @Override
    public List<Result> lockResults(String analysisId) {
        return query("select r from Result r where r.analysis.id = :id order by r.id", Result.class, analysisId)
                .setLockMode("r", LockMode.PESSIMISTIC_WRITE).list();
    }

    @Override
    public List<Member> members(String id) {
        return query("select r.id, r.value, r.resultType, tr.componentId, p.id, r.grouping, r.lastupdated "
                + "from Result r left join r.testResult tr left join r.parentResult p "
                + "where r.analysis.id = :id order by r.id", Object[].class, id).list().stream()
                .map(r -> new Member((String) r[0], (String) r[1], (String) r[2], (String) r[3], (String) r[4],
                        ((Number) r[5]).intValue(), r[6] == null ? null : ((Timestamp) r[6]).toInstant().toString())).toList();
    }
}
