package org.openelisglobal.result.daoimpl;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyZeroInteractions;
import static org.mockito.Mockito.when;

import jakarta.persistence.EntityManager;
import java.util.List;
import org.hibernate.Session;
import org.hibernate.query.Query;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.result.valueholder.Result;
import org.springframework.test.util.ReflectionTestUtils;

public class ResultDAOImplPatientHistoryTest {

    private ResultDAOImpl dao;
    private EntityManager entityManager;
    private Session session;
    private Query<Result> query;

    @Before
    @SuppressWarnings("unchecked")
    public void setUp() {
        dao = new ResultDAOImpl();
        entityManager = mock(EntityManager.class);
        session = mock(Session.class);
        query = mock(Query.class);
        ReflectionTestUtils.setField(dao, "entityManager", entityManager);
        when(entityManager.unwrap(Session.class)).thenReturn(session);
        when(session.createQuery(anyString(), eq(Result.class))).thenReturn(query);
        when(query.list()).thenReturn(List.of());
    }

    @Test
    public void patientHistoryQuery_requiresFinalizedReportableAnalysisAndResult() {
        dao.getFinalizedReportableResultsForPatient("4", "8", null);

        ArgumentCaptor<String> hql = ArgumentCaptor.forClass(String.class);
        verify(session).createQuery(hql.capture(), eq(Result.class));
        assertTrue(hql.getValue().contains("a.statusId = :finalizedStatusId"));
        assertTrue(hql.getValue().contains("a.isReportable = :reportable"));
        assertTrue(hql.getValue().contains("r.isReportable = :reportable"));
        assertTrue(hql.getValue().contains("SELECT sh.sampleId FROM SampleHuman sh"));
        assertTrue(hql.getValue().contains("sh.patientId = :patientId"));
        assertTrue(hql.getValue().contains("JOIN FETCH r.analysis a"));
        assertTrue(hql.getValue().contains("JOIN FETCH a.sampleItem si"));
        assertTrue(hql.getValue().contains("JOIN FETCH a.test t"));
        verify(query).setParameter("patientId", "4");
        verify(query).setParameter("finalizedStatusId", "8");
        verify(query).setParameter("reportable", "Y");
        verify(query, never()).setParameter(eq("testId"), anyString());
    }

    @Test
    public void patientHistoryQuery_testFilterChangesQueryAndBindsExactTest() {
        Result expected = new Result();
        expected.setId("12");
        when(query.list()).thenReturn(List.of(expected));

        List<Result> results = dao.getFinalizedReportableResultsForPatient("4", "8", "379");

        assertEquals("12", results.get(0).getId());
        ArgumentCaptor<String> hql = ArgumentCaptor.forClass(String.class);
        verify(session).createQuery(hql.capture(), eq(Result.class));
        assertTrue(hql.getValue().contains("t.id = :testId"));
        verify(query).setParameter("testId", "379");
    }

    @Test
    public void patientHistoryQuery_blankPatientOrUnresolvedStatus_failsClosedBeforeDatabase() {
        assertTrue(dao.getFinalizedReportableResultsForPatient(" ", "8", null).isEmpty());
        assertTrue(dao.getFinalizedReportableResultsForPatient("4", "-1", null).isEmpty());

        verifyZeroInteractions(entityManager);
    }
}
