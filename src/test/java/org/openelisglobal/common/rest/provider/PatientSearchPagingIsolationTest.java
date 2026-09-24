package org.openelisglobal.common.rest.provider;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyZeroInteractions;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.hl7.fhir.instance.model.api.IBaseBundle;
import org.hl7.fhir.r4.model.Bundle;
import org.hl7.fhir.r4.model.OperationOutcome;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.externalLinks.ExternalPatientSearchException;
import org.openelisglobal.common.provider.query.PatientSearchResults;
import org.openelisglobal.common.provider.query.PatientSearchResultsForm;
import org.openelisglobal.common.provider.query.workerObjects.PatientSearchWorker;
import org.openelisglobal.common.rest.util.PatientSearchResultsPaging;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.search.service.SearchResultsService;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.web.server.ResponseStatusException;

public class PatientSearchPagingIsolationTest {

    private static final String ACTOR = "7";
    private static final String REGISTRY_BASE = "https://registry.test";
    private PatientSearchResultsPaging paging;

    @Before
    public void setUp() {
        paging = new PatientSearchResultsPaging(2);
    }

    @Test
    public void initialSearchCreatesRandomQueryAndAccuratePages() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        PatientSearchResultsForm first = new PatientSearchResultsForm();
        paging.setDatabaseResults(request, ACTOR, first, patients("A", 5), "criteria-a");

        assertNotNull(UUID.fromString(first.getQueryId()));
        assertEquals(5, first.getTotalItems());
        assertEquals("1", first.getPaging().getCurrentPage());
        assertEquals("3", first.getPaging().getTotalPages());
        assertPatientIds(first, "A-1", "A-2");

        PatientSearchResultsForm second = new PatientSearchResultsForm();
        paging.setDatabaseResults(request, ACTOR, second, patients("B", 1), "criteria-b");
        assertNotEquals(first.getQueryId(), second.getQueryId());
    }

    @Test
    public void interleavedQueriesInOneSessionRemainIsolated() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        PatientSearchResultsForm queryA = new PatientSearchResultsForm();
        PatientSearchResultsForm queryB = new PatientSearchResultsForm();
        paging.setDatabaseResults(request, ACTOR, queryA, patients("A", 4), "criteria-a");
        paging.setDatabaseResults(request, ACTOR, queryB, patients("B", 3), "criteria-b");

        PatientSearchResultsForm aPageTwo = new PatientSearchResultsForm();
        paging.page(request, ACTOR, aPageTwo, queryA.getQueryId(), "criteria-a", "2");
        assertPatientIds(aPageTwo, "A-3", "A-4");
        assertEquals(4, aPageTwo.getTotalItems());

        PatientSearchResultsForm bPageTwo = new PatientSearchResultsForm();
        paging.page(request, ACTOR, bPageTwo, queryB.getQueryId(), "criteria-b", "2");
        assertPatientIds(bPageTwo, "B-3");
        assertEquals(3, bPageTwo.getTotalItems());
    }

    @Test
    public void queryIdCannotBeUsedByAnotherSession() throws Exception {
        MockHttpServletRequest owner = new MockHttpServletRequest();
        PatientSearchResultsForm initial = new PatientSearchResultsForm();
        paging.setDatabaseResults(owner, ACTOR, initial, patients("A", 3), "criteria-a");

        MockHttpServletRequest otherSession = new MockHttpServletRequest();
        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> paging.page(otherSession,
                ACTOR, new PatientSearchResultsForm(), initial.getQueryId(), "criteria-a", "1"));
        assertEquals(HttpStatus.BAD_REQUEST.value(), error.getStatusCode().value());
    }

    @Test
    public void criteriaSignatureNormalizesNullEmptyAndWhitespaceToTheSameSearch() {
        String nullSignature = PatientSearchRestController.criteriaSignature(null, null, null, null, null, null, null,
                null, null, null, null, null);
        String emptySignature = PatientSearchRestController.criteriaSignature("", "", "", "", "", "", "", "", "", "",
                "", "");
        String whitespaceSignature = PatientSearchRestController.criteriaSignature("  ", "\t", "\r\n", " ", "\t ", "  ",
                " ", "\n", "\r", "\t", " ", "  ");
        assertEquals(nullSignature, emptySignature);
        assertEquals(nullSignature, whitespaceSignature);
    }

    @Test
    public void lengthPrefixedCriteriaRejectAmbiguousConcatenations() throws Exception {
        String firstSignature = PatientSearchRestController.criteriaSignature("ab", "c", null, null, null, null, null,
                null, null, null, null, null);
        String secondSignature = PatientSearchRestController.criteriaSignature("a", "bc", null, null, null, null, null,
                null, null, null, null, null);
        assertNotEquals(firstSignature, secondSignature);

        MockHttpServletRequest request = new MockHttpServletRequest();
        PatientSearchResultsForm initial = new PatientSearchResultsForm();
        paging.setDatabaseResults(request, ACTOR, initial, patients("A", 1), firstSignature);
        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> paging.page(request, ACTOR,
                new PatientSearchResultsForm(), initial.getQueryId(), secondSignature, "1"));
        assertEquals(HttpStatus.BAD_REQUEST.value(), error.getStatusCode().value());
    }

    @Test
    public void queryCacheEvictsLeastRecentlyUsedEntryAfterEightSearches() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        List<PatientSearchResultsForm> searches = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            PatientSearchResultsForm form = new PatientSearchResultsForm();
            paging.setDatabaseResults(request, ACTOR, form, patients("Q" + i, 1), "criteria-" + i);
            searches.add(form);
        }

        paging.page(request, ACTOR, new PatientSearchResultsForm(), searches.get(0).getQueryId(), "criteria-0", "1");
        paging.setDatabaseResults(request, ACTOR, new PatientSearchResultsForm(), patients("Q8", 1), "criteria-8");

        ResponseStatusException evicted = assertThrows(ResponseStatusException.class, () -> paging.page(request, ACTOR,
                new PatientSearchResultsForm(), searches.get(1).getQueryId(), "criteria-1", "1"));
        assertEquals(HttpStatus.BAD_REQUEST.value(), evicted.getStatusCode().value());

        PatientSearchResultsForm retained = new PatientSearchResultsForm();
        paging.page(request, ACTOR, retained, searches.get(0).getQueryId(), "criteria-0", "1");
        assertPatientIds(retained, "Q0-1");
    }

    @Test
    public void invalidScopedPagesReturnBadRequest() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        PatientSearchResultsForm initial = new PatientSearchResultsForm();
        paging.setDatabaseResults(request, ACTOR, initial, patients("A", 3), "criteria-a");

        for (String invalid : List.of("", "0", "-1", "one", "+1", "3")) {
            ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> paging.page(request,
                    ACTOR, new PatientSearchResultsForm(), initial.getQueryId(), "criteria-a", invalid));
            assertEquals(HttpStatus.BAD_REQUEST.value(), error.getStatusCode().value());
        }
    }

    @Test
    public void legacyPageOnlyRequestHasAccurateTotalAndStrictBounds() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        PatientSearchResultsForm initial = new PatientSearchResultsForm();
        paging.setDatabaseResults(request, ACTOR, initial, patients("A", 3), "criteria-a");

        PatientSearchResultsForm pageTwo = new PatientSearchResultsForm();
        paging.page(request, ACTOR, pageTwo, "criteria-a", "2");
        assertPatientIds(pageTwo, "A-3");
        assertEquals(initial.getQueryId(), pageTwo.getQueryId());
        assertEquals(3, pageTwo.getTotalItems());
        assertEquals("2", pageTwo.getPaging().getCurrentPage());
        assertEquals("2", pageTwo.getPaging().getTotalPages());

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> paging.page(request, ACTOR, new PatientSearchResultsForm(), "criteria-a", "9"));
        assertEquals(HttpStatus.BAD_REQUEST.value(), error.getStatusCode().value());
    }

    @Test
    public void legacyPatientPagingRemainsIsolatedWhenNonPatientCacheIsInterleaved() throws Exception {
        MockHttpSession session = new MockHttpSession();
        Object firstNonPatientPages = List.of(List.of("SIM first non-patient result"));
        session.setAttribute(IActionConstants.RESULTS_SESSION_CACHE, firstNonPatientPages);
        MockHttpServletRequest request = request(session);
        paging.setDatabaseResults(request, ACTOR, new PatientSearchResultsForm(), patients("A", 3), "criteria-a");
        assertSame(firstNonPatientPages, session.getAttribute(IActionConstants.RESULTS_SESSION_CACHE));

        Object laterNonPatientPages = List.of(List.of("SIM later non-patient result"));
        Object laterNonPatientMapping = List.of("SIM later non-patient mapping");
        session.setAttribute(IActionConstants.RESULTS_SESSION_CACHE, laterNonPatientPages);
        session.setAttribute(IActionConstants.RESULTS_PAGE_MAPPING_SESSION_CACHE, laterNonPatientMapping);

        PatientSearchResultsForm pageTwo = new PatientSearchResultsForm();
        paging.page(request, ACTOR, pageTwo, "criteria-a", "2");
        assertPatientIds(pageTwo, "A-3");
        assertSame(laterNonPatientPages, session.getAttribute(IActionConstants.RESULTS_SESSION_CACHE));
        assertSame(laterNonPatientMapping, session.getAttribute(IActionConstants.RESULTS_PAGE_MAPPING_SESSION_CACHE));
    }

    @Test
    public void exactLabNumberMissDoesNotReplaceLegacyCache() throws Exception {
        MockHttpSession session = new MockHttpSession();
        MockHttpServletRequest seedRequest = request(session);
        setActor(session, 7);
        String legacyCriteria = PatientSearchRestController.criteriaSignature(null, null, null, null, null, null, null,
                null, null, null, null, null);
        paging.setDatabaseResults(seedRequest, ACTOR, new PatientSearchResultsForm(), patients("OLD", 2),
                legacyCriteria);

        TestPatientSearchController controller = new TestPatientSearchController(paging);
        controller.sampleService = mock(SampleService.class);
        when(controller.sampleService.getSampleByAccessionNumber("UNKNOWN")).thenReturn(null);

        MockHttpServletRequest missRequest = request(session);
        PatientSearchResultsForm miss = controller.getPatientResults(missRequest, null, null, null, null, null, null,
                "UNKNOWN", null, null, null, null);
        assertTrue(miss.getPatientSearchResults().isEmpty());
        assertEquals(0, miss.getTotalItems());
        assertNotNull(miss.getQueryId());

        MockHttpServletRequest legacyRequest = request(session);
        legacyRequest.setParameter("page", "1");
        PatientSearchResultsForm legacy = controller.getPatientResults(legacyRequest, null, null, null, null, null,
                null, null, null, null, null, null);
        assertPatientIds(legacy, "OLD-1", "OLD-2");
        assertEquals(2, legacy.getTotalItems());
    }

    @Test
    public void exactLabNumberMissCannotInsertOrEvictLegacyContextWhenCacheIsFull() throws Exception {
        MockHttpSession session = new MockHttpSession();
        setActor(session, 7);
        List<PatientSearchResultsForm> earlierSearches = new ArrayList<>();
        for (int i = 0; i < 7; i++) {
            PatientSearchResultsForm form = new PatientSearchResultsForm();
            paging.setDatabaseResults(request(session), ACTOR, form, patients("Q" + i, 1), "criteria-" + i);
            earlierSearches.add(form);
        }
        PatientSearchResultsForm retainedLegacy = new PatientSearchResultsForm();
        paging.setDatabaseResults(request(session), ACTOR, retainedLegacy, patients("KEEP", 2), "keep");
        // Make the current legacy query the least-recently-used entry. A transient
        // empty search must not insert a ninth context and evict it.
        for (int i = 0; i < earlierSearches.size(); i++) {
            PatientSearchResultsForm earlier = earlierSearches.get(i);
            paging.page(request(session), ACTOR, new PatientSearchResultsForm(), earlier.getQueryId(), "criteria-" + i,
                    "1");
        }

        TestPatientSearchController controller = new TestPatientSearchController(paging);
        controller.sampleService = mock(SampleService.class);
        when(controller.sampleService.getSampleByAccessionNumber("UNKNOWN")).thenReturn(null);
        PatientSearchResultsForm miss = controller.getPatientResults(request(session), null, null, null, null, null,
                null, "UNKNOWN", null, null, null, null);

        assertTrue(miss.getPatientSearchResults().isEmpty());
        assertNotNull(miss.getQueryId());
        ResponseStatusException transientQuery = assertThrows(ResponseStatusException.class, () -> paging.page(
                request(session), ACTOR, new PatientSearchResultsForm(), miss.getQueryId(), PatientSearchRestController
                        .criteriaSignature(null, null, null, null, null, null, "UNKNOWN", null, null, null, null, null),
                "1"));
        assertEquals(HttpStatus.BAD_REQUEST.value(), transientQuery.getStatusCode().value());

        PatientSearchResultsForm legacy = new PatientSearchResultsForm();
        paging.page(request(session), ACTOR, legacy, "keep", "1");
        assertPatientIds(legacy, "KEEP-1", "KEEP-2");
        assertEquals(retainedLegacy.getQueryId(), legacy.getQueryId());
    }

    @Test
    public void criteriaBearingPageUsesSnapshotWithoutRepeatingSearch() throws Exception {
        MockHttpSession session = new MockHttpSession();
        MockHttpServletRequest seedRequest = request(session);
        String signature = PatientSearchRestController.criteriaSignature(null, null, null, null, null, null, null, null,
                null, "needle", "true", null);
        PatientSearchResultsForm initial = new PatientSearchResultsForm();
        setActor(session, 7);
        paging.setDatabaseResults(seedRequest, ACTOR, initial, patients("A", 3), signature);

        TestPatientSearchController controller = new TestPatientSearchController(paging);
        controller.searchResultsService = mock(SearchResultsService.class);
        MockHttpServletRequest pageRequest = request(session);
        pageRequest.setParameter("page", "2");
        pageRequest.setParameter("queryId", initial.getQueryId());
        pageRequest.setParameter("quickQuery", "needle");
        pageRequest.setParameter("suppressExternalSearch", "true");

        PatientSearchResultsForm pageTwo = controller.getPatientResults(pageRequest, null, null, null, null, null, null,
                null, null, null, "needle", "true");
        assertPatientIds(pageTwo, "A-3");
        verify(controller.searchResultsService, never()).getQuickSearchResults("needle");
        verify(controller.searchResultsService, never()).getQuickSearchResults("needle",
                PatientSearchResultsPaging.MAX_CACHED_ROWS + 1);
    }

    @Test
    public void oldClientCanPageLatestPatientSearchWhileRepeatingCriteriaWithoutQueryId() throws Exception {
        MockHttpSession session = new MockHttpSession();
        setActor(session, 7);
        String signature = PatientSearchRestController.criteriaSignature(null, null, null, null, null, null, null, null,
                null, "needle", "true", null);
        paging.setDatabaseResults(request(session), ACTOR, new PatientSearchResultsForm(), patients("A", 3), signature);

        TestPatientSearchController controller = new TestPatientSearchController(paging);
        controller.searchResultsService = mock(SearchResultsService.class);

        MockHttpServletRequest legacyPage = request(session);
        legacyPage.setParameter("page", "2");
        legacyPage.setParameter("quickQuery", "needle");
        legacyPage.setParameter("suppressExternalSearch", "true");
        PatientSearchResultsForm legacyPageTwo = controller.getPatientResults(legacyPage, null, null, null, null, null,
                null, null, null, null, "needle", "true");
        assertPatientIds(legacyPageTwo, "A-3");
        verify(controller.searchResultsService, never()).getQuickSearchResults("needle");
        verify(controller.searchResultsService, never()).getQuickSearchResults("needle",
                PatientSearchResultsPaging.MAX_CACHED_ROWS + 1);
    }

    @Test
    public void oldClientCannotPageAStaleSearchAfterAnotherTabReplacesTheLatestSnapshot() throws Exception {
        MockHttpSession session = new MockHttpSession();
        setActor(session, 7);
        String firstSignature = PatientSearchRestController.criteriaSignature(null, null, null, null, null, null, null,
                null, null, "first", "true", null);
        String secondSignature = PatientSearchRestController.criteriaSignature(null, null, null, null, null, null, null,
                null, null, "second", "true", null);
        paging.setDatabaseResults(request(session), ACTOR, new PatientSearchResultsForm(), patients("A", 3),
                firstSignature);
        paging.setDatabaseResults(request(session), ACTOR, new PatientSearchResultsForm(), patients("B", 3),
                secondSignature);

        TestPatientSearchController controller = new TestPatientSearchController(paging);
        controller.searchResultsService = mock(SearchResultsService.class);
        MockHttpServletRequest stalePage = request(session);
        stalePage.setParameter("page", "2");
        stalePage.setParameter("quickQuery", "first");
        stalePage.setParameter("suppressExternalSearch", "true");

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> controller
                .getPatientResults(stalePage, null, null, null, null, null, null, null, null, null, "first", "true"));

        assertEquals(HttpStatus.BAD_REQUEST.value(), error.getStatusCode().value());
        verify(controller.searchResultsService, never()).getQuickSearchResults("first");
        verify(controller.searchResultsService, never()).getQuickSearchResults("first",
                PatientSearchResultsPaging.MAX_CACHED_ROWS + 1);
    }

    @Test
    public void blankLegacyPageParameterIsAnInitialSearch() {
        assertFalse(PatientSearchRestController.isPageRequest(null));
        assertFalse(PatientSearchRestController.isPageRequest(""));
        assertFalse(PatientSearchRestController.isPageRequest("  \t"));
        assertTrue(PatientSearchRestController.isPageRequest("1"));
    }

    @Test
    public void sameSessionAuthenticatedActorChangeInvalidatesQuery() throws Exception {
        MockHttpSession session = new MockHttpSession();
        setActor(session, 7);
        String signature = PatientSearchRestController.criteriaSignature(null, null, null, null, null, null, null, null,
                null, "needle", "true", null);
        PatientSearchResultsForm initial = new PatientSearchResultsForm();
        paging.setDatabaseResults(request(session), ACTOR, initial, patients("A", 3), signature);

        setActor(session, 8);
        TestPatientSearchController controller = new TestPatientSearchController(paging);
        MockHttpServletRequest pageRequest = request(session);
        pageRequest.setParameter("page", "2");
        pageRequest.setParameter("queryId", initial.getQueryId());
        pageRequest.setParameter("actor", ACTOR);
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> controller.getPatientResults(pageRequest, null, null, null, null, null, null, null, null, null,
                        "needle", "true"));
        assertEquals(HttpStatus.BAD_REQUEST.value(), error.getStatusCode().value());
    }

    @Test
    public void technicalRowLimitRejectsOneOversizedSearchWithoutDiscardingExistingContext() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        PatientSearchResultsForm retained = new PatientSearchResultsForm();
        paging.setDatabaseResults(request, ACTOR, retained, patients("KEEP", 1), "keep");

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> paging.setDatabaseResults(request, ACTOR, new PatientSearchResultsForm(),
                        patients("TOO-MANY", PatientSearchResultsPaging.MAX_CACHED_ROWS + 1), "too-many"));
        assertEquals(HttpStatus.BAD_REQUEST.value(), error.getStatusCode().value());
        assertEquals("Patient search returned too many rows; narrow the search criteria", error.getReason());

        PatientSearchResultsForm stillPresent = new PatientSearchResultsForm();
        paging.page(request, ACTOR, stillPresent, retained.getQueryId(), "keep", "1");
        assertPatientIds(stillPresent, "KEEP-1");
    }

    @Test
    public void technicalTotalRowLimitEvictsLeastRecentlyUsedContextsUntilItFits() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        PatientSearchResultsForm first = new PatientSearchResultsForm();
        PatientSearchResultsForm second = new PatientSearchResultsForm();
        int halfLimit = PatientSearchResultsPaging.MAX_CACHED_ROWS / 2;
        paging.setDatabaseResults(request, ACTOR, first, patients("FIRST", halfLimit), "first");
        paging.setDatabaseResults(request, ACTOR, second, patients("SECOND", halfLimit), "second");

        paging.page(request, ACTOR, new PatientSearchResultsForm(), first.getQueryId(), "first", "1");
        PatientSearchResultsForm newest = new PatientSearchResultsForm();
        paging.setDatabaseResults(request, ACTOR, newest, patients("NEW", 1), "new");

        ResponseStatusException evicted = assertThrows(ResponseStatusException.class,
                () -> paging.page(request, ACTOR, new PatientSearchResultsForm(), second.getQueryId(), "second", "1"));
        assertEquals(HttpStatus.BAD_REQUEST.value(), evicted.getStatusCode().value());
        paging.page(request, ACTOR, new PatientSearchResultsForm(), first.getQueryId(), "first", "1");
        paging.page(request, ACTOR, new PatientSearchResultsForm(), newest.getQueryId(), "new", "1");
    }

    @Test
    public void invalidScopedPageDoesNotRefreshLeastRecentlyUsedContext() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        List<PatientSearchResultsForm> searches = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            PatientSearchResultsForm form = new PatientSearchResultsForm();
            paging.setDatabaseResults(request, ACTOR, form, patients("Q" + i, 1), "criteria-" + i);
            searches.add(form);
        }

        assertThrows(ResponseStatusException.class, () -> paging.page(request, ACTOR, new PatientSearchResultsForm(),
                searches.get(0).getQueryId(), "wrong-criteria", "1"));
        paging.setDatabaseResults(request, ACTOR, new PatientSearchResultsForm(), patients("Q8", 1), "criteria-8");

        assertThrows(ResponseStatusException.class, () -> paging.page(request, ACTOR, new PatientSearchResultsForm(),
                searches.get(0).getQueryId(), "criteria-0", "1"));
        paging.page(request, ACTOR, new PatientSearchResultsForm(), searches.get(1).getQueryId(), "criteria-1", "1");
    }

    @Test
    public void missingActorIsRejectedBeforeQuickSearch() {
        MockHttpSession session = new MockHttpSession();
        setActor(session, 0);
        TestPatientSearchController controller = new TestPatientSearchController(paging);
        controller.searchResultsService = mock(SearchResultsService.class);

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> controller.getPatientResults(request(session), null, null, null, null, null, null, null, null,
                        null, "needle", "true"));

        assertEquals(HttpStatus.FORBIDDEN.value(), error.getStatusCode().value());
        verifyZeroInteractions(controller.searchResultsService);
    }

    @Test
    public void quickSearchUsesBoundedProbeAndRejectsOverflowBeforeSnapshot() {
        MockHttpSession session = new MockHttpSession();
        setActor(session, 7);
        TestPatientSearchController controller = new TestPatientSearchController(paging);
        controller.searchResultsService = mock(SearchResultsService.class);
        when(controller.searchResultsService.getQuickSearchResults("needle",
                PatientSearchResultsPaging.MAX_CACHED_ROWS + 1))
                .thenReturn(patients("OVERFLOW", PatientSearchResultsPaging.MAX_CACHED_ROWS + 1));

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> controller.getPatientResults(request(session), null, null, null, null, null, null, null, null,
                        null, "needle", "true"));

        assertEquals(HttpStatus.BAD_REQUEST.value(), error.getStatusCode().value());
        verify(controller.searchResultsService).getQuickSearchResults("needle",
                PatientSearchResultsPaging.MAX_CACHED_ROWS + 1);
    }

    @Test
    public void legacyEndpointUsesBoundedProbeAndRejectsOverflow() {
        MockHttpSession session = new MockHttpSession();
        setActor(session, 7);
        TestPatientSearchController controller = new TestPatientSearchController(paging);
        controller.searchResultsService = mock(SearchResultsService.class);
        when(controller.searchResultsService.getSearchResults("Smith", null, null, null, null, null, null, null, null,
                null, PatientSearchResultsPaging.MAX_CACHED_ROWS + 1))
                .thenReturn(patients("OVERFLOW", PatientSearchResultsPaging.MAX_CACHED_ROWS + 1));

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> controller
                .getSearchResults(request(session), "Smith", null, null, null, null, null, null, null, null, null));

        assertEquals(HttpStatus.BAD_REQUEST.value(), error.getStatusCode().value());
    }

    @Test
    public void clientRegistryCollectorFollowsNextPagesAndCountsOnlyPatients() {
        Bundle first = patientBundle("A", 0, 2);
        first.addEntry().setResource(new OperationOutcome());
        first.addLink().setRelation(IBaseBundle.LINK_NEXT).setUrl("https://registry.test/page/2");
        Bundle second = patientBundle("B", 0, 2);

        PatientSearchRestController.BoundedFhirPatients result = PatientSearchRestController
                .collectRegistryPatients(first, 5, REGISTRY_BASE, current -> {
                    assertSame(first, current);
                    return second;
                });

        assertFalse(result.limitReached());
        assertEquals(4, result.patients().size());
    }

    @Test
    public void clientRegistryNextPageMustRemainWithinTheConfiguredOriginAndBasePath() {
        assertEquals("https://registry.test/fhir/Patient?page=2",
                PatientSearchRestController.requireAllowedClientRegistryNextPage("https://registry.test/fhir",
                        "https://registry.test/fhir/Patient?page=2").toString());
        assertEquals("https://registry.test/fhir/Patient?page=2", PatientSearchRestController
                .requireAllowedClientRegistryNextPage("https://registry.test/fhir", "Patient?page=2").toString());

        for (String disallowed : List.of("https://attacker.test/fhir/Patient?page=2",
                "http://registry.test/fhir/Patient?page=2", "https://registry.test/admin?page=2",
                "https://registry.test/fhir/%2e%2e/admin?page=2")) {
            ResponseStatusException error = assertThrows(ResponseStatusException.class,
                    () -> PatientSearchRestController.requireAllowedClientRegistryNextPage("https://registry.test/fhir",
                            disallowed));
            assertEquals(HttpStatus.BAD_GATEWAY.value(), error.getStatusCode().value());
        }
    }

    @Test
    public void clientRegistryCollectorRejectsCrossPageOverflowWithoutTransformingPartialResults() {
        Bundle first = patientBundle("A", 0, 2);
        first.addLink().setRelation(IBaseBundle.LINK_NEXT).setUrl("https://registry.test/page/2");
        Bundle second = patientBundle("B", 0, 1);

        PatientSearchRestController.BoundedFhirPatients result = PatientSearchRestController
                .collectRegistryPatients(first, 3, REGISTRY_BASE, current -> second);

        assertTrue(result.limitReached());
        assertTrue(result.patients().isEmpty());
    }

    @Test
    public void clientRegistryCollectorRejectsAnUnboundedUniqueNextPageChain() {
        Bundle first = emptyBundleWithNext("https://registry.test/page/2");
        Bundle second = emptyBundleWithNext("https://registry.test/page/3");
        AtomicInteger loads = new AtomicInteger();

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> PatientSearchRestController.collectRegistryPatients(first, 2, REGISTRY_BASE, current -> {
                    loads.incrementAndGet();
                    return second;
                }));

        assertEquals(HttpStatus.BAD_GATEWAY.value(), error.getStatusCode().value());
        assertEquals("Client registry patient-search pagination exceeded the page limit", error.getReason());
        assertEquals(1, loads.get());
    }

    @Test
    public void clientRegistryCollectorRejectsMissingNextPageContent() {
        Bundle first = emptyBundleWithNext("https://registry.test/page/2");

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> PatientSearchRestController.collectRegistryPatients(first, 5, REGISTRY_BASE, current -> null));

        assertEquals(HttpStatus.BAD_GATEWAY.value(), error.getStatusCode().value());
        assertEquals("Client registry returned no patient-search next page", error.getReason());
    }

    @Test
    public void clientRegistryCollectorRejectsMissingInitialBundleAsUpstreamFailure() {
        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> PatientSearchRestController
                .collectRegistryPatients(null, 5, REGISTRY_BASE, current -> new Bundle()));

        assertEquals(HttpStatus.BAD_GATEWAY.value(), error.getStatusCode().value());
        assertEquals("Client registry returned no patient-search Bundle", error.getReason());
    }

    @Test
    public void clientRegistryInitialRuntimeFailureMapsToBadGateway() {
        IllegalStateException upstream = new IllegalStateException("simulated initial registry disconnect");

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> PatientSearchRestController.executeClientRegistrySearch(() -> {
                    throw upstream;
                }));

        assertEquals(HttpStatus.BAD_GATEWAY.value(), error.getStatusCode().value());
        assertEquals("Client registry patient search could not be completed", error.getReason());
        assertSame(upstream, error.getCause());
    }

    @Test
    public void clientRegistryCollectorRejectsNonSearchBundleAsUpstreamFailure() {
        Bundle invalid = new Bundle().setType(Bundle.BundleType.COLLECTION);

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> PatientSearchRestController
                .collectRegistryPatients(invalid, 5, REGISTRY_BASE, current -> invalid));

        assertEquals(HttpStatus.BAD_GATEWAY.value(), error.getStatusCode().value());
        assertEquals("Client registry returned an invalid patient-search Bundle", error.getReason());
    }

    @Test
    public void clientRegistryCollectorMapsNextPageLoaderRuntimeFailureToBadGateway() {
        IllegalStateException upstream = new IllegalStateException("simulated upstream disconnect");
        Bundle first = emptyBundleWithNext("https://registry.test/page/2");

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> PatientSearchRestController.collectRegistryPatients(first, 5, REGISTRY_BASE, current -> {
                    throw upstream;
                }));

        assertEquals(HttpStatus.BAD_GATEWAY.value(), error.getStatusCode().value());
        assertEquals("Client registry could not load a patient-search next page", error.getReason());
        assertSame(upstream, error.getCause());
    }

    @Test
    public void configuredExternalSearchFailureReturnsBadGatewayWithoutCachingPartialLocalResults() throws Exception {
        MockHttpSession session = new MockHttpSession();
        setActor(session, 7);
        PatientSearchResultsForm retained = new PatientSearchResultsForm();
        paging.setDatabaseResults(request(session), ACTOR, retained, patients("KEEP", 2), "retained");
        PatientSearchWorker worker = mock(PatientSearchWorker.class);
        when(worker.getPatientSearchResults("Smith", null, null, null, null, null, null, null, null,
                PatientSearchResultsPaging.MAX_CACHED_ROWS + 1))
                .thenThrow(new ExternalPatientSearchException("simulated external source failure"));
        ExternalWorkerPatientSearchController controller = new ExternalWorkerPatientSearchController(paging, worker);

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> controller.getPatientResults(request(session), "Smith", null, null, null, null, null, null, null,
                        null, null, null));

        assertEquals(HttpStatus.BAD_GATEWAY.value(), error.getStatusCode().value());
        assertEquals("External patient search could not be completed", error.getReason());
        assertTrue(error.getCause() instanceof ExternalPatientSearchException);

        PatientSearchResultsForm stillCached = new PatientSearchResultsForm();
        paging.page(request(session), ACTOR, stillCached, "retained", "1");
        assertPatientIds(stillCached, "KEEP-1", "KEEP-2");
        assertEquals(retained.getQueryId(), stillCached.getQueryId());
    }

    private static Bundle emptyBundleWithNext(String nextUrl) {
        Bundle bundle = new Bundle().setType(Bundle.BundleType.SEARCHSET);
        bundle.addLink().setRelation(IBaseBundle.LINK_NEXT).setUrl(nextUrl);
        return bundle;
    }

    private static Bundle patientBundle(String prefix, int start, int count) {
        Bundle bundle = new Bundle().setType(Bundle.BundleType.SEARCHSET);
        for (int i = start; i < start + count; i++) {
            bundle.addEntry().setResource(new org.hl7.fhir.r4.model.Patient().setId(prefix + i));
        }
        return bundle;
    }

    private static MockHttpServletRequest request(MockHttpSession session) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setSession(session);
        return request;
    }

    private static void setActor(MockHttpSession session, int actor) {
        UserSessionData user = new UserSessionData();
        user.setSytemUserId(actor);
        session.setAttribute(IActionConstants.USER_SESSION_DATA, user);
    }

    private static List<PatientSearchResults> patients(String prefix, int count) {
        List<PatientSearchResults> results = new ArrayList<>();
        for (int i = 1; i <= count; i++) {
            PatientSearchResults result = new PatientSearchResults(BigDecimal.valueOf(i), "First" + i, "Last" + i, "M",
                    "2000-01-01", prefix + "-NID-" + i, null, null, null, null, null);
            result.setPatientID(prefix + "-" + i);
            results.add(result);
        }
        return results;
    }

    private static void assertPatientIds(PatientSearchResultsForm form, String... expected) {
        assertNotNull(form.getPatientSearchResults());
        assertEquals(expected.length, form.getPatientSearchResults().size());
        for (int i = 0; i < expected.length; i++) {
            assertEquals(expected[i], form.getPatientSearchResults().get(i).getPatientID());
        }
        assertFalse(form.getPaging().getTotalPages().isBlank());
    }

    private static class TestPatientSearchController extends PatientSearchRestController {
        private final PatientSearchResultsPaging testPaging;

        private TestPatientSearchController(PatientSearchResultsPaging testPaging) {
            this.testPaging = testPaging;
        }

        @Override
        PatientSearchResultsPaging createPatientSearchResultsPaging() {
            return testPaging;
        }
    }

    private static class ExternalWorkerPatientSearchController extends TestPatientSearchController {
        private final PatientSearchWorker worker;

        private ExternalWorkerPatientSearchController(PatientSearchResultsPaging paging, PatientSearchWorker worker) {
            super(paging);
            this.worker = worker;
        }

        @Override
        PatientSearchWorker getAppropriateWorker(String actor, boolean suppressExternalSearch) {
            return worker;
        }
    }
}
