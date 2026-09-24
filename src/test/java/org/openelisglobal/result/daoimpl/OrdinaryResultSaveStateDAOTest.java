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
    public void managedProjectionExposesUnflushedDomainAndRequestChangesWithoutRefresh() {
        var dao = new OrdinaryResultSaveStateDAOImpl();
        var em = mock(EntityManager.class);
        var session = mock(Session.class);
        var config = mock(org.openelisglobal.common.util.DefaultConfigurationProperties.class);
        ReflectionTestUtils.setField(dao, "entityManager", em);
        ReflectionTestUtils.setField(dao, "configuration", config);
        when(config.getPropertyValue("domain.human")).thenReturn("H");
        when(em.unwrap(Session.class)).thenReturn(session);
        var sample = mock(org.openelisglobal.sample.valueholder.Sample.class);
        when(sample.getId()).thenReturn("301");
        when(sample.getAccessionNumber()).thenReturn("SIM-RESULT-301");
        when(sample.getDomain()).thenReturn("H");
        var time = Timestamp.from(java.time.Instant.parse("2026-09-01T01:02:03.123456Z"));
        when(sample.getReceivedTimestamp()).thenReturn(time);
        var type = mock(org.openelisglobal.typeofsample.valueholder.TypeOfSample.class);
        when(type.getId()).thenReturn("601");
        when(type.isActive()).thenReturn(true);
        var item = new SampleItem();
        item.setId("201");
        item.setSample(sample);
        item.setTypeOfSample(type);
        item.setCollectionDate(time);
        item.setReceivedDate(time);
        item.setLastupdated(time);
        var request = new org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest();
        request.setId(501);
        request.setSample(sample);
        request.setSampleItem(item);
        request.setTypeOfSample(type);
        request.setStatus(org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest.Status.COLLECTED);
        request.setRequestedTests("401");
        request.setLastupdated(time);
        var test = new org.openelisglobal.test.valueholder.Test();
        test.setId("401");
        test.setIsActive("Y");
        var analysis = new Analysis();
        analysis.setId("101");
        analysis.setTest(test);
        analysis.setSampleItem(item);
        var accepted = org.openelisglobal.result.service.ResultIntakeAdmissionTest.accepted("201", "101");
        java.util.List<Query<?>> queries = new java.util.ArrayList<>();
        when(session.createQuery(anyString(), any(Class.class))).thenAnswer(call -> {
            String hql = call.getArgument(0);
            Query<?> q = mock(Query.class, RETURNS_SELF);
            queries.add(q);
            if (hql.startsWith("from SampleItem"))
                doReturn(item).when(q).uniqueResult();
            else if (hql.startsWith("from SampleTypeRequest"))
                doReturn(java.util.List.of(request)).when(q).list();
            else if (hql.startsWith("from Analysis"))
                doReturn(java.util.List.of(analysis)).when(q).list();
            else if (hql.startsWith("select p.id"))
                doReturn(java.util.List.of("701")).when(q).list();
            else if (hql.startsWith("from SpecimenIntakeDecision"))
                doReturn(accepted.decisions()).when(q).list();
            else
                throw new AssertionError(hql);
            return q;
        });
        var current = dao.managedIntakeState("201");
        assertEquals(accepted, current);
        when(sample.getDomain()).thenReturn("E");
        assertEquals(org.openelisglobal.result.service.ResultIntakeAdmission.CHANGED,
                org.openelisglobal.result.service.ResultIntakeAdmission.reason(dao.managedIntakeState("201"), "301",
                        "201", "101", "401"));
        when(sample.getDomain()).thenReturn("H");
        request.setRequestedTests("402");
        assertEquals(org.openelisglobal.result.service.ResultIntakeAdmission.CHANGED,
                org.openelisglobal.result.service.ResultIntakeAdmission.reason(dao.managedIntakeState("201"), "301",
                        "201", "101", "401"));
        verify(em, never()).flush();
        verify(em, never()).refresh(item);
        queries.forEach(q -> {
            verify(q).setHibernateFlushMode(FlushMode.MANUAL);
            verify(q).setTimeout(15);
        });
    }

    @Test
    public void intakeProjectionBindsActualTubeAndKeepsDomainMicrosecondsAndReflexScope() {
        var dao = new OrdinaryResultSaveStateDAOImpl();
        var em = mock(EntityManager.class);
        var session = mock(Session.class);
        var config = mock(org.openelisglobal.common.util.DefaultConfigurationProperties.class);
        ReflectionTestUtils.setField(dao, "entityManager", em);
        ReflectionTestUtils.setField(dao, "configuration", config);
        when(config.getPropertyValue("domain.human")).thenReturn("H");
        when(em.unwrap(Session.class)).thenReturn(session);
        java.util.Map<String, Query<?>> queries = new java.util.LinkedHashMap<>();
        var stamp = Timestamp.from(java.time.Instant.parse("2026-09-01T01:02:03.123456Z"));
        var accepted = org.openelisglobal.result.service.ResultIntakeAdmissionTest.accepted("201", "101");
        // Dispatch only known query shapes; every query is subsequently checked for
        // its exact bound ID, explicit MANUAL flush policy and retrieval bounds.
        when(session.createQuery(anyString(), any(Class.class))).thenAnswer(call -> {
            String hql = call.getArgument(0);
            Query<?> q = mock(Query.class, RETURNS_SELF);
            queries.put(hql, q);
            if (hql.startsWith("select si.id"))
                doReturn(new Object[] { "201", "301", "SIM-RESULT-301", stamp, "601", true, stamp, stamp, stamp, null,
                        null, "H" }).when(q).uniqueResult();
            else if (hql.startsWith("select r.id"))
                doReturn(java.util.Collections.singletonList(new Object[] { 501, "301", "201", "601",
                        org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest.Status.COLLECTED, "401",
                        stamp })).when(q).list();
            else if (hql.startsWith("select a.id"))
                doReturn(java.util.List.of(new Object[] { "101", "401", "Y" }, new Object[] { "102", "402", "Y" }))
                        .when(q).list();
            else if (hql.startsWith("select p.id"))
                doReturn(java.util.List.of("701")).when(q).list();
            else if (hql.startsWith("from SpecimenIntakeDecision"))
                doReturn(accepted.decisions()).when(q).list();
            else
                throw new AssertionError("Unexpected query: " + hql);
            return q;
        });
        var state = dao.findIntakeState("201");
        assertEquals(accepted.tube(), state.tube());
        assertEquals(accepted.requests(), state.requests());
        assertEquals(java.util.List.of("701"), state.patients());
        assertEquals(2, state.tests().size());
        assertNull(org.openelisglobal.result.service.ResultIntakeAdmission.reason(state, "301", "201", "101", "401"));
        assertEquals(org.openelisglobal.result.service.ResultIntakeAdmission.TEST_CHANGED,
                org.openelisglobal.result.service.ResultIntakeAdmission.reason(state, "301", "201", "102", "402"));
        assertEquals(5, queries.size());
        queries.forEach((hql, q) -> {
            verify(q).setParameter("id", hql.startsWith("select p.id") ? "301" : "201");
            verify(q).setHibernateFlushMode(FlushMode.MANUAL);
            verify(q).setTimeout(15);
            assertTrue(hql.contains(":id"));
            assertFalse(hql.contains("201"));
            if (hql.startsWith("select a.id"))
                verify(q).setMaxResults(5001);
            else if (!hql.startsWith("select si.id"))
                verify(q).setMaxResults(2);
        });
        String patients = queries.keySet().stream().filter(q -> q.startsWith("select p.id")).findFirst().orElseThrow();
        assertTrue(patients.contains("left join Patient p on p.id = sh.patientId"));
        assertTrue(patients.contains("envWorkflowType"));
        verify(em, never()).flush();
    }

    @Test
    public void missingTubeProjectionStopsWithoutQueryingOtherPatientFacts() {
        var dao = new OrdinaryResultSaveStateDAOImpl();
        var em = mock(EntityManager.class);
        var session = mock(Session.class);
        Query<?> q = mock(Query.class, RETURNS_SELF);
        ReflectionTestUtils.setField(dao, "entityManager", em);
        when(em.unwrap(Session.class)).thenReturn(session);
        doReturn(q).when(session).createQuery(anyString(), eq(Object[].class));
        doReturn(null).when(q).uniqueResult();
        assertNull(dao.findIntakeState("999"));
        verify(q).setParameter("id", "999");
        verify(session, times(1)).createQuery(anyString(), eq(Object[].class));
        verify(em, never()).flush();
    }

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
    public void analysisVersionUsesMappedDateTypeWithoutImplicitFlush() {
        OrdinaryResultSaveStateDAOImpl dao = new OrdinaryResultSaveStateDAOImpl();
        EntityManager em = mock(EntityManager.class);
        Session session = mock(Session.class);
        Query<java.util.Date> query = mock(Query.class, RETURNS_SELF);
        ReflectionTestUtils.setField(dao, "entityManager", em);
        when(em.unwrap(Session.class)).thenReturn(session);
        when(session.createQuery("select a.lastupdated from Analysis a where a.id = :id", java.util.Date.class))
                .thenReturn(query);
        java.util.Date version = new java.util.Date(1_788_218_400_123L);
        doReturn(version).when(query).uniqueResult();

        assertEquals(String.valueOf(version.getTime()), dao.findAnalysisVersion("101"));
        verify(query).setParameter("id", "101");
        verify(query).setHibernateFlushMode(FlushMode.MANUAL);
        verify(query).setTimeout(15);
        verify(em, never()).flush();

        doReturn(null).when(query).uniqueResult();
        assertNull(dao.findAnalysisVersion("999"));
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
