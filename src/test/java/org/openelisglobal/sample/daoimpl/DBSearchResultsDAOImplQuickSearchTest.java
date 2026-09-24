package org.openelisglobal.sample.daoimpl;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
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
import org.hibernate.query.NativeQuery;
import org.junit.Test;
import org.mockito.InOrder;
import org.springframework.test.util.ReflectionTestUtils;

public class DBSearchResultsDAOImplQuickSearchTest {

    @Test
    public void quickSearchQuery_coversPatientMasterAndPreviousLaboratoryNumber() {
        DBSearchResultsDAOImpl dao = new DBSearchResultsDAOImpl();

        String sql = ReflectionTestUtils.invokeMethod(dao, "buildQuickSearchQueryString");

        assertTrue(sql.contains("pr.primary_phone"));
        assertTrue(sql.contains("p.national_id"));
        assertTrue(sql.contains("concat_ws('', pr.last_name, pr.first_name) ilike :quickQueryCompact"));
        assertTrue(sql.contains("concat_ws('', pr.first_name, pr.last_name) ilike :quickQueryCompact"));
        assertTrue(sql.contains("s.id = sh.samp_id"));
        assertTrue(sql.contains("s.accession_number"));
        assertTrue(sql.endsWith("order by pr.last_name, pr.first_name, p.id"));
    }

    @Test
    public void quickSearch_escapesWildcardCharactersEnteredByTheUser() {
        DBSearchResultsDAOImpl dao = new DBSearchResultsDAOImpl();

        assertEquals("A\\%B\\_C\\\\D", ReflectionTestUtils.invokeMethod(dao, "escapeLikeValue", "A%B_C\\D"));
    }

    @Test
    public void blankOrOversizedQuickSearch_failsClosedBeforeDatabaseAccess() {
        DBSearchResultsDAOImpl dao = new DBSearchResultsDAOImpl();

        assertTrue(dao.getQuickSearchResults("  ").isEmpty());
        assertTrue(dao.getQuickSearchResults("x".repeat(101)).isEmpty());
    }

    @Test
    @SuppressWarnings({ "rawtypes", "unchecked" })
    public void advancedSearchProbe_isLimitedBeforeMaterializationWithoutChangingLegacySearch() {
        EntityManager entityManager = mock(EntityManager.class);
        Session session = mock(Session.class);
        NativeQuery query = mock(NativeQuery.class, RETURNS_SELF);
        DBSearchResultsDAOImpl dao = new DBSearchResultsDAOImpl() {
            @Override
            int patientIdentityTypeId(String type) {
                return 1;
            }
        };
        ReflectionTestUtils.setField(dao, "entityManager", entityManager);
        when(entityManager.unwrap(Session.class)).thenReturn(session);
        when(session.createNativeQuery(anyString())).thenReturn(query);
        when(query.list()).thenReturn(List.of());

        dao.getSearchResults("Smith", null, null, null, null, null, null, null, null, null, 2_001);

        InOrder materializationOrder = inOrder(query);
        materializationOrder.verify(query).setTimeout(DBSearchResultsDAOImpl.PATIENT_SEARCH_TIMEOUT_SECONDS);
        materializationOrder.verify(query).setMaxResults(2_001);
        materializationOrder.verify(query).list();

        reset(query);
        when(query.list()).thenReturn(List.of());
        dao.getSearchResults("Smith", null, null, null, null, null, null, null, null, null);

        verify(query, never()).setMaxResults(anyInt());
        verify(query).setTimeout(DBSearchResultsDAOImpl.PATIENT_SEARCH_TIMEOUT_SECONDS);
        verify(query).list();
    }

    @Test
    @SuppressWarnings({ "rawtypes", "unchecked" })
    public void quickSearch_appliesCallerLimitBeforeMaterializationAndKeepsLegacyCap() {
        EntityManager entityManager = mock(EntityManager.class);
        Session session = mock(Session.class);
        NativeQuery query = mock(NativeQuery.class, RETURNS_SELF);
        DBSearchResultsDAOImpl dao = new DBSearchResultsDAOImpl() {
            @Override
            int patientIdentityTypeId(String type) {
                return 1;
            }
        };
        ReflectionTestUtils.setField(dao, "entityManager", entityManager);
        when(entityManager.unwrap(Session.class)).thenReturn(session);
        when(session.createNativeQuery(anyString())).thenReturn(query);
        when(query.list()).thenReturn(List.of());

        dao.getQuickSearchResults("needle", 2_001);
        InOrder boundedOrder = inOrder(query);
        boundedOrder.verify(query).setTimeout(DBSearchResultsDAOImpl.PATIENT_SEARCH_TIMEOUT_SECONDS);
        boundedOrder.verify(query).setMaxResults(2_001);
        boundedOrder.verify(query).list();

        reset(query);
        when(query.list()).thenReturn(List.of());
        dao.getQuickSearchResults("needle");
        InOrder legacyOrder = inOrder(query);
        legacyOrder.verify(query).setTimeout(DBSearchResultsDAOImpl.PATIENT_SEARCH_TIMEOUT_SECONDS);
        legacyOrder.verify(query).setMaxResults(100);
        legacyOrder.verify(query).list();
    }

    @Test
    @SuppressWarnings({ "rawtypes", "unchecked" })
    public void quickSearch_compactsWhitespaceOnlyForCombinedPatientNames() {
        EntityManager entityManager = mock(EntityManager.class);
        Session session = mock(Session.class);
        NativeQuery query = mock(NativeQuery.class, RETURNS_SELF);
        DBSearchResultsDAOImpl dao = new DBSearchResultsDAOImpl() {
            @Override
            int patientIdentityTypeId(String type) {
                return 1;
            }
        };
        ReflectionTestUtils.setField(dao, "entityManager", entityManager);
        when(entityManager.unwrap(Session.class)).thenReturn(session);
        when(session.createNativeQuery(anyString())).thenReturn(query);
        when(query.list()).thenReturn(List.of());

        dao.getQuickSearchResults(" Zhang  San\u3000", 25);

        verify(query).setParameter("quickQuery", "%Zhang  San\u3000%");
        verify(query).setParameter("quickQueryCompact", "%ZhangSan%");
    }
}
