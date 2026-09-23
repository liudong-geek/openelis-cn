package org.openelisglobal.resultvalidation.service;

import jakarta.servlet.http.HttpSession;
import java.io.Serializable;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.BooleanSupplier;
import java.util.stream.Collectors;
import org.apache.commons.lang3.SerializationUtils;
import org.apache.commons.lang3.StringUtils;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.formfields.FormFields.Field;
import org.openelisglobal.common.paging.PagingBean;
import org.openelisglobal.common.paging.PagingProperties;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.qc.service.QCReleaseGateService;
import org.openelisglobal.resultvalidation.bean.AnalysisItem;
import org.openelisglobal.resultvalidation.form.ResultValidationForm;
import org.openelisglobal.resultvalidation.form.ReviewPendingSummary;
import org.openelisglobal.resultvalidation.util.ResultsValidationUtility;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.typeoftestresult.service.TypeOfTestResultServiceImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Server-owned review snapshots; deliberately separate from legacy shared
 * paging.
 */
@Service
@Transactional(readOnly = true)
public class ReviewQueryContextService {
    private static final String SESSION_KEY = ReviewQueryContextService.class.getName();
    static final int MAX_CONTEXTS = 8;
    static final long LIFETIME_MILLIS = Duration.ofMinutes(20).toMillis();
    private final AnalysisService analysisService;
    private final UserService userService;
    private final PagingProperties pagingProperties;
    private final Clock clock;
    private final ResultsValidationUtility utility;
    private final QCReleaseGateService qcReleaseGate;
    private final BooleanSupplier depersonalized;
    private final ReviewScopeService scopes;

    @Autowired
    public ReviewQueryContextService(AnalysisService analysisService, UserService userService,
            PagingProperties pagingProperties, ResultsValidationUtility utility, QCReleaseGateService qcReleaseGate,
            ReviewScopeService scopes) {
        this(analysisService, userService, pagingProperties, utility, qcReleaseGate, scopes, Clock.systemUTC(),
                () -> FormFields.getInstance().useField(Field.DepersonalizedResults));
    }

    ReviewQueryContextService(AnalysisService analysisService, UserService userService,
            PagingProperties pagingProperties, ResultsValidationUtility utility, QCReleaseGateService qcReleaseGate,
            ReviewScopeService scopes, Clock clock, BooleanSupplier depersonalized) {
        this.analysisService = analysisService;
        this.userService = userService;
        this.pagingProperties = pagingProperties;
        this.clock = clock;
        this.scopes = scopes;
        this.utility = utility;
        this.qcReleaseGate = qcReleaseGate;
        this.depersonalized = depersonalized;
    }

    public void create(HttpSession session, String actor, ResultValidationForm form, List<AnalysisItem> rows,
            boolean masked) {
        create(session, actor, form, rows, masked, scopes.capture(actor));
    }

    public void create(HttpSession session, String actor, ResultValidationForm form, List<AnalysisItem> rows,
            boolean masked, ReviewScopeSnapshot policy) {
        requireActor(actor);
        if (!Objects.equals(actor, policy.actor()) || masked != policy.depersonalized())
            throw stale();
        Map<String, Analysis> analyses = loadAnalyses(rows);
        Set<String> visible = authorizedIds(actor, analyses);
        List<AnalysisItem> allowed = rows.stream().filter(row -> visible.contains(row.getAnalysisId()))
                .map(SerializationUtils::clone).collect(Collectors.toList());
        for (AnalysisItem row : allowed) {
            Analysis analysis = analyses.get(row.getAnalysisId());
            boolean released = analysis.getReleasedDate() != null;
            boolean printed = analysis.getPrintedDate() != null;
            if (released || printed) {
                row.setReadOnly(true);
                row.setReviewReadOnlyReason(
                        released && printed ? "released_and_printed" : released ? "released" : "printed");
            }
        }
        annotateQualityControl(allowed, analyses);
        utility.populateReviewPatientInfo(allowed, masked);
        if (masked != depersonalized.getAsBoolean()) {
            throw stale();
        }
        scopes.requireUnchanged(policy);
        Context context = new Context(actor, Criteria.from(form), clock.millis(), divide(allowed), masked, policy,
                ReviewSummaryFactory.fromRows(form.getReviewScope(), allowed));
        synchronized (session) {
            Map<String, Context> contexts = contexts(session);
            while (contexts.size() >= MAX_CONTEXTS) {
                contexts.remove(contexts.keySet().iterator().next());
            }
            String queryId = UUID.randomUUID().toString();
            contexts.put(queryId, context);
            display(form, queryId, context, 1);
        }
    }

    public void page(HttpSession session, String actor, ResultValidationForm form, String queryId, String page) {
        synchronized (session) {
            Context context = requireContext(session, actor, form, queryId);
            int pageNumber = pageNumber(page, context);
            requireFreshAccess(actor, context);
            scopes.requireUnchanged(context.policy());
            display(form, queryId, context, pageNumber);
        }
    }

    /**
     * Validate the complete issued page before copying any edits. Consumption is
     * atomic within the session, so retries or concurrent submissions must requery.
     * Clinical persistence and optimistic locking remain the save service's
     * concern.
     */
    public List<AnalysisItem> consumeForSave(HttpSession session, String actor, ResultValidationForm form) {
        return consumeSubmission(session, actor, form).rows();
    }

    public record Submission(List<AnalysisItem> rows, ReviewScopeSnapshot policy) {
    }

    public Submission consumeSubmission(HttpSession session, String actor, ResultValidationForm form) {
        synchronized (session) {
            Context context = requireContext(session, actor, form, form.getQueryId());
            int pageNumber = pageNumber(form.getPaging() == null ? null : form.getPaging().getCurrentPage(), context);
            List<AnalysisItem> stored = context.pages().get(pageNumber - 1);
            List<AnalysisItem> posted = form.getResultList();
            if (posted == null || stored.size() != posted.size() || stored.isEmpty()) {
                throw stale();
            }
            for (int i = 0; i < stored.size(); i++) {
                AnalysisItem original = stored.get(i);
                AnalysisItem incoming = posted.get(i);
                if (incoming == null || !sameIdentity(original, incoming)
                        || (incoming.getIsAccepted() && incoming.getIsRejected())
                        || ((original.isReadOnly() || !original.isShowAcceptReject())
                                && (incoming.getIsAccepted() || incoming.getIsRejected()))) {
                    throw stale();
                }
            }
            requireFreshAccess(actor, context);
            List<AnalysisItem> submission = new ArrayList<>();
            for (int i = 0; i < stored.size(); i++) {
                AnalysisItem row = SerializationUtils.clone(stored.get(i));
                if (!TypeOfTestResultServiceImpl.ResultType.isMultiSelectVariant(row.getResultType())) {
                    row.setResult(row.getRawResultValue());
                }
                row.setIsAccepted(posted.get(i).getIsAccepted());
                row.setIsRejected(posted.get(i).getIsRejected());
                row.setNote(posted.get(i).getNote());
                submission.add(row);
            }
            scopes.requireUnchanged(context.policy());
            contexts(session).remove(form.getQueryId());
            return new Submission(submission, context.policy());
        }
    }

    private void requireFreshAccess(String actor, Context context) {
        scopes.requireUnchanged(context.policy());
        if (context.depersonalized() != depersonalized.getAsBoolean()) {
            throw stale();
        }
        List<AnalysisItem> rows = context.pages().stream().flatMap(List::stream).toList();
        Map<String, Analysis> analyses = loadAnalyses(rows);
        Set<String> visible = authorizedIds(actor, analyses);
        for (AnalysisItem row : rows) {
            Analysis analysis = analyses.get(row.getAnalysisId());
            if (!visible.contains(row.getAnalysisId())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Review permission changed; search again");
            }
            String version = analysis.getLastupdated() == null ? null
                    : String.valueOf(analysis.getLastupdated().getTime());
            if (!Objects.equals(row.getAnalysisLastupdated(), version)
                    || !Objects.equals(row.getStatusId(), analysis.getStatusId())) {
                throw stale();
            }
        }
    }

    private Map<String, Analysis> loadAnalyses(List<AnalysisItem> rows) {
        Map<String, Analysis> analyses = new LinkedHashMap<>();
        for (AnalysisItem row : rows) {
            if (row == null || StringUtils.isBlank(row.getAnalysisId())) {
                throw stale();
            }
            if (!analyses.containsKey(row.getAnalysisId())) {
                Analysis analysis = analysisService.get(row.getAnalysisId());
                if (analysis == null) {
                    throw stale();
                }
                analyses.put(row.getAnalysisId(), analysis);
            }
        }
        return analyses;
    }

    private Set<String> authorizedIds(String actor, Map<String, Analysis> analyses) {
        return userService
                .filterAnalysesByLabUnitRoles(actor, new ArrayList<>(analyses.values()), Constants.ROLE_VALIDATION)
                .stream().map(Analysis::getId).collect(Collectors.toSet());
    }

    private void annotateQualityControl(List<AnalysisItem> rows, Map<String, Analysis> analyses) {
        Map<String, List<org.openelisglobal.qc.dto.QCReleaseBlocker>> blockers = new LinkedHashMap<>();
        for (AnalysisItem row : rows) {
            Analysis analysis = analyses.get(row.getAnalysisId());
            row.setAnalyzerId(analysis == null ? null : analysis.getAnalyzerId());
            row.setQcBlockingViolations(
                    blockers.computeIfAbsent(row.getAnalysisId(), ignored -> qcReleaseGate.blockersFor(analysis)));
        }
    }

    private Context requireContext(HttpSession session, String actor, ResultValidationForm form, String queryId) {
        requireActor(actor);
        Context context = contexts(session).get(queryId);
        if (context == null || !Objects.equals(actor, context.actor())
                || !Objects.equals(Criteria.from(form), context.criteria())) {
            throw stale();
        }
        return context;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Context> contexts(HttpSession session) {
        Map<String, Context> contexts = (Map<String, Context>) session.getAttribute(SESSION_KEY);
        if (contexts == null) {
            contexts = new LinkedHashMap<>();
            session.setAttribute(SESSION_KEY, contexts);
        }
        long now = clock.millis();
        contexts.values().removeIf(context -> now - context.createdAt() >= LIFETIME_MILLIS);
        return contexts;
    }

    private List<List<AnalysisItem>> divide(List<AnalysisItem> rows) {
        List<List<AnalysisItem>> pages = new ArrayList<>();
        List<AnalysisItem> page = new ArrayList<>();
        int size = Math.max(1, pagingProperties.getValidationPageSize());
        String lastAccession = null;
        for (AnalysisItem row : rows) {
            // Keep a complete accession on the same server page.
            if (page.size() >= size && !Objects.equals(lastAccession, row.getAccessionNumber())) {
                pages.add(page);
                page = new ArrayList<>();
            }
            page.add(row);
            lastAccession = row.getAccessionNumber();
        }
        if (!page.isEmpty() || pages.isEmpty()) {
            pages.add(page);
        }
        return pages;
    }

    private void display(ResultValidationForm form, String queryId, Context context, int pageNumber) {
        form.setQueryId(queryId);
        form.setReviewScope(context.criteria().scope());
        form.setSummary(context.summary());
        form.setDoRange(context.criteria().doRange());
        form.setSearchFinished(true);
        form.setResultList(context.pages().get(pageNumber - 1).stream().map(SerializationUtils::clone)
                .collect(Collectors.toList()));
        PagingBean paging = new PagingBean();
        paging.setCurrentPage(String.valueOf(pageNumber));
        paging.setTotalPages(String.valueOf(context.pages().size()));
        List<IdValuePair> mapping = new ArrayList<>();
        for (int i = 0; i < context.pages().size(); i++) {
            final String page = String.valueOf(i + 1);
            context.pages().get(i).stream().map(AnalysisItem::getAccessionNumber).distinct()
                    .forEach(accession -> mapping.add(new IdValuePair(accession, page)));
        }
        paging.setSearchTermToPage(mapping);
        form.setPaging(paging);
    }

    private int pageNumber(String page, Context context) {
        try {
            int parsed = Integer.parseInt(page);
            if (parsed < 1 || parsed > context.pages().size()) {
                throw stale();
            }
            return parsed;
        } catch (NumberFormatException e) {
            throw stale();
        }
    }

    private boolean sameIdentity(AnalysisItem a, AnalysisItem b) {
        return Objects.equals(a.getAnalysisId(), b.getAnalysisId()) && Objects.equals(a.getTestId(), b.getTestId())
                && Objects.equals(a.getResultId(), b.getResultId())
                && Objects.equals(a.getTestResultComponentId(), b.getTestResultComponentId())
                && Objects.equals(a.getSampleId(), b.getSampleId())
                && Objects.equals(a.getAccessionNumber(), b.getAccessionNumber());
    }

    private void requireActor(String actor) {
        if (StringUtils.isBlank(actor)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Review session is unavailable");
        }
    }

    private ResponseStatusException stale() {
        return new ResponseStatusException(HttpStatus.CONFLICT, "Review query expired or changed; search again");
    }

    private record Context(String actor, Criteria criteria, long createdAt, List<List<AnalysisItem>> pages,
            boolean depersonalized, ReviewScopeSnapshot policy, ReviewPendingSummary summary) implements Serializable {
    }

    private record Criteria(String scope, String accession, String date, String section,
            boolean doRange) implements Serializable {
        static Criteria from(ResultValidationForm form) {
            return new Criteria(StringUtils.defaultIfBlank(form.getReviewScope(), "filtered"),
                    StringUtils.trimToEmpty(form.getAccessionNumber()), StringUtils.trimToEmpty(form.getTestDate()),
                    StringUtils.trimToEmpty(form.getTestSectionId()), !Boolean.FALSE.equals(form.getDoRange()));
        }
    }
}
