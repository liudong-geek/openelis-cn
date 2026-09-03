package org.openelisglobal.sample.daoimpl;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.springframework.test.util.ReflectionTestUtils;

public class DBSearchResultsDAOImplQuickSearchTest {

    @Test
    public void quickSearchQuery_coversPatientMasterAndPreviousLaboratoryNumber() {
        DBSearchResultsDAOImpl dao = new DBSearchResultsDAOImpl();

        String sql = ReflectionTestUtils.invokeMethod(dao, "buildQuickSearchQueryString");

        assertTrue(sql.contains("pr.primary_phone"));
        assertTrue(sql.contains("p.national_id"));
        assertTrue(sql.contains("concat_ws('', pr.last_name, pr.first_name)"));
        assertTrue(sql.contains("s.id = sh.samp_id"));
        assertTrue(sql.contains("s.accession_number"));
        assertTrue(sql.endsWith("limit 100"));
    }

    @Test
    public void quickSearch_escapesWildcardCharactersEnteredByTheUser() {
        DBSearchResultsDAOImpl dao = new DBSearchResultsDAOImpl();

        assertEquals("A\\%B\\_C\\\\D",
                ReflectionTestUtils.invokeMethod(dao, "escapeLikeValue", "A%B_C\\D"));
    }

    @Test
    public void blankOrOversizedQuickSearch_failsClosedBeforeDatabaseAccess() {
        DBSearchResultsDAOImpl dao = new DBSearchResultsDAOImpl();

        assertTrue(dao.getQuickSearchResults("  ").isEmpty());
        assertTrue(dao.getQuickSearchResults("x".repeat(101)).isEmpty());
    }
}
