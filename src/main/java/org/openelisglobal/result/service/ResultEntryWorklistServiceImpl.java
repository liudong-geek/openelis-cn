package org.openelisglobal.result.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.paging.PagingBean;
import org.openelisglobal.common.rest.provider.bean.homedashboard.OrderDisplayBean;
import org.openelisglobal.common.rest.provider.form.PatientDashBoardForm;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.result.exception.ResultSaveValidationException;
import org.openelisglobal.result.form.PendingResultSummary;
import org.openelisglobal.result.form.PendingResultWorklist;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ResultEntryWorklistServiceImpl implements ResultEntryWorklistService {
    private final AnalysisService analysisService;
    private final IStatusService statusService;
    private final UserService userService;
    private final ResultEntryWorklistLoader worklistLoader;
    private final SampleHumanService sampleHumanService;

    public ResultEntryWorklistServiceImpl(AnalysisService analysisService, IStatusService statusService,
            UserService userService, ResultEntryWorklistLoader worklistLoader, SampleHumanService sampleHumanService) {
        this.analysisService = analysisService;
        this.statusService = statusService;
        this.userService = userService;
        this.worklistLoader = worklistLoader;
        this.sampleHumanService = sampleHumanService;
    }

    private record PendingScope(List<String> statusIds, Set<String> testIds) {
    }

    private PendingScope scope(String systemUserId) {
        String notStarted = statusService.getStatusID(AnalysisStatus.NotStarted);
        String returned = statusService.getStatusID(AnalysisStatus.BiologistRejected);
        if (notStarted == null || notStarted.isBlank() || returned == null || returned.isBlank()
                || notStarted.equals(returned)) {
            throw new ResultSaveValidationException(OrdinaryResultReviewPolicy.CONFIGURATION);
        }
        return new PendingScope(List.of(notStarted, returned),
                Set.copyOf(userService.getTestIdsForLabUnitRole(systemUserId, Constants.ROLE_RESULTS)));
    }

    @Override
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<TestResultItem> getPendingResultsForUser(String systemUserId) {
        return loadPendingWorklist(systemUserId).testResult();
    }

    @Override
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PendingResultWorklist getPendingWorklistForUser(String systemUserId) {
        return loadPendingWorklist(systemUserId);
    }

    // Both public entry points own a transaction; there is no self-invoked public
    // transactional method or second count request behind the compatibility API.
    private PendingResultWorklist loadPendingWorklist(String systemUserId) {
        PendingScope scope = scope(systemUserId);
        List<TestResultItem> authorizedResults;
        if (scope.testIds().isEmpty()) {
            authorizedResults = List.of();
        } else {
            List<Analysis> analyses = analysisService.getPendingResultAnalyses(scope.statusIds(), scope.testIds(), 0,
                    0);
            List<TestResultItem> rows = worklistLoader.load(analyses, systemUserId);
            authorizedResults = userService.filterResultsByLabUnitRoles(systemUserId, rows, Constants.ROLE_RESULTS);
        }
        // Never expose the nested persistence graph in the existing result rows.
        for (TestResultItem item : authorizedResults) {
            if (item.getResult() != null) {
                Result reference = new Result();
                reference.setId(item.getResult().getId());
                item.setResult(reference);
            }
        }
        return new PendingResultWorklist(authorizedResults, authorizedResults.size(),
                PendingResultSummaryFactory.fromRows(authorizedResults));
    }

    @Override
    @Transactional(readOnly = true)
    public PendingResultSummary getPendingSummaryForUser(String systemUserId) {
        return summarize(scope(systemUserId));
    }

    private PendingResultSummary summarize(PendingScope scope) {
        PendingResultSummaryFactory.Accumulator counts = new PendingResultSummaryFactory.Accumulator();
        if (!scope.testIds().isEmpty()) {
            analysisService.visitPendingResultSpecimenCounts(scope.statusIds(), scope.testIds(), counts);
        }
        return counts.summary();
    }

    @Override
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PatientDashBoardForm getPendingDashboardPageForUser(String systemUserId, int page, int pageSize) {
        if (page < 1 || pageSize < 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid dashboard page");
        }
        PendingScope scope = scope(systemUserId);
        Long count = summarize(scope).analysisCount();
        if (count == null) {
            throw new ResultSaveValidationException(OrdinaryResultReviewPolicy.CONFIGURATION);
        }
        long pages = Math.max(1, (count + pageSize - 1) / pageSize);
        long offset = ((long) page - 1) * pageSize;
        if (page > pages || offset > Integer.MAX_VALUE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid dashboard page");
        }
        List<OrderDisplayBean> items = new ArrayList<>();
        if (count > 0) {
            for (Analysis analysis : analysisService.getPendingResultAnalyses(scope.statusIds(), scope.testIds(),
                    (int) offset, pageSize)) {
                OrderDisplayBean item = new OrderDisplayBean();
                item.setId(analysis.getId());
                item.setOrderDate(analysis.getStartedDateForDisplay());
                item.setTestName(analysis.getTest() == null ? "" : analysis.getTest().getLocalizedName());
                item.setTestSection(analysis.getTestSection() == null ? "" : analysis.getTestSection().getId());
                Sample sample = analysis.getSampleItem() == null ? null : analysis.getSampleItem().getSample();
                if (sample != null) {
                    item.setPriority(sample.getPriority() == null ? "" : sample.getPriority().toString());
                    item.setLabNumber(sample.getAccessionNumber() == null ? "" : sample.getAccessionNumber());
                    var patient = sampleHumanService.getPatientForSample(sample);
                    item.setPatientId(patient == null ? "" : patient.getNationalId());
                }
                items.add(item);
            }
        }
        PagingBean paging = new PagingBean();
        paging.setCurrentPage(String.valueOf(page));
        paging.setTotalPages(String.valueOf(pages));
        paging.setSearchTermToPage(List.of());
        PatientDashBoardForm response = new PatientDashBoardForm();
        response.setOrderDisplayBeans(items);
        response.setPaging(paging);
        return response;
    }
}
