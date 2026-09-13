package org.openelisglobal.sample.dao;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.LockModeType;
import java.util.List;
import org.hibernate.Session;
import org.hibernate.query.Query;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.sample.daoimpl.SpecimenReceiptDAOImpl;
import org.openelisglobal.sample.exception.EntrySubmissionException;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;

/**
 * DAO interaction contract only. SQL locking and concurrent persistence still
 * require isolated PostgreSQL.
 */
public class SpecimenReceiptDAOTest {
    private final EntityManager em = mock(EntityManager.class);
    private final EntityManagerFactory factory = mock(EntityManagerFactory.class);
    private final Session session = mock(Session.class);
    private SpecimenReceiptDAOImpl dao;

    @Before public void setup() {
        when(em.unwrap(Session.class)).thenReturn(session); when(em.isOpen()).thenReturn(true);
        var holder = new org.springframework.orm.jpa.EntityManagerHolder(em);
        holder.setSynchronizedWithTransaction(true);
        org.springframework.transaction.support.TransactionSynchronizationManager.bindResource(factory, holder);
        org.springframework.transaction.support.TransactionSynchronizationManager.setActualTransactionActive(true);
        dao = new SpecimenReceiptDAOImpl(factory);
    }

    @After
    public void cleanup() {
        org.springframework.transaction.support.TransactionSynchronizationManager.unbindResourceIfPossible(factory);
        org.springframework.transaction.support.TransactionSynchronizationManager.setActualTransactionActive(false);
    }

    @Test
    public void constructorUsesConfiguredFactoryWithoutAnEntityManagerBean() {
        try (var context = new org.springframework.context.annotation.AnnotationConfigApplicationContext()) {
            context.registerBean("entityManagerFactory", EntityManagerFactory.class, () -> factory);
            context.register(SpecimenReceiptDAOImpl.class);
            context.refresh();
            assertNotNull(context.getBean(SpecimenReceiptDAO.class));
            context.getBean(SpecimenReceiptDAO.class).requireCleanContext();
            verify(factory, never()).createEntityManager();
        }
    }

    @Test public void dirtyContextIsRejectedWithoutFlushClearOrRefresh() {
        when(session.isDirty()).thenReturn(true);
        try { dao.requireCleanContext(); fail("must preserve pending data"); }
        catch (EntrySubmissionException expected) { assertEquals(409, expected.getStatus()); }
        verify(session).isDefaultReadOnly(); verify(session).isDirty(); verifyNoMoreInteractions(session);
        verify(em, times(2)).unwrap(Session.class); verifyNoMoreInteractions(em);
    }

    @Test
    public void cleanContextIsNotCleared() {
        dao.requireCleanContext();
        verify(session).isDefaultReadOnly();
        verify(session).isDirty();
        verifyNoMoreInteractions(session);
    }

    @Test public void readOnlySessionCannotProduceFakeReceipt() {
        when(session.isDefaultReadOnly()).thenReturn(true);
        try { dao.requireCleanContext(); fail("read-only session"); }
        catch (EntrySubmissionException expected) { assertEquals(409, expected.getStatus()); }
        verify(session).isDefaultReadOnly(); verifyNoMoreInteractions(session);
    }

    private <T> void locks(String hql, Class<T> type, T row, java.util.function.Supplier<?> operation) {
        @SuppressWarnings("unchecked")
        Query<T> query = mock(Query.class, RETURNS_SELF);
        when(session.createQuery(hql, type)).thenReturn(query);
        when(query.list()).thenReturn(List.of(row));
        operation.get();
        verify(query).setParameter("id", "701");
        verify(query).setLockMode(LockModeType.PESSIMISTIC_WRITE);
        verify(query).setTimeout(15);
        verify(em).refresh(eq(row), eq(LockModeType.PESSIMISTIC_WRITE),
                argThat(map -> Integer.valueOf(15000).equals(map.get("jakarta.persistence.lock.timeout"))));
        verify(session, never()).flush();
        verify(em, never()).clear();
    }

    @Test
    public void orderIsLockedAndRefreshed() {
        locks("from Sample s where s.id = :id", Sample.class, new Sample(), () -> dao.lockOrder("701"));
    }

    @Test
    public void requestsHaveStableLockOrderAndNoStatusFiltering() {
        locks("from SampleTypeRequest r where r.sample.id = :id order by r.id", SampleTypeRequest.class,
                new SampleTypeRequest(), () -> dao.lockRequests("701"));
    }

    @Test
    public void itemsKeepVoidedRowsAndRefreshCache() {
        locks("from SampleItem si where si.sample.id = :id order by si.id", SampleItem.class, new SampleItem(),
                () -> dao.lockItems("701"));
    }

    @Test
    public void analysesKeepCanceledRowsAndRefreshCache() {
        locks("from Analysis a where a.sampleItem.sample.id = :id order by a.id", Analysis.class, new Analysis(),
                () -> dao.lockAnalyses("701"));
    }

    @Test
    public void patientQueryDoesNotChooseAnArbitraryOrEnvironmentalPatient() {
        @SuppressWarnings("unchecked")
        Query<String> query = mock(Query.class, RETURNS_SELF);
        when(session.createQuery(anyString(), eq(String.class))).thenReturn(query);
        when(query.list()).thenReturn(List.of("801", "802"));
        assertEquals(List.of("801", "802"), dao.clinicalPatientIds("701"));
        verify(session)
                .createQuery(argThat(hql -> hql.contains("sh.sampleId = :id") && hql.contains("p.id = sh.patientId")
                        && hql.contains("not exists") && hql.contains("envWorkflowType")), eq(String.class));
        verify(query).setMaxResults(2);
        verify(query).setParameter("id", "701");
    }

    @Test
    public void statusTypeIsRequiredAndMissingStatusRemainsUnknown() {
        @SuppressWarnings("unchecked")
        Query<String> query = mock(Query.class, RETURNS_SELF);
        when(session.createQuery(anyString(), eq(String.class))).thenReturn(query);
        doReturn(null).when(query).uniqueResult();
        assertNull(dao.statusName("2", "SAMPLE"));
        verify(query).setParameter("type", "SAMPLE");
        verify(query).setParameter("id", "2");
    }
}
