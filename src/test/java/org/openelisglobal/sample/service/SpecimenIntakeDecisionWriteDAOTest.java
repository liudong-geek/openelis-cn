package org.openelisglobal.sample.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.TypedQuery;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.Test;
import org.openelisglobal.referencetables.valueholder.ReferenceTables;
import org.openelisglobal.sample.daoimpl.SpecimenIntakeDecisionWriteDAOImpl;
import org.openelisglobal.sample.form.SpecimenIntakeEvidence;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Query binding and persistence ordering only; real mappings remain covered by
 * the zero-DB foundation suite.
 */
public class SpecimenIntakeDecisionWriteDAOTest {
    private final EntityManager em = mock(EntityManager.class);
    private final SpecimenIntakeDecisionWriteDAOImpl dao = new SpecimenIntakeDecisionWriteDAOImpl();

    public SpecimenIntakeDecisionWriteDAOTest() {
        ReflectionTestUtils.setField(dao, "em", em);
    }

    @Test
    public void claimsLockBothOperationAndActualTubeInStableOrder() {
        @SuppressWarnings("unchecked")
        TypedQuery<SpecimenIntakeDecision> query = mock(TypedQuery.class, RETURNS_SELF);
        when(em.createQuery(anyString(), eq(SpecimenIntakeDecision.class))).thenAnswer(c -> {
            String hql = c.getArgument(0);
            assertTrue(hql.contains("d.operationId = :operation OR d.sampleItemId = :item"));
            assertTrue(hql.endsWith("ORDER BY d.id"));
            return query;
        });
        var row = row();
        when(query.getResultList()).thenReturn(List.of(row));
        assertEquals(List.of(row), dao.lockClaims("SIM-operation", "1001"));
        verify(query).setParameter("operation", "SIM-operation");
        verify(query).setParameter("item", "1001");
        verify(query).setLockMode(LockModeType.PESSIMISTIC_WRITE);
        verify(query).setHint("jakarta.persistence.lock.timeout", 15000);
        verify(em).refresh(eq(row), eq(LockModeType.PESSIMISTIC_WRITE), anyMap());
    }

    @Test
    public void insertFlushesUniquenessBeforeReturningAndNeverMerges() {
        var row = row();
        assertSame(row, dao.insert(row));
        var order = inOrder(em);
        order.verify(em).persist(row);
        order.verify(em).flush();
        verify(em, never()).merge(any());
    }

    @Test
    public void existingRowCannotBeInsertedAgain() {
        var row = row();
        row.setId("2001");
        try {
            dao.insert(row);
            fail();
        } catch (IllegalArgumentException expected) {
        }
        verifyZeroInteractions(em);
    }

    @Test
    public void auditRecheckDoesNotRefreshAwayPendingWrites() {
        @SuppressWarnings("unchecked")
        TypedQuery<ReferenceTables> query = mock(TypedQuery.class, RETURNS_SELF);
        when(em.createQuery(anyString(), eq(ReferenceTables.class))).thenReturn(query);
        when(query.getResultList()).thenReturn(List.of());
        dao.auditReferences();
        verify(query).setParameter("names", List.of("sample_item", "specimen_intake_decision"));
        verify(em, never()).refresh(any(), any(LockModeType.class), anyMap());
        verify(query, never()).setLockMode(any());
    }

    @Test
    public void detachedGraphIsRejectedWithoutRefreshingIt() {
        var row = row();
        when(em.contains(row)).thenReturn(false);
        try {
            dao.requireManaged(List.of(row));
            fail();
        } catch (IllegalStateException expected) {
        }
        verify(em, never()).refresh(any());
    }

    private SpecimenIntakeDecision row() {
        String stamp = "2026-09-01T00:00:00Z";
        var evidence = new SpecimenIntakeEvidence(1, stamp, stamp, stamp, "11", stamp, stamp,
                List.of(new SpecimenIntakeEvidence.Analysis("1101", "31", stamp)));
        return SpecimenIntakeDecision.record("00000000-0000-4000-8000-000000000001", "701", "SIM-INTAKE-701", "801",
                "901", "1001", SpecimenIntakeDecision.Decision.ACCEPTED, null, evidence, "7",
                Clock.fixed(Instant.parse("2026-09-02T00:00:00Z"), ZoneOffset.UTC));
    }
}
