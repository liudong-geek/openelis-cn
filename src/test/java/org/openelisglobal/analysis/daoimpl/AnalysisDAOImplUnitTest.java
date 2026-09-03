package org.openelisglobal.analysis.daoimpl;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.persistence.EntityManager;
import java.sql.Timestamp;
import java.util.List;
import org.hibernate.Session;
import org.hibernate.query.Query;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.springframework.test.util.ReflectionTestUtils;

public class AnalysisDAOImplUnitTest {

    private AnalysisDAOImpl dao;
    private Session session;
    private Query<Analysis> query;

    @Before
    @SuppressWarnings("unchecked")
    public void setUp() {
        dao = new AnalysisDAOImpl();
        EntityManager entityManager = mock(EntityManager.class);
        session = mock(Session.class);
        query = mock(Query.class);
        ReflectionTestUtils.setField(dao, "entityManager", entityManager);
        when(entityManager.unwrap(Session.class)).thenReturn(session);
        when(session.createQuery(anyString(), eq(Analysis.class))).thenReturn(query);
    }

    @Test
    public void completedDateRangeExclusive_usesInclusiveStartAndExclusiveEnd() {
        Timestamp startInclusive = Timestamp.valueOf("2024-01-01 00:00:00");
        Timestamp endExclusive = Timestamp.valueOf("2024-02-01 00:00:00");
        Analysis candidate = new Analysis();
        when(query.list()).thenReturn(List.of(candidate));

        List<Analysis> result = dao.getAllAnalysisByTestsAndStatusAndCompletedDateRangeExclusive(
                List.of("11", "12"), List.of("21", "22"), List.of("31", "32"), startInclusive,
                endExclusive);

        assertEquals(List.of(candidate), result);
        ArgumentCaptor<String> hql = ArgumentCaptor.forClass(String.class);
        verify(session).createQuery(hql.capture(), eq(Analysis.class));
        assertTrue(hql.getValue().contains("a.completedDate >= :startInclusive"));
        assertTrue(hql.getValue().contains("a.completedDate < :endExclusive"));
        verify(query).setParameter("startInclusive", startInclusive);
        verify(query).setParameter("endExclusive", endExclusive);
    }
}
