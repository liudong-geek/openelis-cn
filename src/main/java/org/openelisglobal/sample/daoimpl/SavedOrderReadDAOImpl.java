package org.openelisglobal.sample.daoimpl;

import java.util.List;
import java.util.Optional;
import org.hibernate.Session;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.daoimpl.BaseDAOImpl;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.provider.valueholder.Provider;
import org.openelisglobal.sample.dao.SavedOrderReadDAO;
import org.openelisglobal.sample.service.SavedOrderReadException;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.springframework.stereotype.Component;

/** Narrow joins, no session result cache and no persistent mutation. */
@Component
public class SavedOrderReadDAOImpl extends BaseDAOImpl<Sample, String> implements SavedOrderReadDAO {
    public SavedOrderReadDAOImpl() {
        super(Sample.class);
    }

    @Override
    public Optional<Graph> loadExact(String labNumber) {
        Session session = entityManager.unwrap(Session.class);
        var matches = session.createQuery("from Sample s where s.accessionNumber = :number", Sample.class)
                .setReadOnly(true).setParameter("number", labNumber).setMaxResults(2).setTimeout(15).list();
        if (matches.isEmpty())
            return Optional.empty();
        if (matches.size() != 1)
            throw new SavedOrderReadException(409, "AMBIGUOUS_ORDER_IDENTITY");
        Sample sample = matches.get(0);
        String id = sample.getId();
        var items = rows(session,
                "select si from SampleItem si join fetch si.sample left join fetch si.typeOfSample left join fetch si.unitOfMeasure where si.sample.id = :id order by si.id",
                SampleItem.class, id);
        var analyses = rows(session,
                "select a from Analysis a join fetch a.sampleItem si join fetch si.sample left join fetch a.test left join fetch a.testSection left join fetch a.panel where si.sample.id = :id order by a.id",
                Analysis.class, id);
        var requests = rows(session,
                "select r from SampleTypeRequest r join fetch r.sample left join fetch r.typeOfSample left join fetch r.unitOfMeasure left join fetch r.sampleItem where r.sample.id = :id order by r.sortOrder, r.id",
                SampleTypeRequest.class, id);
        var patients = rows(session,
                "select p from Patient p left join fetch p.person where p.id in (select sh.patientId from SampleHuman sh where sh.sampleId = :id)",
                Patient.class, id);
        var providers = rows(session,
                "select p from Provider p left join fetch p.person where p.id in (select sh.providerId from SampleHuman sh where sh.sampleId = :id)",
                Provider.class, id);
        return Optional.of(new Graph(sample, List.copyOf(items), List.copyOf(analyses), List.copyOf(requests),
                List.copyOf(patients), List.copyOf(providers)));
    }

    @Override
    public void refreshReadContext() {
        entityManager.clear();
    }

    private <T> List<T> rows(Session session, String hql, Class<T> type, String id) {
        var result = session.createQuery(hql, type).setReadOnly(true).setParameter("id", id).setMaxResults(2001)
                .setTimeout(15).list();
        if (result.size() > 2000)
            throw new SavedOrderReadException(409, "ORDER_DATA_TOO_LARGE");
        return result;
    }
}
