package org.openelisglobal.dataexchange.order.daoimpl;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import jakarta.persistence.EntityManager;
import java.sql.Timestamp;
import java.util.List;
import org.hibernate.Session;
import org.hibernate.query.Query;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.dataexchange.order.valueholder.ElectronicOrder;
import org.springframework.test.util.ReflectionTestUtils;

public class ElectronicOrderQueryParametersTest {
    private ElectronicOrderDAOImpl dao;
    private Session session;
    private Query<ElectronicOrder> query;

    @Before
    @SuppressWarnings("unchecked")
    public void setup() {
        dao = new ElectronicOrderDAOImpl();
        var em = mock(EntityManager.class);
        session = mock(Session.class);
        query = mock(Query.class, RETURNS_SELF);
        ReflectionTestUtils.setField(dao, "entityManager", em);
        when(em.unwrap(Session.class)).thenReturn(session);
        when(session.createQuery(org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.eq(ElectronicOrder.class))).thenReturn(query);
    }

    private String hql() {
        var text = ArgumentCaptor.forClass(String.class);
        verify(session).createQuery(text.capture(), org.mockito.ArgumentMatchers.eq(ElectronicOrder.class));
        return text.getValue();
    }

    @Test
    public void allFiltersUseParametersAndHalfOpenBounds() {
        var start = Timestamp.valueOf("2026-10-05 00:00:00");
        var end = Timestamp.valueOf("2026-10-06 00:00:00");
        dao.searchElectronicOrderQuery(start, end, "21", List.of("demo-1"), "demo-1");
        var h = hql();
        assertTrue(h.contains("eo.orderTimestamp >= :start"));
        assertTrue(h.contains("eo.orderTimestamp < :endExclusive"));
        assertTrue(h.contains("and eo.statusId = :statusId"));
        assertTrue(h.contains("left join fetch eo.patient"));
        assertTrue(h.contains("and (lower(eo.externalId)"));
        assertFalse(h.contains("demo-1"));
        verify(query).setParameter("start", start);
        verify(query).setParameter("endExclusive", end);
        verify(query).setParameter("statusId", "21");
        verify(query).setParameterList("identifiers", List.of("demo-1"));
        verify(query).setParameter("patientValue", "demo-1");
        verify(query).list();
        verifyNoMoreInteractions(query);
    }

    @Test
    public void noCriteriaHasNoDateStatusOrKeywordParameters() {
        dao.searchElectronicOrderQuery(null, null, null, null, null);
        var h = hql();
        assertFalse(h.contains(":start"));
        assertFalse(h.contains(":statusId"));
        assertFalse(h.contains(":patientValue"));
        assertTrue(h.endsWith("order by eo.orderTimestamp desc, eo.id desc"));
        verify(query).list();
        verifyNoMoreInteractions(query);
    }
}
