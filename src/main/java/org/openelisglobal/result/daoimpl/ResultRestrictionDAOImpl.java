package org.openelisglobal.result.daoimpl;

import java.sql.Date;
import java.sql.Timestamp;
import java.util.Optional;
import org.hibernate.FlushMode;
import org.hibernate.Session;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.daoimpl.BaseDAOImpl;
import org.openelisglobal.result.dao.ResultRestrictionDAO;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Transactional(readOnly = true)
public class ResultRestrictionDAOImpl extends BaseDAOImpl<Analysis, String> implements ResultRestrictionDAO {
    public ResultRestrictionDAOImpl() {
        super(Analysis.class);
    }

    @Override
    public Optional<AnalysisFacts> findAnalysis(String id) {
        var row = entityManager.unwrap(Session.class)
                .createQuery("select a.id, t.id, section.id, i.id, s.id, s.accessionNumber, a.lastupdated, "
                        + "s.lastupdated, i.lastupdated, a.statusId, i.statusId, i.rejected, i.voided, "
                        + "a.releasedDate, a.printedDate, i.sortOrder from Analysis a left join a.test t "
                        + "left join a.testSection section left join a.sampleItem i left join i.sample s where a.id = :id",
                        Object[].class)
                .setParameter("id", id).setHibernateFlushMode(FlushMode.MANUAL).setReadOnly(true).setTimeout(15)
                .uniqueResult();
        return row == null ? Optional.empty()
                : Optional.of(new AnalysisFacts((String) row[0], (String) row[1], (String) row[2], (String) row[3],
                        (String) row[4], (String) row[5], (Timestamp) row[6], (Timestamp) row[7], (Timestamp) row[8],
                        (String) row[9], (String) row[10], (Boolean) row[11], (Boolean) row[12], (Timestamp) row[13],
                        (Date) row[14], (String) row[15]));
    }

    @Override
    public Optional<StatusFacts> findStatus(String id) {
        var row = entityManager.unwrap(Session.class).createQuery(
                "select s.id, s.statusType, s.code, s.statusOfSampleName, s.isActive from StatusOfSample s where s.id = :id",
                Object[].class).setParameter("id", id).setHibernateFlushMode(FlushMode.MANUAL).setReadOnly(true)
                .setTimeout(15).uniqueResult();
        return row == null ? Optional.empty()
                : Optional.of(new StatusFacts((String) row[0], (String) row[1], (String) row[2], (String) row[3],
                        (String) row[4]));
    }

    @Override
    public void refresh(Object value) {
        if (value != null && entityManager.contains(value))
            entityManager.refresh(value);
    }
}
