package org.openelisglobal.barcode;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Map;
import org.hibernate.Session;
import org.hibernate.query.Query;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.barcode.daoimpl.BarcodeLabelGenerationDAOImpl;
import org.openelisglobal.barcode.valueholder.BarcodeLabelInfo;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.sample.valueholder.Sample;
import org.springframework.test.util.ReflectionTestUtils;

/** Query/lock contract tests only; these are not a substitute for PostgreSQL execution. */
public class BarcodeLabelGenerationDAOTest {
    private final BarcodeLabelGenerationDAOImpl dao = new BarcodeLabelGenerationDAOImpl();
    private final EntityManager entityManager = mock(EntityManager.class);
    private final Session session = mock(Session.class);

    @Before
    public void setup() {
        ReflectionTestUtils.setField(dao, "entityManager", entityManager);
        when(entityManager.unwrap(Session.class)).thenReturn(session);
    }

    @Test
    public void locksAndRefreshesOrderWithBoundedLockWait() {
        Query<Sample> query = mock(Query.class, RETURNS_SELF);
        Sample order = new Sample();
        when(session.createQuery("from Sample s where s.id = :id", Sample.class)).thenReturn(query);
        doReturn(order).when(query).uniqueResult();
        assertSame(order, dao.lockOrder("12"));
        verify(query).setParameter("id", "12");
        verify(query).setLockMode(LockModeType.PESSIMISTIC_WRITE);
        verify(query).setTimeout(15);
        verify(entityManager).refresh(order, LockModeType.PESSIMISTIC_WRITE, Map.of("jakarta.persistence.lock.timeout", 15000));
    }

    @Test
    public void exposesDuplicateCountersForFailClosedValidationInsteadOfFirstRow() {
        Query<BarcodeLabelInfo> query = mock(Query.class, RETURNS_SELF);
        BarcodeLabelInfo first = new BarcodeLabelInfo();
        BarcodeLabelInfo second = new BarcodeLabelInfo();
        when(session.createQuery("from BarcodeLabelInfo b where b.code = :code", BarcodeLabelInfo.class)).thenReturn(query);
        when(query.list()).thenReturn(List.of(first, second));
        assertEquals(2, dao.findCounters("SYNTHETIC-001").size());
        verify(query).setParameter("code", "SYNTHETIC-001");
        verify(query).setMaxResults(2);
        verify(query).setLockMode(LockModeType.PESSIMISTIC_WRITE);
        verify(entityManager).refresh(first, LockModeType.PESSIMISTIC_WRITE, Map.of("jakarta.persistence.lock.timeout", 15000));
    }

    @Test
    public void orderGuardUsesSharedCurrentFactsAndOrderStatusType() {
        Query<Boolean> query = mock(Query.class, RETURNS_SELF);
        when(session.createQuery(anyString(), eq(Boolean.class))).thenReturn(query);
        doReturn(true, false, null).when(query).uniqueResult();
        assertTrue(dao.isOrderBlocked("12"));
        assertFalse(dao.isOrderBlocked("12"));
        assertTrue(dao.isOrderBlocked("12"));
        verify(session, times(3)).createQuery(argThat(hql -> hql.contains("st.statusType = 'ORDER'")
                && hql.contains("st.statusOfSampleName = 'NonConforming'")
                && hql.contains("si.rejected = true") && hql.contains(":disposedStatus")), eq(Boolean.class));
        verify(query, times(3)).setParameter("disposedStatus", "SampleDisposed");
    }

    @Test
    public void explicitlyExcludesEnvironmentalOrdersEvenWhenTheyHavePatientLinks() {
        Query<Patient> query = mock(Query.class, RETURNS_SELF);
        when(session.createQuery(anyString(), eq(Patient.class))).thenReturn(query);
        when(query.list()).thenReturn(List.of());
        assertTrue(dao.findClinicalPatients("12").isEmpty());
        verify(session).createQuery(argThat(hql -> hql.contains("not exists") && hql.contains("oh.value = :environmentValue")), eq(Patient.class));
        verify(query).setParameter("environmentType", "envWorkflowType");
        verify(query).setParameter("environmentValue", "environmental");
        verify(query).setMaxResults(2);
    }

    @Test
    public void onlyRecognisedEnteredSpecimensAreEligible() {
        Query<Long> query = mock(Query.class, RETURNS_SELF);
        when(session.createQuery(anyString(), eq(Long.class))).thenReturn(query);
        doReturn(1L, 0L).when(query).uniqueResult();
        assertTrue(dao.isSpecimenEligible("41"));
        assertFalse(dao.isSpecimenEligible("41"));
        verify(session, times(2)).createQuery(argThat(hql -> hql.contains("st.statusType = 'SAMPLE'")
                && hql.contains("st.statusOfSampleName = 'SampleEntered'")
                && hql.contains("coalesce(si.voided, false) = false") && hql.contains("coalesce(si.rejected, false) = false")), eq(Long.class));
    }
}
