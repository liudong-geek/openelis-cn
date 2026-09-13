package org.openelisglobal.sampletyperequest.daoimpl;

import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.RETURNS_SELF;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyZeroInteractions;
import static org.mockito.Mockito.when;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.List;
import org.hibernate.Session;
import org.hibernate.query.Query;
import org.junit.Before;
import org.junit.Test;
import org.mockito.InOrder;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Verifies query scope and lock ordering; does not claim concurrent database
 * execution.
 */
public class SampleTypeRequestCollectionLockTest {
    private static final String LOCK_QUERY = "FROM SampleTypeRequest str WHERE str.sample.id = :sampleId ORDER BY str.id";
    private final SampleTypeRequestDAOImpl dao = new SampleTypeRequestDAOImpl();
    private final EntityManager entityManager = mock(EntityManager.class);
    private final Session session = mock(Session.class);

    @Before
    public void setup() {
        ReflectionTestUtils.setField(dao, "entityManager", entityManager);
        when(entityManager.unwrap(Session.class)).thenReturn(session);
    }

    @Test
    public void locksOnlyTheRequestedApplicationInDeterministicRequestOrder() {
        Query<SampleTypeRequest> query = mock(Query.class, RETURNS_SELF);
        when(session.createQuery(LOCK_QUERY, SampleTypeRequest.class)).thenReturn(query);
        when(query.list()).thenReturn(List.of());
        dao.getRequestsBySampleIdForUpdate(" 42 ");
        verify(session).createQuery(LOCK_QUERY, SampleTypeRequest.class);
        verify(query).setParameter("sampleId", "42");
        InOrder ordered = inOrder(query);
        ordered.verify(query).setTimeout(15);
        ordered.verify(query).setHint("jakarta.persistence.lock.timeout", 15000);
        ordered.verify(query).setLockMode(LockModeType.PESSIMISTIC_WRITE);
        ordered.verify(query).list();
    }

    @Test
    public void differentApplicationsAreBoundAsDifferentParametersWithoutChangingTheQuery() {
        Query<SampleTypeRequest> query = mock(Query.class, RETURNS_SELF);
        when(session.createQuery(LOCK_QUERY, SampleTypeRequest.class)).thenReturn(query);
        when(query.list()).thenReturn(List.of());
        dao.getRequestsBySampleIdForUpdate("42");
        dao.getRequestsBySampleIdForUpdate("99");
        verify(query).setParameter("sampleId", "42");
        verify(query).setParameter("sampleId", "99");
    }

    @Test
    public void missingIdentifiersCannotAcquireAnUnscopedTableLock() {
        assertTrue(dao.getRequestsBySampleIdForUpdate(null).isEmpty());
        assertTrue(dao.getRequestsBySampleIdForUpdate("").isEmpty());
        assertTrue(dao.getRequestsBySampleIdForUpdate("  ").isEmpty());
        verifyZeroInteractions(session);
    }
}
