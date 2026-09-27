package org.openelisglobal.reports.controller.rest;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.openelisglobal.common.rest.BaseRestController;
import org.openelisglobal.reports.action.implementation.StatisticsReport;
import org.openelisglobal.reports.action.implementation.reportBeans.StatisticsReportData;
import org.openelisglobal.reports.form.ReportForm;
import org.openelisglobal.reports.form.ReportForm.ReceptionTime;
import org.openelisglobal.reports.service.ReportAnalysisAuthorizationService;
import org.openelisglobal.sample.valueholder.OrderPriority;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/rest/reports/statistics")
@PreAuthorize("hasRole('REPORTS')")
public class StatisticsReportRestController extends BaseRestController {

    @Autowired
    private ReportAnalysisAuthorizationService reportAnalysisAuthorizationService;

    public record Totals(int tests, int samples) {
    }

    public record WorkloadPreview(int year, List<StatisticsReportData> rows, Totals totals) {
    }

    @GetMapping("/workload")
    public WorkloadPreview workload(@RequestParam String year,
            @RequestParam(required = false) List<String> labSections,
            @RequestParam(required = false) List<OrderPriority> priority,
            @RequestParam(required = false) List<ReceptionTime> receptionTime, HttpServletRequest request) {
        ReportForm form = new ReportForm();
        form.setReport("statisticsReport");
        form.setUpperYear(year);
        form.setLabSections(labSections);
        form.setPriority(priority);
        form.setReceptionTime(receptionTime);

        StatisticsReport report = createStatisticsReport();
        reportAnalysisAuthorizationService.authorize(form, getSysUserId(request), report, form.getReport());

        List<StatisticsReportData> rows = report.createReportData(form).stream()
                .filter(row -> row.getTestName() != null && !row.getTestName().isBlank()).toList();
        int totalTests = rows.stream().mapToInt(StatisticsReportData::getTotalTests).sum();
        int totalSamples = rows.stream().mapToInt(StatisticsReportData::getTotalSamples).sum();

        return new WorkloadPreview(StatisticsReport.resolveReportYear(year), rows,
                new Totals(totalTests, totalSamples));
    }

    protected StatisticsReport createStatisticsReport() {
        return new StatisticsReport();
    }
}
