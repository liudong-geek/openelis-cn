package org.openelisglobal.sample.dao;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import jakarta.persistence.EntityManager;
import java.sql.Date;
import java.util.List;
import org.hibernate.Session;
import org.hibernate.query.Query;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.sample.daoimpl.OrderDashboardDAOImpl;
import org.openelisglobal.sample.form.OrderDashboardCriteria;
import org.openelisglobal.sample.valueholder.OrderPriority;
import org.springframework.test.util.ReflectionTestUtils;

/** Query-boundary regression; separate Hibernate test validates actual HQL. */
public class OrderDashboardDAOTest {
    private OrderDashboardDAOImpl dao;
    private Session session;
    private Query<Object[]> rows;
    private Query<Long> count;

    @Before
    @SuppressWarnings("unchecked")
    public void setUp() {
        dao = new OrderDashboardDAOImpl();
        EntityManager em = mock(EntityManager.class);
        session = mock(Session.class);
        rows = mock(Query.class);
        count = mock(Query.class);
        when(em.unwrap(Session.class)).thenReturn(session);
        // Query text is captured and asserted independently below; mock only the I/O.
        when(session.createQuery(anyString(), eq(Object[].class))).thenReturn(rows);
        when(session.createQuery(anyString(), eq(Long.class))).thenReturn(count);
        when(rows.list()).thenReturn(List.of());
        when(count.uniqueResult()).thenReturn(0L);
        ReflectionTestUtils.setField(dao, "entityManager", em);
    }

    @Test
    public void filtersAreIdenticalForCountAndPageAndPaginationIsDatabaseBounded() {
        var input = criteria("L_10%", "qa_pending");
        dao.count(input);
        dao.findPage(input);
        ArgumentCaptor<String> pageHql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> countHql = ArgumentCaptor.forClass(String.class);
        verify(session).createQuery(pageHql.capture(), eq(Object[].class));
        verify(session).createQuery(countHql.capture(), eq(Long.class));
        String pageWhere = pageHql.getValue().substring(
                pageHql.getValue().lastIndexOf(" from Sample s") + " from Sample s".length(),
                pageHql.getValue().lastIndexOf(" order by "));
        assertEquals("select count(s.id) from Sample s" + pageWhere, countHql.getValue());
        assertFalse(pageHql.getValue().contains("L_10%"));
        verify(rows).setParameter("search", "%l!_10!%%");
        verify(count).setParameter("search", "%l!_10!%%");
        verify(rows).setParameter("priority", OrderPriority.STAT);
        verify(count).setParameter("priority", OrderPriority.STAT);
        verify(rows).setParameter("visibleTests", List.of("1", "2"));
        verify(count).setParameter("visibleTests", List.of("1", "2"));
        verify(rows).setParameter("visibleSections", List.of("3"));
        verify(count).setParameter("visibleTestCsv", "^(1|2)(,(1|2))*$");
        verify(rows).setParameter("startDate", Date.valueOf("2026-09-01"));
        verify(rows).setParameter("endDate", Date.valueOf("2026-09-05"));
        verify(rows).setFirstResult(25);
        verify(rows).setMaxResults(25);
        assertTrue(pageHql.getValue().endsWith("order by s.enteredDate desc, s.id desc"));
        verifyNoMoreInteractions(session);
    }

    @Test
    public void changedSearchBindsDifferentValuesWithoutInterpolatingThem() {
        dao.findPage(criteria("A' OR 1=1", "collection_pending"));
        dao.findPage(criteria("B", "collection_pending"));
        verify(rows).setParameter("search", "%a' or 1=1%");
        verify(rows).setParameter("search", "%b%");
        ArgumentCaptor<String> hql = ArgumentCaptor.forClass(String.class);
        verify(session, times(2)).createQuery(hql.capture(), eq(Object[].class));
        assertEquals(hql.getAllValues().get(0), hql.getAllValues().get(1));
        assertFalse(hql.getValue().contains("OR 1=1"));
    }

    @Test
    public void completedFilterRequiresEveryEarlierStageNotOnlyQa() {
        dao.count(criteria(null, "checklist_complete"));
        ArgumentCaptor<String> hql = ArgumentCaptor.forClass(String.class);
        verify(session).createQuery(hql.capture(), eq(Long.class));
        assertTrue(hql.getValue().contains("receivedTimestamp is not null"));
        assertTrue(hql.getValue().contains("si.collectionDate is null"));
        assertTrue(hql.getValue().contains("label.numPrinted > 0"));
        assertTrue(hql.getValue().contains("qa.allRequiredVerified = true"));
    }

    @Test
    public void registrationInBothCountAndRowsRequiresTheSameRealEnvironmentSiteAsQaSave() {
        for (String hql : pageAndCountHql("registration_pending")) {
            assertTrue("An arbitrary non-null environmental marker is not registration",
                    hql.contains("oh.value = :environmentValue"));
            assertTrue("Environmental samples need a real enabled sampling-site master",
                    hql.contains("site.value = cast(o.id as string)"));
            assertTrue(hql.contains("o.isActive = 'Y'"));
        }
        verify(rows).setParameter("environmentValue", "environmental");
        verify(count).setParameter("environmentValue", "environmental");
    }

    @Test
    public void collectionInBothCountAndRowsIncludesOutstandingRequestsAndRealTests() {
        for (String hql : pageAndCountHql("collection_pending")) {
            assertTrue("Already-collected tubes alone must not satisfy a partially fulfilled request",
                    hql.contains("from SampleTypeRequest r where r.sample.id = s.id"));
            assertTrue(hql.contains("r.status <> :collectedStatus or r.sampleItem is null"));
            assertTrue(hql.contains("si.typeOfSample.id = r.typeOfSample.id"));
            assertTrue("Orphan Analysis records are not a real ordered test", hql.contains("join a.test t"));
        }
    }

    @Test
    public void labelProgressRequiresUniqueRealTubeGenerationEvidenceNeverStorage() {
        for (String hql : pageAndCountHql("label_pending")) {
            assertTrue(hql.contains("from BarcodeLabelInfo label"));
            assertTrue(hql.contains("label.numPrinted > 0"));
            assertTrue(hql.contains("other.sortOrder = si.sortOrder"));
            assertFalse(hql.contains("SampleStorageAssignment"));
        }
    }

    @Test
    public void maskedSearchCannotUsePatientNamesAndNoGrantMeansNoRows() {
        dao.count(new OrderDashboardCriteria(0, 25, "secret", List.of(), null, false, null, null));
        var capture = ArgumentCaptor.forClass(String.class);
        verify(session).createQuery(capture.capture(), eq(Long.class));
        assertTrue(capture.getValue().contains("1 = 0"));
        assertFalse(capture.getValue().contains("person.firstName"));
    }

    @Test(expected = IllegalStateException.class)
    public void queryFailureEscapesInsteadOfReturningZero() {
        when(count.uniqueResult()).thenThrow(new IllegalStateException("db unavailable"));
        dao.count(criteria(null, "checklist_complete"));
    }

    @Test
    public void exactLookupIsOneBoundedScalarQueryAndPreservesAllGuards() {
        when(rows.uniqueResult()).thenReturn(new Object[] { true, false, null, true, false, true, true, true });
        var facts = dao.findIntakeFacts("42", criteria(null, "qa_pending")).orElseThrow();
        assertTrue(facts.registered());
        assertFalse(facts.collected());
        assertFalse(facts.stored());
        assertTrue(facts.savedQaSnapshot());
        assertTrue(facts.hasRejectedSpecimens());
        assertTrue(facts.hasIntakeStatusConflict());
        assertTrue(facts.hasNoActiveTests());
        verify(rows).setParameter("sampleId", "42");
        verify(rows).setMaxResults(1);
        verify(rows).setTimeout(15);
        verify(session).createQuery(endsWith("and s.id = :sampleId"), eq(Object[].class));
        verifyNoMoreInteractions(session);
    }

    @Test
    public void unfilteredCountDoesNotBindUnusedFactParameters() {
        dao.count(new OrderDashboardCriteria(0, 25, null, List.of(), null, false, null, null));
        verify(session).createQuery("select count(s.id) from Sample s where 1 = 0", Long.class);
        verify(count, never()).setParameter(anyString(), any());
    }

    private OrderDashboardCriteria criteria(String search, String status) {
        return new OrderDashboardCriteria(25, 25, search, List.of(status), OrderPriority.STAT, false,
                Date.valueOf("2026-09-01"), Date.valueOf("2026-09-05"), List.of("1", "2"), List.of("3"), false);
    }

    private List<String> pageAndCountHql(String state) {
        dao.count(criteria(null, state));
        dao.findPage(criteria(null, state));
        ArgumentCaptor<String> pageHql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> countHql = ArgumentCaptor.forClass(String.class);
        verify(session).createQuery(pageHql.capture(), eq(Object[].class));
        verify(session).createQuery(countHql.capture(), eq(Long.class));
        return List.of(pageHql.getValue(), countHql.getValue());
    }
}
