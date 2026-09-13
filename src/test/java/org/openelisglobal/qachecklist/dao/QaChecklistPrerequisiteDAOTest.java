package org.openelisglobal.qachecklist.dao;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import jakarta.persistence.EntityManager;
import org.hibernate.Session;
import org.hibernate.query.Query;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.springframework.test.util.ReflectionTestUtils;

public class QaChecklistPrerequisiteDAOTest {
    private QaChecklistPrerequisiteDAOImpl dao;
    private Session session;
    private Query<Object[]> query;

    @Before
    @SuppressWarnings("unchecked")
    public void setup() {
        EntityManager em = mock(EntityManager.class);
        session = mock(Session.class);
        query = mock(Query.class);
        dao = new QaChecklistPrerequisiteDAOImpl();
        ReflectionTestUtils.setField(dao, "entityManager", em);
        when(em.unwrap(Session.class)).thenReturn(session);
        // HQL is captured and asserted below; only the database I/O is replaced.
        when(session.createQuery(anyString(), eq(Object[].class))).thenReturn(query);
    }

    @Test
    public void boundIdentifiersChangeQueryAndNullFlagsCannotBecomeComplete() {
        when(query.uniqueResult()).thenReturn(new Object[] { true, false, null, true, false, false, false }).thenReturn(null);
        var first = dao.findPrerequisites(42);
        assertTrue(first.registered());
        assertFalse(first.collected());
        assertFalse(first.stored());
        assertTrue(first.disposed());
        assertNull(dao.findPrerequisites(43));
        verify(query).setParameter("sampleId", "42");
        verify(query).setParameter("sampleId", "43");
        verify(query, times(2)).setMaxResults(1);
        verify(query, times(2)).setTimeout(15);
    }

    @Test
    public void queryRequiresOutstandingRequestsAndActualTestsInsteadOfOnlyAlreadyCollectedAnalyses() {
        dao.findPrerequisites(42);
        String hql = hql();
        assertTrue(hql.contains("from SampleTypeRequest r where r.sample.id = s.id"));
        assertTrue(hql.contains("r.status <> :cancelledStatus"));
        assertTrue(hql.contains("r.status <> :collectedStatus or r.sampleItem is null"));
        assertTrue(hql.contains("si.sample.id = s.id and si.typeOfSample.id = r.typeOfSample.id"));
        assertTrue(hql.contains("si.collectionDate is null or not exists (select a.id from Analysis a join a.test t"));
        assertTrue(hql.contains("exists (select a.id from Analysis a join a.test t where a.sampleItem.id = si.id"));
        assertFalse(hql.contains("SampleQaChecklist"));
        verify(query).setParameter("cancelledStatus", SampleTypeRequest.Status.CANCELLED);
        verify(query).setParameter("collectedStatus", SampleTypeRequest.Status.COLLECTED);
    }

    @Test
    public void environmentAndStorageRequireRealActiveMasterDataNotArbitraryMarkersOrIds() {
        dao.findPrerequisites(42);
        String hql = hql();
        assertTrue(hql.contains("site.value = cast(o.id as string)"));
        assertTrue(hql.contains("o.isActive = 'Y'"));
        for (String level : new String[] { "room", "device", "shelf", "rack", "box" }) {
            assertTrue(hql.contains("sa.locationType = '" + level + "'"));
            assertTrue(hql.contains(level + ".active = true"));
        }
        assertTrue(hql.contains("box.parentRack.parentShelf.parentDevice.parentRoom.active = true"));
        assertTrue(hql.contains("coalesce(s.storageSkipped, false) = true"));
        verify(query).setParameter("environmentType", "envWorkflowType");
        verify(query).setParameter("environmentValue", "environmental");
        verify(query).setParameter("samplingSiteType", "envSamplingSiteId");
        verify(query).setParameter("disposedStatus", "SampleDisposed");
    }

    @Test
    public void databaseErrorsEscapeInsteadOfBecomingMissingOrComplete() {
        when(query.uniqueResult()).thenThrow(new IllegalStateException("unavailable"));
        assertThrows(IllegalStateException.class, () -> dao.findPrerequisites(42));
    }

    private String hql() {
        ArgumentCaptor<String> capture = ArgumentCaptor.forClass(String.class);
        verify(session).createQuery(capture.capture(), eq(Object[].class));
        return capture.getValue();
    }
}
