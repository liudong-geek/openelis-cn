package org.openelisglobal.sample.service;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;
import org.openelisglobal.sample.dao.SpecimenIntakeDecisionDAO;
import org.openelisglobal.sample.daoimpl.SpecimenIntakeDecisionDAOImpl;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * HQL/binding contract only; actual PostgreSQL integration remains a separate
 * gate.
 */
public class SpecimenIntakeDecisionDAOTest {
    @Test
    public void oneBoundQueryFindsTheTubeEvenIfItsOriginalOrderHasChanged() {
        var em = mock(EntityManager.class);
        TypedQuery<SpecimenIntakeDecision> query = mock(TypedQuery.class);
        var dao = new SpecimenIntakeDecisionDAOImpl();
        ReflectionTestUtils.setField(dao, "entityManager", em);
        String hql = "FROM SpecimenIntakeDecision d WHERE d.sampleItemId IN :ids ORDER BY d.id";
        when(em.createQuery(hql, SpecimenIntakeDecision.class)).thenReturn(query);
        when(query.setParameter("ids", List.of("801", "802"))).thenReturn(query);
        var rows = List.of(SpecimenIntakeDecisionTest.row("801", SpecimenIntakeDecision.Decision.REJECTED));
        when(query.getResultList()).thenReturn(rows);
        assertSame(rows, dao.findForTubes(List.of("801", "802")));
        verify(em).createQuery(hql, SpecimenIntakeDecision.class);
        verify(query).setParameter("ids", List.of("801", "802"));
        verify(query).getResultList();
        verifyNoMoreInteractions(em, query);
        assertEquals(List.of("activeRejectionReasons", "findForTubes"),
                Arrays.stream(SpecimenIntakeDecisionDAO.class.getMethods()).map(m -> m.getName()).sorted().toList());
    }

    @Test
    public void emptyOrInvalidIdsDoNotTouchTheDatabase() {
        var em = mock(EntityManager.class);
        var dao = new SpecimenIntakeDecisionDAOImpl();
        ReflectionTestUtils.setField(dao, "entityManager", em);
        assertEquals(List.of(), dao.findForTubes(List.of()));
        assertThrows(IllegalArgumentException.class, () -> dao.findForTubes(List.of("801", "0")));
        assertThrows(IllegalArgumentException.class, () -> dao.findForTubes(List.of("2147483648")));
        assertThrows(IllegalArgumentException.class, () -> dao.findForTubes(null));
        verifyZeroInteractions(em);
    }

    @Test
    public void catalogIsBoundLimitedAndFetchesCategoryWithinTheReadTransaction() {
        var em = mock(EntityManager.class);
        TypedQuery<org.openelisglobal.dictionary.valueholder.Dictionary> query = mock(TypedQuery.class);
        var dao = new SpecimenIntakeDecisionDAOImpl();
        ReflectionTestUtils.setField(dao, "entityManager", em);
        String hql = "FROM Dictionary d JOIN FETCH d.dictionaryCategory c WHERE d.isActive = :active AND c.categoryName = :category ORDER BY d.id";
        when(em.createQuery(hql, org.openelisglobal.dictionary.valueholder.Dictionary.class)).thenReturn(query);
        when(query.setParameter("active", "Y")).thenReturn(query);
        when(query.setParameter("category", "resultRejectionReasons")).thenReturn(query);
        when(query.setMaxResults(1001)).thenReturn(query);
        when(query.getResultList()).thenReturn(List.of());
        assertEquals(List.of(), dao.activeRejectionReasons());
        verify(query).setParameter("active", "Y");
        verify(query).setParameter("category", "resultRejectionReasons");
        verify(query).setMaxResults(1001);
        verify(query).getResultList();
    }
}
