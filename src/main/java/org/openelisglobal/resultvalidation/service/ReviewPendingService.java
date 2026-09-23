package org.openelisglobal.resultvalidation.service;

import jakarta.servlet.http.HttpSession;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.apache.commons.lang3.StringUtils;
import org.openelisglobal.analysis.form.ReviewPendingQuery;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.paging.PagingBean;
import org.openelisglobal.common.rest.provider.bean.homedashboard.OrderDisplayBean;
import org.openelisglobal.common.rest.provider.form.PatientDashBoardForm;
import org.openelisglobal.common.util.DateUtil;
import org.openelisglobal.resultvalidation.bean.AnalysisItem;
import org.openelisglobal.resultvalidation.form.ResultValidationForm;
import org.openelisglobal.resultvalidation.form.ReviewPendingSummary;
import org.openelisglobal.resultvalidation.util.ResultsValidationUtility;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class ReviewPendingService {
    private final ReviewScopeService scopes;
    private final AnalysisService analyses;
    private final SampleService samples;
    private final ResultsValidationUtility projection;
    private final ReviewQueryContextService contexts;
    private final SampleHumanService patients;

    public ReviewPendingService(ReviewScopeService scopes, AnalysisService analyses, SampleService samples,
            ResultsValidationUtility projection, ReviewQueryContextService contexts, SampleHumanService patients) {
        this.scopes = scopes;
        this.analyses = analyses;
        this.samples = samples;
        this.projection = projection;
        this.contexts = contexts;
        this.patients = patients;
    }

    public ReviewPendingSummary summary(String actor) {
        ReviewScopeSnapshot scope = scopes.capture(actor);
        ReviewPendingSummary summary = count(scope);
        scopes.requireUnchanged(scope);
        return summary;
    }

    private ReviewPendingSummary count(ReviewScopeSnapshot scope) {
        ReviewSummaryFactory.Accumulator count = new ReviewSummaryFactory.Accumulator();
        if (!scope.sectionIds().isEmpty()) {
            analyses.visitReviewPendingAccessionCounts(scope.statusIds(), scope.sectionIds(), count);
        }
        return count.summary(scope.usesRecordStatus());
    }

    public ResultValidationForm query(HttpSession session, String actor, ResultValidationForm form, String page,
            String queryId) {
        validateScope(form);
        if (page != null) {
            contexts.page(session, actor, form, queryId, page);
            return form;
        }
        if (StringUtils.isNotBlank(queryId))
            throw ReviewScopeService.stale();
        ReviewScopeSnapshot scope = scopes.capture(actor);
        if ("filtered".equals(form.getReviewScope()) && !hasFilter(form)) {
            form.setSearchFinished(false);
            form.setQueryId(null);
            form.setResultList(List.of());
            form.setSummary(ReviewSummaryFactory.unqueried());
            scopes.requireUnchanged(scope);
            return form;
        }
        List<Analysis> candidates = candidates(scope, form);
        List<AnalysisItem> rows = projection.projectReviewAnalyses(candidates, scope.usesRecordStatus());
        contexts.create(session, actor, form, rows, scope.depersonalized(), scope);
        scopes.requireUnchanged(scope);
        return form;
    }

    private List<Analysis> candidates(ReviewScopeSnapshot scope, ResultValidationForm form) {
        if (scope.sectionIds().isEmpty())
            return List.of();
        ReviewPendingQuery criteria = ReviewPendingQuery.all();
        if ("filtered".equals(form.getReviewScope())) {
            if (StringUtils.isNotBlank(form.getAccessionNumber())) {
                if (Boolean.FALSE.equals(form.getDoRange())) {
                    Sample sample = samples.getSampleByAccessionNumber(form.getAccessionNumber());
                    if (sample == null)
                        return List.of();
                    criteria = new ReviewPendingQuery(null, null, sample.getId(), null);
                } else
                    criteria = new ReviewPendingQuery(null, form.getAccessionNumber(), null, null);
            } else if (!Boolean.FALSE.equals(form.getDoRange())) {
                if (StringUtils.isNotBlank(form.getTestDate())) {
                    criteria = new ReviewPendingQuery(null, null, null,
                            DateUtil.convertStringDateToSqlDate(form.getTestDate()));
                } else
                    criteria = new ReviewPendingQuery(form.getTestSectionId(), null, null, null);
            } else
                return List.of();
        }
        return analyses.getReviewPendingAnalyses(scope.statusIds(), scope.sectionIds(), criteria, 0, 0);
    }

    private static boolean hasFilter(ResultValidationForm form) {
        return StringUtils.isNotBlank(form.getAccessionNumber()) || StringUtils.isNotBlank(form.getTestDate())
                || StringUtils.isNotBlank(form.getTestSectionId());
    }

    private static void validateScope(ResultValidationForm form) {
        String scope = form.getReviewScope();
        if (scope == null) {
            scope = "filtered";
            form.setReviewScope(scope);
        }
        if (!Set.of("pending", "filtered").contains(scope)
                || "pending".equals(scope) && (hasFilter(form) || Boolean.FALSE.equals(form.getDoRange()))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid review query scope");
        }
    }

    public PatientDashBoardForm dashboardPage(String actor, int page, int pageSize) {
        if (page < 1 || pageSize < 1)
            throw badPage();
        ReviewScopeSnapshot scope = scopes.capture(actor);
        ReviewPendingSummary summary = count(scope);
        List<Analysis> candidatePage;
        long count;
        if (scope.usesRecordStatus() && !scope.sectionIds().isEmpty()) {
            // Explicit legacy drill-down, never the lightweight dashboard metric.
            // RETROCI cannot use a count that has not applied the record policy.
            List<Analysis> all = analyses.getReviewPendingAnalyses(scope.statusIds(), scope.sectionIds(),
                    ReviewPendingQuery.all(), 0, 0);
            Set<String> visible = projection.projectReviewAnalyses(all, true).stream().map(AnalysisItem::getAnalysisId)
                    .collect(Collectors.toSet());
            List<Analysis> allowed = all.stream().filter(a -> visible.contains(a.getId())).toList();
            count = allowed.size();
            int offset = offset(page, pageSize, count);
            candidatePage = allowed.subList(offset, (int) Math.min(count, (long) offset + pageSize));
        } else {
            if (summary.analysisCount() == null)
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Review count is unavailable");
            count = summary.analysisCount();
            int offset = offset(page, pageSize, count);
            candidatePage = count == 0 ? List.of()
                    : analyses.getReviewPendingAnalyses(scope.statusIds(), scope.sectionIds(), ReviewPendingQuery.all(),
                            offset, pageSize);
        }
        List<OrderDisplayBean> rows = new ArrayList<>();
        for (Analysis analysis : candidatePage) {
            OrderDisplayBean row = new OrderDisplayBean();
            row.setId(analysis.getId());
            row.setOrderDate(analysis.getStartedDateForDisplay());
            row.setTestName(analysis.getTest() == null ? "" : analysis.getTest().getLocalizedName());
            row.setTestSection(analysis.getTestSection() == null ? "" : analysis.getTestSection().getId());
            Sample sample = analysis.getSampleItem() == null ? null : analysis.getSampleItem().getSample();
            if (sample != null) {
                row.setLabNumber(sample.getAccessionNumber());
                row.setPriority(sample.getPriority() == null ? "" : sample.getPriority().toString());
                if (!scope.depersonalized()) {
                    var patient = patients.getPatientForSample(sample);
                    row.setPatientId(patient == null ? "" : patient.getNationalId());
                } else
                    row.setPatientId("---");
            }
            rows.add(row);
        }
        scopes.requireUnchanged(scope);
        PagingBean paging = new PagingBean();
        paging.setCurrentPage(String.valueOf(page));
        paging.setTotalPages(String.valueOf(Math.max(1, (count + pageSize - 1) / pageSize)));
        paging.setSearchTermToPage(List.of());
        PatientDashBoardForm response = new PatientDashBoardForm();
        response.setOrderDisplayBeans(rows);
        response.setPaging(paging);
        return response;
    }

    private static int offset(int page, int pageSize, long count) {
        long offset = ((long) page - 1) * pageSize;
        if (offset > Integer.MAX_VALUE || page > Math.max(1, (count + pageSize - 1) / pageSize))
            throw badPage();
        return (int) offset;
    }

    private static ResponseStatusException badPage() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid dashboard page");
    }
}
