package org.openelisglobal.reports.service;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.StatusService.OrderStatus;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.test.valueholder.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Defines the single bulk query used by both COVID export generation and its
 * pre-flight authorization.
 */
@Service
public class CovidResultsCandidateService {

    private static final String[] COVID_LOINC_CODES = { "94547-7", "94500-6" };

    @Autowired
    private AnalysisService analysisService;

    @Autowired
    private TestService testService;

    @Autowired
    private IStatusService statusService;

    @Transactional(readOnly = true)
    public List<Analysis> getCandidates(Date lowDate, Date highDate) {
        if (lowDate == null || highDate == null || highDate.before(lowDate)) {
            throw new IllegalArgumentException("A valid completed-date range is required");
        }

        List<Test> tests = testService.getActiveTestsByLoinc(COVID_LOINC_CODES.clone());
        List<String> testIds = tests == null ? List.of()
                : tests.stream().filter(Objects::nonNull).map(Test::getId).filter(Objects::nonNull)
                        .collect(Collectors.toList());
        if (testIds.isEmpty()) {
            return List.of();
        }
        List<String> analysisStatusIds = Arrays.asList(statusService.getStatusID(AnalysisStatus.Finalized),
                statusService.getStatusID(AnalysisStatus.TechnicalAcceptance));
        List<String> sampleStatusIds = Arrays.asList(statusService.getStatusID(OrderStatus.Started),
                statusService.getStatusID(OrderStatus.Finished));

        ZoneId businessZone = ZoneId.systemDefault();
        LocalDate firstDay = lowDate.toLocalDate();
        LocalDate dayAfterLast = highDate.toLocalDate().plusDays(1);
        Timestamp startInclusive = Timestamp.from(firstDay.atStartOfDay(businessZone).toInstant());
        Timestamp endExclusive = Timestamp.from(dayAfterLast.atStartOfDay(businessZone).toInstant());

        List<Analysis> candidates = analysisService
                .getAllAnalysisByTestsAndStatusAndCompletedDateRangeExclusive(testIds, analysisStatusIds,
                        sampleStatusIds, startInclusive, endExclusive);
        return candidates == null ? List.of() : candidates;
    }
}
