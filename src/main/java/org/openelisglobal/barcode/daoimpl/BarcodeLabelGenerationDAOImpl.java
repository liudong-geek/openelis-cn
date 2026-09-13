package org.openelisglobal.barcode.daoimpl;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Map;
import org.hibernate.Session;
import org.hibernate.query.Query;
import org.openelisglobal.barcode.dao.BarcodeLabelGenerationDAO;
import org.openelisglobal.barcode.valueholder.BarcodeLabelInfo;
import org.openelisglobal.common.daoimpl.BaseDAOImpl;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.sample.dao.SpecimenIntakeQueryFacts;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.springframework.stereotype.Component;

/** All calls run inside the generation service transaction. No legacy GET is invoked. */
@Component
public class BarcodeLabelGenerationDAOImpl extends BaseDAOImpl<Sample, String> implements BarcodeLabelGenerationDAO {
    private static final Map<String, Object> LOCK_TIMEOUT = Map.of("jakarta.persistence.lock.timeout", 15000);
    public BarcodeLabelGenerationDAOImpl() {
        super(Sample.class);
    }

    private Session session() {
        return entityManager.unwrap(Session.class);
    }

    @Override
    public Sample lockOrder(String orderId) {
        Sample sample = session().createQuery("from Sample s where s.id = :id", Sample.class)
                .setParameter("id", orderId).setLockMode(LockModeType.PESSIMISTIC_WRITE).setTimeout(15).uniqueResult();
        if (sample != null) {
            entityManager.refresh(sample, LockModeType.PESSIMISTIC_WRITE, LOCK_TIMEOUT);
        }
        return sample;
    }

    @Override
    public List<SampleItem> lockSampleItems(String orderId) {
        List<SampleItem> items = session().createQuery("from SampleItem si where si.sample.id = :id order by si.id", SampleItem.class)
                .setParameter("id", orderId).setLockMode(LockModeType.PESSIMISTIC_WRITE).setTimeout(15).list();
        items.forEach(item -> entityManager.refresh(item, LockModeType.PESSIMISTIC_WRITE, LOCK_TIMEOUT));
        return items;
    }

    @Override
    public List<Patient> findClinicalPatients(String orderId) {
        // Do not choose an arbitrary patient if a historical order has conflicting links.
        return session().createQuery("select p from SampleHuman sh, Patient p where sh.sampleId = :id and p.id = sh.patientId"
                + " and not exists (select oh.id from ObservationHistory oh, ObservationHistoryType ot"
                + " where oh.sampleId = :id and oh.observationHistoryTypeId = ot.id"
                + " and ot.typeName = :environmentType and oh.value = :environmentValue)", Patient.class)
                .setParameter("id", orderId).setParameter("environmentType", "envWorkflowType")
                .setParameter("environmentValue", "environmental").setMaxResults(2).setTimeout(15).list();
    }

    @Override
    public List<BarcodeLabelInfo> findCounters(String barcode) {
        List<BarcodeLabelInfo> rows = session().createQuery("from BarcodeLabelInfo b where b.code = :code", BarcodeLabelInfo.class)
                .setParameter("code", barcode).setLockMode(LockModeType.PESSIMISTIC_WRITE).setMaxResults(2).setTimeout(15).list();
        rows.forEach(row -> entityManager.refresh(row, LockModeType.PESSIMISTIC_WRITE, LOCK_TIMEOUT));
        return rows;
    }

    @Override
    public boolean isOrderBlocked(String orderId) {
        String hql = "select " + SpecimenIntakeQueryFacts.flag(SpecimenIntakeQueryFacts.actionBlocked()
                + " or exists (select st.id from StatusOfSample st where st.id = s.statusId and st.statusType = 'ORDER'"
                + " and st.statusOfSampleName = 'NonConforming')")
                + " from Sample s where s.id = :id";
        Query<Boolean> query = session().createQuery(hql, Boolean.class).setParameter("id", orderId).setTimeout(15);
        SpecimenIntakeQueryFacts.parametersFor(hql).forEach(query::setParameter);
        return !Boolean.FALSE.equals(query.uniqueResult());
    }

    @Override
    public boolean isSpecimenEligible(String sampleItemId) {
        // Labels may be generated before collection, but never for a voided, rejected,
        // disposed/cancelled or unrecognised specimen state. Status names are DB facts.
        Long matches = session().createQuery("select count(si.id) from SampleItem si, StatusOfSample st"
                + " where si.id = :id and st.id = si.statusId and st.statusType = 'SAMPLE'"
                + " and st.statusOfSampleName = 'SampleEntered' and coalesce(si.voided, false) = false"
                + " and coalesce(si.rejected, false) = false and si.typeOfSample.id is not null", Long.class)
                .setParameter("id", sampleItemId).setTimeout(15).uniqueResult();
        return Long.valueOf(1).equals(matches);
    }

    @Override
    public void flush() {
        session().flush();
    }
}
