package org.openelisglobal.qaevent.daoimpl;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.hibernate.Session;
import org.openelisglobal.qaevent.dao.NceWorkspaceDAO;
import org.openelisglobal.qaevent.service.NceWorkspaceException;
import org.openelisglobal.qaevent.valueholder.NcEvent;
import org.openelisglobal.qaevent.valueholder.NceRegistrationReceipt;
import org.openelisglobal.qaevent.valueholder.NceSpecimen;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.systemmodule.valueholder.SystemModule;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.springframework.stereotype.Repository;

/**
 * Dedicated HQL reads and technical claim; every write participates in the
 * service transaction.
 */
@Repository
public class NceWorkspaceDAOImpl implements NceWorkspaceDAO {
    @PersistenceContext
    private EntityManager entityManager;

    private Session session() {
        return entityManager.unwrap(Session.class);
    }

    @Override
    public Optional<NceRegistrationReceipt> receipt(String key) {
        var result = session().createQuery("from NceRegistrationReceipt r where r.id=:id", NceRegistrationReceipt.class)
                .setParameter("id", key).setMaxResults(1).setTimeout(15).uniqueResultOptional();
        result.ifPresent(this::refresh);
        return result;
    }

    @Override
    public void claim(NceRegistrationReceipt receipt) {
        entityManager.persist(receipt);
        entityManager.flush();
    }

    @Override
    public void complete(NceRegistrationReceipt receipt, Integer eventId, String response) {
        if (!entityManager.contains(receipt))
            throw new IllegalStateException("UNMANAGED_NCE_RECEIPT");
        receipt.complete(eventId, response);
        entityManager.flush();
    }

    @Override
    public Optional<NcEvent> event(int id, boolean lock) {
        var query = session().createQuery("from NcEvent e where e.id=:id", NcEvent.class).setParameter("id", id)
                .setTimeout(15);
        if (lock)
            query.setLockMode(LockModeType.PESSIMISTIC_WRITE);
        else
            query.setReadOnly(true);
        return query.uniqueResultOptional();
    }

    @Override
    public List<NcEvent> candidates(Set<String> sections) {
        if (sections.isEmpty())
            return List.of();
        var values = sections.stream().map(Integer::valueOf).toList();
        var rows = session().createQuery("from NcEvent e where e.reportingUnitId in :units or exists "
                + "(select ns.id from NceSpecimen ns, SampleItem si, Analysis a where ns.nceId=e.id "
                + "and ns.sampleItemId=cast(si.id as integer) and a.sampleItem.id=si.id and a.testSection.id in :sections) "
                + "or exists (select ns.id from NceSpecimen ns, SampleItem si, SampleTypeRequest r where ns.nceId=e.id "
                + "and ns.sampleItemId=cast(si.id as integer) and r.sample.id=si.sample.id) order by e.id desc",
                NcEvent.class).setReadOnly(true).setParameterList("units", values)
                .setParameterList("sections", sections).setMaxResults(2001).setTimeout(15).list();
        return bounded(rows);
    }

    @Override
    public List<NceSpecimen> links(int id) {
        return bounded(session().createQuery("from NceSpecimen ns where ns.nceId=:id order by ns.id", NceSpecimen.class)
                .setReadOnly(true).setParameter("id", id).setMaxResults(2001).setTimeout(15).list());
    }

    @Override
    public List<Sample> searchOrders(String type, String value) {
        String criterion = switch (type) {
        case "labNumber" -> "s.accessionNumber=:value";
        case "firstName" -> "s.id in (select sh.sampleId from SampleHuman sh where sh.patientId in "
                + "(select p.id from Patient p where lower(p.person.firstName) like :value escape '!'))";
        case "lastName" -> "s.id in (select sh.sampleId from SampleHuman sh where sh.patientId in "
                + "(select p.id from Patient p where lower(p.person.lastName) like :value escape '!'))";
        case "STNumber" -> "s.id in (select sh.sampleId from SampleHuman sh where sh.patientId in "
                + "(select p.id from Patient p where lower(p.nationalId) like :value escape '!' or p.id in "
                + "(select pi.patientId from PatientIdentity pi where lower(pi.identityData) like :value escape '!' and pi.identityTypeId in "
                + "(select pit.id from PatientIdentityType pit where pit.identityType in ('ST','SUBJECT')))))";
        default -> throw new IllegalArgumentException("INVALID_NCE_ORDER_QUERY");
        };
        String term = (!type.equals("labNumber")) ? "%" + escape(value.toLowerCase(java.util.Locale.ROOT)) + "%"
                : value;
        return bounded(session()
                .createQuery("from Sample s where " + criterion + " order by cast(s.id as integer)", Sample.class)
                .setReadOnly(true).setParameter("value", term).setMaxResults(2001).setTimeout(15).list());
    }

    @Override
    public List<SystemUser> users(String search) {
        return session()
                .createQuery("from SystemUser u where u.isActive='Y' and (lower(u.firstName) like :value escape '!' "
                        + "or lower(u.lastName) like :value escape '!' or lower(u.loginName) like :value escape '!') order by cast(u.id as integer)",
                        SystemUser.class)
                .setReadOnly(true).setParameter("value", "%" + escape(search.toLowerCase(java.util.Locale.ROOT)) + "%")
                .setMaxResults(25).setTimeout(15).list();
    }

    @Override
    public String allocateNumber(SystemModule module, int year) {
        entityManager.lock(module, LockModeType.PESSIMISTIC_WRITE);
        String prefix = "NCE-" + year + "-";
        var numbers = session()
                .createQuery("select e.nceNumber from NcEvent e where e.nceNumber like :prefix", String.class)
                .setParameter("prefix", prefix + "%").setTimeout(15).list();
        int max = 0;
        for (String number : numbers)
            if (number != null && number.matches("NCE-[0-9]{4}-[0-9]{5}"))
                max = Math.max(max, Integer.parseInt(number.substring(9)));
        if (max >= 99999)
            throw new NceWorkspaceException(409, "NCE_NUMBER_EXHAUSTED");
        return String.format(java.util.Locale.ROOT, "NCE-%04d-%05d", year, max + 1);
    }

    @Override
    public void refresh(Object entity) {
        if (entity != null && entityManager.contains(entity))
            entityManager.refresh(entity);
    }

    @Override
    public void advanceVersion(NcEvent event) {
        entityManager.lock(event, LockModeType.PESSIMISTIC_FORCE_INCREMENT);
    }

    @Override
    public void lockOwner(Object entity) {
        entityManager.refresh(entity, LockModeType.PESSIMISTIC_READ);
    }

    @Override
    public void flush() {
        entityManager.flush();
    }

    private <T> List<T> bounded(List<T> rows) {
        if (rows.size() > 2000)
            throw new NceWorkspaceException(409, "NCE_QUERY_TOO_LARGE");
        return rows;
    }

    private String escape(String s) {
        return s.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }
}
