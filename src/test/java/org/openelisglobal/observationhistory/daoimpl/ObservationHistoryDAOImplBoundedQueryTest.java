package org.openelisglobal.observationhistory.daoimpl;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.RETURNS_SELF;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.persistence.EntityManager;
import java.util.List;
import org.hibernate.Session;
import org.hibernate.query.Query;
import org.junit.Test;
import org.mockito.InOrder;
import org.openelisglobal.observationhistory.valueholder.ObservationHistory;
import org.springframework.test.util.ReflectionTestUtils;

public class ObservationHistoryDAOImplBoundedQueryTest {

    @Test
    @SuppressWarnings("unchecked")
    public void referringPatientProbe_isLimitedBeforeMaterializationWithoutChangingLegacySearch() {
        EntityManager entityManager = mock(EntityManager.class);
        Session session = mock(Session.class);
        Query<ObservationHistory> query = mock(Query.class, RETURNS_SELF);
        ObservationHistoryDAOImpl dao = new ObservationHistoryDAOImpl();
        ReflectionTestUtils.setField(dao, "entityManager", entityManager);
        when(entityManager.unwrap(Session.class)).thenReturn(session);
        when(session.createQuery(anyString(), eq(ObservationHistory.class))).thenReturn(query);
        when(query.list()).thenReturn(List.of());

        dao.getObservationHistoriesByValueAndType("referring-id", "type-id", "L", 2_001);

        InOrder materializationOrder = inOrder(query);
        materializationOrder.verify(query).setMaxResults(2_001);
        materializationOrder.verify(query).list();

        reset(query);
        when(query.list()).thenReturn(List.of());
        dao.getObservationHistoriesByValueAndType("referring-id", "type-id", "L");

        verify(query, never()).setMaxResults(anyInt());
        verify(query).list();
    }
}
