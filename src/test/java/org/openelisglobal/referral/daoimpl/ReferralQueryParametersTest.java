package org.openelisglobal.referral.daoimpl;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import jakarta.persistence.EntityManager;
import java.sql.Timestamp;
import java.util.List;
import org.hibernate.Session;
import org.hibernate.query.Query;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.referral.form.ReferredOutTestsForm.ReferDateType;
import org.openelisglobal.referral.valueholder.Referral;
import org.springframework.test.util.ReflectionTestUtils;

public class ReferralQueryParametersTest {
    private ReferralDAOImpl dao;
    private Session session;
    private Query<Referral> query;

    @Before
    @SuppressWarnings("unchecked")
    public void setup() {
        dao = new ReferralDAOImpl();
        var entityManager = mock(EntityManager.class);
        session = mock(Session.class);
        query = mock(Query.class, RETURNS_SELF);
        ReflectionTestUtils.setField(dao, "entityManager", entityManager);
        when(entityManager.unwrap(Session.class)).thenReturn(session);
        // The generated HQL is captured and asserted in every query test below.
        when(session.createQuery(anyString(), eq(Referral.class))).thenReturn(query);
    }

    @Test
    public void sentQueryUsesInclusiveStartExclusiveEndAndParameterizedFilters() {
        verifyDateQuery(ReferDateType.SENT, "r.sentDate");
    }

    @Test
    public void resultQueryUsesInclusiveStartExclusiveEndAndParameterizedFilters() {
        verifyDateQuery(ReferDateType.RESULT, "a.completedDate");
    }

    @Test
    public void noDatesDoNotCreateOrBindDateParameters() {
        dao.getReferralsByTestAndDate(ReferDateType.SENT, null, null, List.of("3"), List.of("11"));
        String hql = capturedHql();
        assertFalse(hql.contains(":startDate"));
        assertFalse(hql.contains(":endDateExclusive"));
        verify(query).setParameter("testUnitIds", List.of("3"));
        verify(query).setParameter("testIds", List.of("11"));
        verify(query).list();
        verifyNoMoreInteractions(query);
    }

    private void verifyDateQuery(ReferDateType type, String column) {
        var start = Timestamp.valueOf("2026-10-05 00:00:00");
        var end = Timestamp.valueOf("2026-10-06 00:00:00");
        dao.getReferralsByTestAndDate(type, start, end, List.of("3"), List.of("11", "12"));
        String hql = capturedHql();
        assertTrue(hql, hql.contains(column + " >= :startDate"));
        assertTrue(hql, hql.contains(column + " < :endDateExclusive"));
        assertFalse(hql, hql.contains("BETWEEN"));
        assertTrue(hql, hql.contains("a.testSection.id in (:testUnitIds)"));
        assertTrue(hql, hql.contains("a.test.id in (:testIds)"));
        verify(query).setParameter("startDate", start);
        verify(query).setParameter("endDateExclusive", end);
        verify(query).setParameter("testUnitIds", List.of("3"));
        verify(query).setParameter("testIds", List.of("11", "12"));
        verify(query).list();
        verifyNoMoreInteractions(query);
    }

    private String capturedHql() {
        var hql = ArgumentCaptor.forClass(String.class);
        verify(session).createQuery(hql.capture(), eq(Referral.class));
        return hql.getValue();
    }
}
