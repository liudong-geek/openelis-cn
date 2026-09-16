package org.openelisglobal.sample.daoimpl;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.hibernate.Session;
import org.hibernate.query.Query;
import org.openelisglobal.common.daoimpl.BaseDAOImpl;
import org.openelisglobal.sample.dao.OrderDashboardDAO;
import org.openelisglobal.sample.dao.SpecimenIntakeQueryFacts;
import org.openelisglobal.sample.form.OrderDashboardCriteria;
import org.openelisglobal.sample.form.OrderDashboardRecord;
import org.openelisglobal.sample.form.SpecimenIntakeFacts;
import org.openelisglobal.sample.valueholder.OrderPriority;
import org.openelisglobal.sample.valueholder.Sample;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Filter and count in the database before pagination. Scalar projection avoids
 * loading legacy entity graphs or one query per patient/specimen/checklist.
 */
@Component
@Transactional(readOnly = true)
public class OrderDashboardDAOImpl extends BaseDAOImpl<Sample, String> implements OrderDashboardDAO {
    private static final String REGISTERED = SpecimenIntakeQueryFacts.registered();
    private static final String COLLECTED = SpecimenIntakeQueryFacts.collected();
    private static final String LABELLED = "(exists (select si.id from SampleItem si where si.sample.id = s.id and coalesce(si.voided, false) = false)"
            + " and not exists (select si.id from SampleItem si where si.sample.id = s.id and coalesce(si.voided, false) = false"
            + " and (si.sortOrder is null or trim(si.sortOrder) = '' or si.rejected = true"
            + " or (select count(other.id) from SampleItem other where other.sample.id = s.id and other.sortOrder = si.sortOrder) <> 1"
            + " or (select count(counter.id) from BarcodeLabelInfo counter where counter.code = concat(concat(s.accessionNumber, '.'), si.sortOrder)) <> 1"
            + " or not exists (select label.id from BarcodeLabelInfo label where label.code = concat(concat(s.accessionNumber, '.'), si.sortOrder)"
            + " and label.type = 'specimen' and label.numPrinted > 0))))";
    private static final String VERIFIED = "(" + SpecimenIntakeQueryFacts.savedQaSnapshot() + " and not "
            + SpecimenIntakeQueryFacts.actionBlocked() + ")";

    public OrderDashboardDAOImpl() {
        super(Sample.class);
    }

    @Override
    public List<OrderDashboardRecord> findPage(OrderDashboardCriteria criteria) {
        QueryParts parts = where(criteria);
        String hql = "select s.id, s.accessionNumber, s.lastupdated, s.priority, s.clinicalOrderId,"
                + " (select case when count(distinct p.id) = 1 then max(p.person.firstName) else null end from SampleHuman sh, Patient p"
                + " where sh.sampleId = s.id and p.id = sh.patientId),"
                + " (select case when count(distinct p.id) = 1 then max(p.person.lastName) else null end from SampleHuman sh, Patient p"
                + " where sh.sampleId = s.id and p.id = sh.patientId)," + " s.storageSkipped, " + flag(REGISTERED)
                + ", " + flag(COLLECTED) + ", " + flag(LABELLED) + ", "
                + flag(SpecimenIntakeQueryFacts.savedQaSnapshot())
                + ", (select case when count(distinct o.id) = 1 then max(o.organizationName) else null end"
                + " from SampleRequester sr, RequesterType rt, Organization o join o.organizationTypes ot"
                + " where sr.sampleId = cast(s.id as long) and sr.requesterTypeId = cast(rt.id as long)"
                + " and rt.requesterType = 'organization' and sr.requesterId = cast(o.id as long)"
                + " and ot.name = 'referring clinic')" + ", " + flag(SpecimenIntakeQueryFacts.disposed()) + ", "
                + flag(SpecimenIntakeQueryFacts.rejected()) + ", " + flag(SpecimenIntakeQueryFacts.statusConflict())
                + ", " + flag(SpecimenIntakeQueryFacts.noActiveTests())
                + ", (select case when count(distinct p.id) = 1 then max(p.id) else null end from SampleHuman sh, Patient p where sh.sampleId = s.id and p.id = sh.patientId)"
                + " from Sample s" + parts.hql() + " order by s.enteredDate desc, s.id desc";
        Query<Object[]> query = entityManager.unwrap(Session.class).createQuery(hql, Object[].class);
        parts.parameters().forEach(query::setParameter);
        SpecimenIntakeQueryFacts.parametersFor(hql).forEach(query::setParameter);
        query.setFirstResult(criteria.offset());
        query.setMaxResults(criteria.pageSize());
        query.setTimeout(15);
        return query.list().stream()
                .map(row -> new OrderDashboardRecord((String) row[0], (String) row[1], (Timestamp) row[2],
                        (OrderPriority) row[3], (String) row[4], (String) row[5], (String) row[6], (String) row[12],
                        Boolean.TRUE.equals(row[7]), Boolean.TRUE.equals(row[8]), Boolean.TRUE.equals(row[9]),
                        Boolean.TRUE.equals(row[10]), Boolean.TRUE.equals(row[11]), Boolean.TRUE.equals(row[13]),
                        Boolean.TRUE.equals(row[14]), Boolean.TRUE.equals(row[15]), Boolean.TRUE.equals(row[16]),
                        (String) row[17]))
                .toList();
    }

    @Override
    public long count(OrderDashboardCriteria criteria) {
        QueryParts parts = where(criteria);
        String hql = "select count(s.id) from Sample s" + parts.hql();
        Query<Long> query = entityManager.unwrap(Session.class).createQuery(hql, Long.class);
        parts.parameters().forEach(query::setParameter);
        SpecimenIntakeQueryFacts.parametersFor(hql).forEach(query::setParameter);
        query.setTimeout(15);
        return query.uniqueResult();
    }

    private static String flag(String predicate) {
        return SpecimenIntakeQueryFacts.flag(predicate);
    }

    @Override
    public Optional<SpecimenIntakeFacts> findIntakeFacts(String sampleId, OrderDashboardCriteria criteria) {
        QueryParts parts = where(criteria);
        String hql = "select " + flag(REGISTERED) + ", " + flag(COLLECTED) + ", " + flag(LABELLED) + ", "
                + flag(SpecimenIntakeQueryFacts.savedQaSnapshot()) + ", " + flag(SpecimenIntakeQueryFacts.disposed())
                + ", " + flag(SpecimenIntakeQueryFacts.rejected()) + ", "
                + flag(SpecimenIntakeQueryFacts.statusConflict()) + ", "
                + flag(SpecimenIntakeQueryFacts.noActiveTests()) + " from Sample s" + parts.hql()
                + " and s.id = :sampleId";
        Query<Object[]> query = entityManager.unwrap(Session.class).createQuery(hql, Object[].class);
        query.setParameter("sampleId", sampleId);
        parts.parameters().forEach(query::setParameter);
        SpecimenIntakeQueryFacts.parametersFor(hql).forEach(query::setParameter);
        query.setMaxResults(1);
        query.setTimeout(15);
        Object[] row = query.uniqueResult();
        return row == null ? Optional.empty()
                : Optional.of(new SpecimenIntakeFacts(Boolean.TRUE.equals(row[0]), Boolean.TRUE.equals(row[1]),
                        Boolean.TRUE.equals(row[2]), Boolean.TRUE.equals(row[3]), Boolean.TRUE.equals(row[4]),
                        Boolean.TRUE.equals(row[5]), Boolean.TRUE.equals(row[6]), Boolean.TRUE.equals(row[7])));
    }

    @Override
    public java.util.Map<String, java.util.List<org.openelisglobal.sample.service.EntryCurrentStateReader.SpecimenView>> tubes(
            java.util.List<String> sampleIds, java.util.List<String> allowedTests) {
        if (sampleIds.isEmpty())
            return java.util.Map.of();
        Session session = entityManager.unwrap(Session.class);
        var requested = session.createQuery(
                "select r.requestedTests from SampleTypeRequest r where r.sample.id in (:ids) and r.status <> :cancelled",
                String.class).setParameter("ids", sampleIds)
                .setParameter("cancelled",
                        org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest.Status.CANCELLED)
                .list();
        for (String csv : requested) {
            if (csv == null || csv.isBlank())
                throw new org.springframework.security.access.AccessDeniedException("dashboard.access.changed");
            for (String id : csv.split(",", -1))
                if (!allowedTests.contains(id.trim()))
                    throw new org.springframework.security.access.AccessDeniedException("dashboard.access.changed");
        }
        var rows = session.createQuery(
                "select si.sample.id, si.id, si.sortOrder, si.typeOfSample.id, si.voided, si.rejected,"
                        + " (select case when count(r.id) = 1 then max(r.id) else null end from SampleTypeRequest r where r.sampleItem.id = si.id and r.sample.id = si.sample.id)"
                        + " from SampleItem si where si.sample.id in (:ids) order by si.sample.id, si.id",
                Object[].class).setParameter("ids", sampleIds).setMaxResults(5001).list();
        if (rows.size() > 5000)
            throw new IllegalArgumentException("dashboard.specimens.tooMany");
        var result = new java.util.LinkedHashMap<String, java.util.List<org.openelisglobal.sample.service.EntryCurrentStateReader.SpecimenView>>();
        for (Object[] row : rows)
            result.computeIfAbsent((String) row[0], ignored -> new java.util.ArrayList<>())
                    .add(new org.openelisglobal.sample.service.EntryCurrentStateReader.SpecimenView((String) row[1],
                            row[6] == null ? null : row[6].toString(), (String) row[2], (String) row[3], null, null,
                            null, Boolean.TRUE.equals(row[4]), Boolean.TRUE.equals(row[5]), null, null, null, null,
                            java.util.List.of()));
        return result;
    }

    private QueryParts where(OrderDashboardCriteria criteria) {
        List<String> predicates = new ArrayList<>();
        Map<String, Object> parameters = new LinkedHashMap<>();
        if (criteria.testIds().isEmpty() || criteria.sectionIds().isEmpty()) {
            predicates.add("1 = 0");
        } else {
            // A list row describes a complete order. Never expose a partial order by
            // silently dropping unauthorized tests.
            predicates.add("not exists (select a.id from Analysis a where a.sampleItem.sample.id = s.id"
                    + " and (a.test.id not in (:visibleTests) or a.test is null or a.testSection is null or a.testSection.id not in (:visibleSections)))");
            predicates.add("not exists (select r.id from SampleTypeRequest r where r.sample.id = s.id"
                    + " and (r.status is null or r.status <> :cancelledStatus) and (r.status is null or r.requestedTests is null or trim(r.requestedTests) = ''"
                    + " or function('regexp_replace', replace(r.requestedTests, ' ', ''), :visibleTestCsv, '') <> ''))");
            // PostgreSQL ARE, bound as data: match the complete CSV so nonexistent IDs and
            // malformed separators cannot inflate counts.
            String ids = String.join("|", criteria.testIds());
            parameters.put("visibleTestCsv", "^(" + ids + ")(,(" + ids + "))*$");
            predicates.add("(exists (select a.id from Analysis a where a.sampleItem.sample.id = s.id)"
                    + " or exists (select r.id from SampleTypeRequest r where r.sample.id = s.id and r.status <> :cancelledStatus))");
            parameters.put("visibleTests", criteria.testIds());
            parameters.put("visibleSections", criteria.sectionIds());
        }
        if (criteria.search() != null) {
            String name = criteria.masked() ? ""
                    : " or exists (select sh.id from SampleHuman sh, Patient p where sh.sampleId = s.id and p.id = sh.patientId"
                            + " and (lower(concat(concat(coalesce(p.person.firstName, ''), ' '), coalesce(p.person.lastName, ''))) like :search escape '!'"
                            + " or lower(concat(coalesce(p.person.lastName, ''), coalesce(p.person.firstName, ''))) like :search escape '!'))";
            predicates.add("(lower(s.accessionNumber) like :search escape '!'" + name + ")");
            parameters.put("search", "%" + escapeLike(criteria.search().toLowerCase(Locale.ROOT)) + "%");
        }
        if (criteria.priority() != null) {
            predicates
                    .add(criteria.priority() == OrderPriority.ROUTINE ? "(s.priority = :priority or s.priority is null)"
                            : "s.priority = :priority");
            parameters.put("priority", criteria.priority());
        }
        if (criteria.startDate() != null) {
            predicates.add("s.enteredDate >= :startDate");
            parameters.put("startDate", criteria.startDate());
        }
        if (criteria.endDate() != null) {
            predicates.add("s.enteredDate <= :endDate");
            parameters.put("endDate", criteria.endDate());
        }
        if (!criteria.intakeStatuses().isEmpty()) {
            predicates.add(
                    "(" + String.join(" or ", criteria.intakeStatuses().stream().map(this::progressPredicate).toList())
                            + ")");
        }
        return new QueryParts(predicates.isEmpty() ? "" : " where " + String.join(" and ", predicates), parameters);
    }

    private String progressPredicate(String state) {
        return switch (state) {
        case "registration_pending" -> "not " + REGISTERED;
        case "collection_pending" -> REGISTERED + " and not " + COLLECTED;
        case "label_pending" -> REGISTERED + " and " + COLLECTED + " and not " + LABELLED;
        case "qa_pending" -> REGISTERED + " and " + COLLECTED + " and " + LABELLED + " and not (" + VERIFIED + ")";
        case "checklist_complete" -> REGISTERED + " and " + COLLECTED + " and " + LABELLED + " and " + VERIFIED;
        default -> throw new IllegalArgumentException("dashboard.status.invalid");
        };
    }

    private static String escapeLike(String value) {
        return value.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }

    private record QueryParts(String hql, Map<String, Object> parameters) {
    }
}
