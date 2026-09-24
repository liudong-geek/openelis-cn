package org.openelisglobal.sample.daoimpl;

import static org.junit.Assert.assertSame;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.Test;
import org.openelisglobal.common.provider.query.PatientSearchResults;
import org.openelisglobal.sample.dao.SearchResultsDAO;

public class LuceneSearchResultsDAOImplBoundedRoutingTest {

    @Test
    public void boundedIdentitySearch_routesToDatabaseBeforeAnyLuceneHitLimit() {
        SearchResultsDAO databaseDAO = mock(SearchResultsDAO.class);
        LuceneSearchResultsDAOImpl luceneDAO = new LuceneSearchResultsDAOImpl();
        luceneDAO.databaseSearchResultsDAO = databaseDAO;
        List<PatientSearchResults> expected = List.of(new PatientSearchResults());
        when(databaseDAO.getSearchResults("Smith", null, null, null, "N-1", null, null, null, null, null, 2_001))
                .thenReturn(expected);

        List<PatientSearchResults> actual = luceneDAO.getSearchResults("Smith", null, null, null, "N-1", null, null,
                null, null, null, 2_001);

        assertSame(expected, actual);
        verify(databaseDAO).getSearchResults("Smith", null, null, null, "N-1", null, null, null, null, null, 2_001);
    }

    @Test
    public void boundedQuickSearch_routesToDatabaseQuickContract() {
        SearchResultsDAO databaseDAO = mock(SearchResultsDAO.class);
        LuceneSearchResultsDAOImpl luceneDAO = new LuceneSearchResultsDAOImpl();
        luceneDAO.databaseSearchResultsDAO = databaseDAO;
        List<PatientSearchResults> expected = List.of(new PatientSearchResults());
        when(databaseDAO.getQuickSearchResults("needle", 2_001)).thenReturn(expected);

        List<PatientSearchResults> actual = luceneDAO.getQuickSearchResults("needle", 2_001);

        assertSame(expected, actual);
        verify(databaseDAO).getQuickSearchResults("needle", 2_001);
    }
}
