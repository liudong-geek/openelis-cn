package org.openelisglobal.result.daoimpl;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import jakarta.persistence.EntityManager;
import java.sql.Timestamp;
import org.hibernate.FlushMode;
import org.hibernate.LockMode;
import org.hibernate.Session;
import org.hibernate.query.Query;
import org.junit.Test;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.SpecimenState;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.State;
import org.openelisglobal.result.exception.ResultSaveValidationException;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.springframework.test.util.ReflectionTestUtils;

/** Query contract only; no database or concurrent-write claim. */
public class OrdinaryResultSaveStateDAOTest {
    @Test
    public void scalarStateReadDoesNotFlushPreviouslyChangedManagedEntities() {
        OrdinaryResultSaveStateDAOImpl dao = new OrdinaryResultSaveStateDAOImpl();
        EntityManager entityManager = mock(EntityManager.class);
        Session session = mock(Session.class);
        Query<Object[]> query = mock(Query.class, RETURNS_SELF);
        ReflectionTestUtils.setField(dao, "entityManager", entityManager);
        when(entityManager.unwrap(Session.class)).thenReturn(session);
        when(session.createQuery(anyString(), eq(Object[].class))).thenReturn(query);
        Timestamp released = Timestamp.valueOf("2026-09-01 09:00:00");
        doReturn(new Object[] { "101", "9", released, null }).when(query).uniqueResult();

        State state = dao.findState("101");

        assertEquals("101", state.analysisId());
        assertEquals("9", state.statusId());
        assertEquals(released, state.releasedDate());
        verify(session).createQuery(
                "select a.id, a.statusId, a.releasedDate, a.printedDate from Analysis a where a.id = :id",
                Object[].class);
        verify(query).setParameter("id", "101");
        verify(query).setHibernateFlushMode(FlushMode.MANUAL);
        verify(query).setTimeout(15);
        verify(entityManager, never()).flush();
    }

    @Test
    public void missingAnalysisIsNotRepresentedAsEditableEmptyState() {
        OrdinaryResultSaveStateDAOImpl dao = new OrdinaryResultSaveStateDAOImpl();
        EntityManager entityManager = mock(EntityManager.class);
        Session session = mock(Session.class);
        Query<Object[]> query = mock(Query.class, RETURNS_SELF);
        ReflectionTestUtils.setField(dao, "entityManager", entityManager);
        when(entityManager.unwrap(Session.class)).thenReturn(session);
        when(session.createQuery(anyString(), eq(Object[].class))).thenReturn(query);
        doReturn(null).when(query).uniqueResult();
        assertNull(dao.findState("999"));
    }

    @Test
    public void specimenFactsUseOneParameterizedScalarQueryWithoutImplicitFlush() {
        OrdinaryResultSaveStateDAOImpl dao = new OrdinaryResultSaveStateDAOImpl();
        EntityManager em = mock(EntityManager.class);
        Session session = mock(Session.class);
        Query<Object[]> query = mock(Query.class, RETURNS_SELF);
        ReflectionTestUtils.setField(dao, "entityManager", em);
        when(em.unwrap(Session.class)).thenReturn(session);
        when(session.createQuery(anyString(), eq(Object[].class))).thenReturn(query);
        doReturn(new Object[] { "101", "401", "201", "301", "10", true, false }).when(query).uniqueResult();
        SpecimenState state = dao.findSpecimenState("101");
        assertEquals(new SpecimenState("101", "401", "201", "301", "10", true, false), state);
        verify(session).createQuery("select a.id, a.test.id, si.id, si.sample.id, si.statusId, si.rejected, si.voided "
                + "from Analysis a join a.sampleItem si where a.id = :id", Object[].class);
        verify(query).setParameter("id", "101");
        verify(query).setHibernateFlushMode(FlushMode.MANUAL);
        verify(query).setTimeout(15);
        verify(em, never()).flush();
        doReturn(null).when(query).uniqueResult();
        assertNull(dao.findSpecimenState("101"));
    }

    @Test
    public void specimenLockRetainsManagedObjectAndDoesNotRefreshOrFlush() {
        OrdinaryResultSaveStateDAOImpl dao = new OrdinaryResultSaveStateDAOImpl();
        EntityManager em = mock(EntityManager.class);
        Session session = mock(Session.class);
        Query<SampleItem> query = mock(Query.class, RETURNS_SELF);
        ReflectionTestUtils.setField(dao, "entityManager", em);
        when(em.unwrap(Session.class)).thenReturn(session);
        when(session.createQuery(anyString(), eq(SampleItem.class))).thenReturn(query);
        SampleItem item = new SampleItem();
        item.setId("201");
        doReturn(item).when(query).uniqueResult();
        assertSame(item, dao.lockSpecimen("201"));
        verify(session).createQuery("select si from SampleItem si where si.id = :id", SampleItem.class);
        verify(query).setParameter("id", "201");
        verify(query).setHibernateFlushMode(FlushMode.MANUAL);
        verify(query).setLockMode("si", LockMode.PESSIMISTIC_WRITE);
        verify(query).setTimeout(15);
        verify(em, never()).flush();
        verify(em, never()).refresh(item);
        doReturn(null).when(query).uniqueResult();
        assertThrows(ResultSaveValidationException.class, () -> dao.lockSpecimen("201"));
    }

    @Test
    public void analysisLockProtectsOwnershipWithoutDiscardingPreparedResultChanges() {
        OrdinaryResultSaveStateDAOImpl dao = new OrdinaryResultSaveStateDAOImpl();
        EntityManager em = mock(EntityManager.class);
        Session session = mock(Session.class);
        Query<Analysis> query = mock(Query.class, RETURNS_SELF);
        ReflectionTestUtils.setField(dao, "entityManager", em);
        when(em.unwrap(Session.class)).thenReturn(session);
        when(session.createQuery(anyString(), eq(Analysis.class))).thenReturn(query);
        Analysis analysis = new Analysis();
        analysis.setId("101");
        doReturn(analysis).when(query).uniqueResult();
        assertSame(analysis, dao.lockAnalysis("101"));
        verify(session).createQuery("select a from Analysis a where a.id = :id", Analysis.class);
        verify(query).setParameter("id", "101");
        verify(query).setHibernateFlushMode(FlushMode.MANUAL);
        verify(query).setLockMode("a", LockMode.PESSIMISTIC_WRITE);
        verify(query).setTimeout(15);
        verify(em, never()).flush();
        verify(em, never()).refresh(analysis);
        doReturn(null).when(query).uniqueResult();
        assertThrows(ResultSaveValidationException.class, () -> dao.lockAnalysis("101"));
    }
}
