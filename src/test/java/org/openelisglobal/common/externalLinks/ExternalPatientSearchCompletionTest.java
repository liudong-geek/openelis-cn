package org.openelisglobal.common.externalLinks;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.util.concurrent.Future;
import org.apache.http.HttpStatus;
import org.apache.http.client.config.RequestConfig;
import org.junit.Test;
import org.springframework.core.task.support.TaskExecutorAdapter;
import org.springframework.test.util.ReflectionTestUtils;

public class ExternalPatientSearchCompletionTest {

    @Test
    public void futureCompletesOnlyAfterSuccessfulResponseIsParsed() throws Exception {
        FixtureSearch search = configuredSearch(
                "<ExternalSearch><Patients><Patient><firstName>Li</firstName></Patient></Patients></ExternalSearch>");

        Future<Integer> future = search.runExternalSearch();

        assertEquals(Integer.valueOf(HttpStatus.SC_OK), future.get());
        assertEquals("Li", search.getSearchResults().get(0).getFirstName());
    }

    @Test
    public void malformedResponseCompletesAsBadGatewayInsteadOfEmptySuccess() throws Exception {
        FixtureSearch search = configuredSearch("<ExternalSearch/>");

        Future<Integer> future = search.runExternalSearch();

        assertEquals(Integer.valueOf(HttpStatus.SC_BAD_GATEWAY), future.get());
        assertTrue(search.getSearchResults().isEmpty());
    }

    @Test
    public void invalidConfiguredLimitFailsValidation() {
        FixtureSearch search = configuredSearch("<ExternalSearch><Patients/></ExternalSearch>");
        ReflectionTestUtils.setField(search, "maxResponseBytes", Integer.MAX_VALUE);

        assertThrows(IllegalArgumentException.class, search::validateConfiguration);
    }

    @Test
    public void invalidTimeoutFailsValidation() {
        FixtureSearch search = configuredSearch("<ExternalSearch><Patients/></ExternalSearch>");
        ReflectionTestUtils.setField(search, "timeout", 0);

        assertThrows(IllegalArgumentException.class, search::validateConfiguration);
    }

    @Test
    public void transportUsesFiniteTimeoutsAndDoesNotFollowRedirects() {
        FixtureSearch search = configuredSearch("<ExternalSearch><Patients/></ExternalSearch>");

        RequestConfig config = search.createRequestConfig();

        assertEquals(1000, config.getConnectTimeout());
        assertEquals(1000, config.getConnectionRequestTimeout());
        assertEquals(1000, config.getSocketTimeout());
        assertFalse(config.isRedirectsEnabled());
    }

    @Test
    public void configurationCannotChangeAfterSearchStarts() {
        FixtureSearch search = configuredSearch("<ExternalSearch><Patients/></ExternalSearch>");
        search.runExternalSearch();

        assertThrows(IllegalStateException.class,
                () -> search.setSearchCriteria("Other", null, null, null, null, null));
        assertThrows(IllegalStateException.class,
                () -> search.setConnectionCredentials("https://other", "other", "secret"));
    }

    private FixtureSearch configuredSearch(String response) {
        FixtureSearch search = new FixtureSearch(response);
        ReflectionTestUtils.setField(search, "timeout", 1000);
        ReflectionTestUtils.setField(search, "externalPatientSearchExecutor", new TaskExecutorAdapter(Runnable::run));
        search.setSearchCriteria("Li", null, null, null, null, null);
        search.setConnectionCredentials("https://registry.example", "user", "secret");
        return search;
    }

    private static final class FixtureSearch extends ExternalPatientSearch {

        private final String response;

        private FixtureSearch(String response) {
            this.response = response;
        }

        @Override
        protected void doSearch() {
            returnStatus = HttpStatus.SC_OK;
            setResults(response);
        }
    }
}
