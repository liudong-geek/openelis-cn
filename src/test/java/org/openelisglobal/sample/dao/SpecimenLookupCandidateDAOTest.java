package org.openelisglobal.sample.dao;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import jakarta.persistence.EntityManager;
import java.util.List;
import org.hibernate.Session;
import org.hibernate.query.Query;
import org.junit.Before;
import org.junit.Test;
import org.springframework.test.util.ReflectionTestUtils;

public class SpecimenLookupCandidateDAOTest {
    private SpecimenLookupCandidateDAO dao;
    private Query<Object[]> orderQuery;
    private Query<Object[]> tubeQuery;

    @Before
    @SuppressWarnings("unchecked")
    public void setUp() {
        dao = new SpecimenLookupCandidateDAO();
        EntityManager em = mock(EntityManager.class);
        Session session = mock(Session.class);
        orderQuery = mock(Query.class, RETURNS_SELF);
        tubeQuery = mock(Query.class, RETURNS_SELF);
        when(em.unwrap(Session.class)).thenReturn(session);
        when(session.createQuery(anyString(), eq(Object[].class)))
                .thenAnswer(call -> ((String) call.getArgument(0)).contains("from SampleItem") ? tubeQuery : orderQuery);
        ReflectionTestUtils.setField(dao, "entityManager", em);
        when(orderQuery.list()).thenReturn(List.of());
        when(tubeQuery.list()).thenReturn(List.of());
    }

    @Test
    public void dottedAccessionsAndRealTubeCodeCollisionRemainTwoIdentities() {
        when(orderQuery.list()).thenReturn(List.<Object[]>of(new Object[] { "301", "SIM.1.2", "H" }));
        when(tubeQuery.list()).thenReturn(List.<Object[]>of(new Object[] { "801", "302", "SIM.1", "H", "2" }));
        var matches = dao.exactMatches("SIM.1.2");
        assertEquals(2, matches.matches().size());
        assertFalse(matches.matches().get(0).specimen());
        assertTrue(matches.matches().get(1).specimen());
    }

    @Test
    public void duplicatePhysicalCodesAreNotCollapsedOrPickedFirst() {
        when(tubeQuery.list()).thenReturn(List.<Object[]>of(new Object[] { "801", "301", "SIM.1", "H", "2" },
                new Object[] { "802", "301", "SIM.1", "H", "2" }));
        assertEquals(2, dao.exactMatches("SIM.1.2").matches().size());
    }

    @Test
    public void logicalTubeNumberWithoutPhysicalItemDoesNotBecomeTubeCandidate() {
        assertTrue(dao.exactMatches("SIM.1.2").matches().isEmpty());
    }

    @Test
    public void wrongSortOrderOrExternalCodeCannotBeInferredFromPrefix() {
        when(tubeQuery.list()).thenReturn(List.<Object[]>of(new Object[] { "801", "301", "SIM.1", "H", "3" }));
        assertTrue(dao.exactMatches("SIM.1.2").matches().isEmpty());
    }
}
