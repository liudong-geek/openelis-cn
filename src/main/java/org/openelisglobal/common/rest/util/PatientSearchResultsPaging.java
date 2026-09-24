package org.openelisglobal.common.rest.util;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.lang.reflect.InvocationTargetException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.apache.commons.lang3.StringUtils;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.paging.PagingBean;
import org.openelisglobal.common.paging.PagingProperties;
import org.openelisglobal.common.provider.query.PatientSearchResults;
import org.openelisglobal.common.provider.query.PatientSearchResultsForm;
import org.openelisglobal.common.util.ControllerUtills;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.spring.util.SpringContext;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public class PatientSearchResultsPaging {

    private static final String QUERY_CONTEXTS_SESSION_KEY = PatientSearchResultsPaging.class.getName()
            + ".queryContexts";
    private static final String LATEST_LEGACY_QUERY_ID_SESSION_KEY = PatientSearchResultsPaging.class.getName()
            + ".latestLegacyQueryId";
    private static final int MAX_QUERY_CONTEXTS = 8;

    /**
     * Technical patient-search resource protection, not a hospital rule. Two
     * thousand rows leaves room for the existing 1,000-row acceptance scenario
     * while bounding both local query materialization and session snapshots.
     */
    public static final int MAX_CACHED_ROWS = 2_000;

    private final Integer pageSizeOverride;

    public PatientSearchResultsPaging() {
        this.pageSizeOverride = null;
    }

    /** Visible for focused tests that do not create the full Spring context. */
    public PatientSearchResultsPaging(int pageSize) {
        if (pageSize < 1) {
            throw new IllegalArgumentException("Patient page size must be positive");
        }
        this.pageSizeOverride = pageSize;
    }

    public void setDatabaseResults(HttpServletRequest request, PatientSearchResultsForm form,
            List<PatientSearchResults> results)
            throws IllegalAccessException, InvocationTargetException, NoSuchMethodException {

        setDatabaseResults(request, ControllerUtills.getSysUserId(request), form, results, "", true);
    }

    public void setDatabaseResults(HttpServletRequest request, PatientSearchResultsForm form,
            List<PatientSearchResults> results, String criteriaSignature)
            throws IllegalAccessException, InvocationTargetException, NoSuchMethodException {

        setDatabaseResults(request, ControllerUtills.getSysUserId(request), form, results, criteriaSignature, true);
    }

    public void setDatabaseResults(HttpServletRequest request, String actor, PatientSearchResultsForm form,
            List<PatientSearchResults> results, String criteriaSignature)
            throws IllegalAccessException, InvocationTargetException, NoSuchMethodException {

        setDatabaseResults(request, actor, form, results, criteriaSignature, true);
    }

    /**
     * Creates a query-scoped paging snapshot. When {@code updateLegacyCache} is
     * false (used for an exact laboratory-number miss), the response is rendered
     * without inserting a session context. This preserves the prior legacy query
     * and cannot evict another in-flight search. The legacy reference is only the
     * query id, so it does not retain a second result graph.
     */
    public void setDatabaseResults(HttpServletRequest request, String actor, PatientSearchResultsForm form,
            List<PatientSearchResults> results, String criteriaSignature, boolean updateLegacyCache)
            throws IllegalAccessException, InvocationTargetException, NoSuchMethodException {

        requireActor(actor);
        List<PatientSearchResults> safeResults = results == null ? List.of() : results;
        requireWithinRowLimit(safeResults);
        List<List<PatientSearchResults>> pages = divide(safeResults);
        List<IdValuePair> mapping = createSearchToPageMapping(pages);
        String queryId = UUID.randomUUID().toString();
        QueryContext context = new QueryContext(actor, criteriaSignature, pages, mapping, safeResults.size());
        if (!updateLegacyCache) {
            display(form, queryId, context, 1);
            return;
        }
        HttpSession session = request.getSession();

        synchronized (session) {
            Map<String, QueryContext> contexts = contexts(session);
            evictUntilFits(session, contexts, safeResults.size());
            contexts.put(queryId, context);
            session.setAttribute(LATEST_LEGACY_QUERY_ID_SESSION_KEY, queryId);
            display(form, queryId, context, 1);
        }
    }

    public void requireWithinRowLimit(List<PatientSearchResults> results) {
        requireWithinRowLimit(results == null ? 0 : results.size());
    }

    public void requireWithinRowLimit(int rowCount) {
        if (rowCount > MAX_CACHED_ROWS) {
            throw tooManyRows();
        }
    }

    public void page(HttpServletRequest request, String actor, PatientSearchResultsForm form, String queryId,
            String criteriaSignature, String requestedPage)
            throws IllegalAccessException, InvocationTargetException, NoSuchMethodException {
        requireActor(actor);
        HttpSession session = request.getSession();
        synchronized (session) {
            Map<String, QueryContext> contexts = contexts(session);
            QueryContext context = peek(contexts, queryId);
            if (context == null || !Objects.equals(context.actor, actor)
                    || !Objects.equals(context.criteriaSignature, criteriaSignature)) {
                throw invalidPage();
            }
            // Access-order maps should only refresh a context after all ownership and
            // criteria checks pass.
            contexts.get(queryId);
            int page = parsePage(requestedPage, context.pages.size());
            session.setAttribute(IActionConstants.SAVE_DISABLED, IActionConstants.FALSE);
            display(form, queryId, context, page);
        }
    }

    /**
     * Legacy page-only compatibility for clients that repeat their original search
     * criteria but do not yet send a query id. The repeated criteria must still
     * bind the request to the latest patient snapshot in this session.
     */
    public void page(HttpServletRequest request, String actor, PatientSearchResultsForm form, String criteriaSignature,
            String requestedPage) throws IllegalAccessException, InvocationTargetException, NoSuchMethodException {
        requireActor(actor);
        HttpSession session = request.getSession();
        synchronized (session) {
            Object latest = session.getAttribute(LATEST_LEGACY_QUERY_ID_SESSION_KEY);
            Map<String, QueryContext> contexts = contexts(session);
            QueryContext context = latest instanceof String ? peek(contexts, (String) latest) : null;
            if (context == null || !Objects.equals(context.actor, actor)
                    || !Objects.equals(context.criteriaSignature, criteriaSignature)) {
                throw invalidPage();
            }
            contexts.get((String) latest);
            int page = parsePage(requestedPage, context.pages.size());
            session.setAttribute(IActionConstants.SAVE_DISABLED, IActionConstants.FALSE);
            display(form, (String) latest, context, page);
        }
    }

    private void evictUntilFits(HttpSession session, Map<String, QueryContext> contexts, int incomingRows) {
        int cachedRows = contexts.values().stream().mapToInt(context -> context.totalItems).sum();
        Iterator<Map.Entry<String, QueryContext>> iterator = contexts.entrySet().iterator();
        while (contexts.size() >= MAX_QUERY_CONTEXTS || cachedRows + incomingRows > MAX_CACHED_ROWS) {
            if (!iterator.hasNext()) {
                throw new IllegalStateException("Patient query cache accounting is inconsistent");
            }
            Map.Entry<String, QueryContext> eldest = iterator.next();
            cachedRows -= eldest.getValue().totalItems;
            String evictedQueryId = eldest.getKey();
            iterator.remove();
            if (Objects.equals(evictedQueryId, session.getAttribute(LATEST_LEGACY_QUERY_ID_SESSION_KEY))) {
                session.removeAttribute(LATEST_LEGACY_QUERY_ID_SESSION_KEY);
            }
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, QueryContext> contexts(HttpSession session) {
        Object cached = session.getAttribute(QUERY_CONTEXTS_SESSION_KEY);
        if (cached instanceof Map<?, ?>) {
            return (Map<String, QueryContext>) cached;
        }
        Map<String, QueryContext> contexts = new LinkedHashMap<>(16, 0.75f, true);
        session.setAttribute(QUERY_CONTEXTS_SESSION_KEY, contexts);
        return contexts;
    }

    private List<List<PatientSearchResults>> divide(List<PatientSearchResults> results) {
        List<List<PatientSearchResults>> pages = new ArrayList<>();
        int pageSize = pageSizeOverride == null ? SpringContext.getBean(PagingProperties.class).getPatientsPageSize()
                : pageSizeOverride;
        if (pageSize < 1) {
            throw new IllegalStateException("Invalid configured patient page size");
        }
        List<PatientSearchResults> page = new ArrayList<>();
        for (PatientSearchResults result : results) {
            if (page.size() == pageSize) {
                pages.add(List.copyOf(page));
                page = new ArrayList<>();
            }
            page.add(result);
        }
        if (!page.isEmpty() || pages.isEmpty()) {
            pages.add(List.copyOf(page));
        }
        return List.copyOf(pages);
    }

    private List<IdValuePair> createSearchToPageMapping(List<List<PatientSearchResults>> pages) {
        List<IdValuePair> mapping = new ArrayList<>();
        for (int i = 0; i < pages.size(); i++) {
            String pageNumber = String.valueOf(i + 1);
            String currentPatientId = null;
            for (PatientSearchResults result : pages.get(i)) {
                if (!Objects.equals(result.getPatientID(), currentPatientId)) {
                    currentPatientId = result.getPatientID();
                    mapping.add(new IdValuePair(currentPatientId, pageNumber));
                }
            }
        }
        return List.copyOf(mapping);
    }

    private int parsePage(String requestedPage, int totalPages) {
        if (requestedPage == null || !requestedPage.matches("[1-9][0-9]*")) {
            throw invalidPage();
        }
        try {
            int page = Integer.parseInt(requestedPage);
            if (page < 1 || page > totalPages) {
                throw invalidPage();
            }
            return page;
        } catch (NumberFormatException e) {
            throw invalidPage();
        }
    }

    private ResponseStatusException invalidPage() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Patient search page is invalid, expired, or does not match the search criteria");
    }

    private ResponseStatusException tooManyRows() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Patient search returned too many rows; narrow the search criteria");
    }

    public void requireActor(String actor) {
        if (StringUtils.isBlank(actor) || !actor.matches("[1-9][0-9]*")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Patient search session is unavailable");
        }
    }

    private QueryContext peek(Map<String, QueryContext> contexts, String queryId) {
        if (queryId == null) {
            return null;
        }
        for (Map.Entry<String, QueryContext> entry : contexts.entrySet()) {
            if (Objects.equals(entry.getKey(), queryId)) {
                return entry.getValue();
            }
        }
        return null;
    }

    private void display(PatientSearchResultsForm form, String queryId, QueryContext context, int page) {
        form.setQueryId(queryId);
        form.setTotalItems(context.totalItems);
        form.setPatientSearchResults(new ArrayList<>(context.pages.get(page - 1)));
        PagingBean paging = new PagingBean();
        paging.setCurrentPage(String.valueOf(page));
        paging.setTotalPages(String.valueOf(context.pages.size()));
        paging.setSearchTermToPage(new ArrayList<>(context.mapping));
        form.setPaging(paging);
    }

    private static final class QueryContext {
        private final String actor;
        private final String criteriaSignature;
        private final List<List<PatientSearchResults>> pages;
        private final List<IdValuePair> mapping;
        private final int totalItems;

        private QueryContext(String actor, String criteriaSignature, List<List<PatientSearchResults>> pages,
                List<IdValuePair> mapping, int totalItems) {
            this.actor = actor;
            this.criteriaSignature = criteriaSignature;
            this.pages = pages;
            this.mapping = mapping;
            this.totalItems = totalItems;
        }
    }
}
