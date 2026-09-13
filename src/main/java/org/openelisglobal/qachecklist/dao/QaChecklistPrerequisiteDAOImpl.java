package org.openelisglobal.qachecklist.dao;

import org.hibernate.Session;
import org.hibernate.query.Query;
import org.openelisglobal.common.daoimpl.BaseDAOImpl;
import org.openelisglobal.sample.dao.SpecimenIntakeQueryFacts;
import org.openelisglobal.sample.valueholder.Sample;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Scalar facts are compiled inside the caller's service transaction. */
@Component
@Transactional(readOnly = true)
public class QaChecklistPrerequisiteDAOImpl extends BaseDAOImpl<Sample, String> implements QaChecklistPrerequisiteDAO {
    public QaChecklistPrerequisiteDAOImpl() {
        super(Sample.class);
    }

    @Override
    public Prerequisites findPrerequisites(Integer sampleId) {
        String hql = "select " + SpecimenIntakeQueryFacts.flag(SpecimenIntakeQueryFacts.registered()) + ", "
                + SpecimenIntakeQueryFacts.flag(SpecimenIntakeQueryFacts.collected()) + ", "
                + SpecimenIntakeQueryFacts.flag(SpecimenIntakeQueryFacts.stored()) + ", "
                + SpecimenIntakeQueryFacts.flag(SpecimenIntakeQueryFacts.disposed()) + ", "
                + SpecimenIntakeQueryFacts.flag(SpecimenIntakeQueryFacts.rejected()) + ", "
                + SpecimenIntakeQueryFacts.flag(SpecimenIntakeQueryFacts.statusConflict()) + ", "
                + SpecimenIntakeQueryFacts.flag(SpecimenIntakeQueryFacts.noActiveTests())
                + " from Sample s where s.id = :sampleId";
        Query<Object[]> query = entityManager.unwrap(Session.class).createQuery(hql, Object[].class);
        query.setParameter("sampleId", sampleId.toString());
        SpecimenIntakeQueryFacts.parametersFor(hql).forEach(query::setParameter);
        query.setMaxResults(1);
        query.setTimeout(15);
        Object[] row = query.uniqueResult();
        return row == null ? null
                : new Prerequisites(Boolean.TRUE.equals(row[0]), Boolean.TRUE.equals(row[1]),
                        Boolean.TRUE.equals(row[2]), Boolean.TRUE.equals(row[3]), Boolean.TRUE.equals(row[4]),
                        Boolean.TRUE.equals(row[5]), Boolean.TRUE.equals(row[6]));
    }

}
