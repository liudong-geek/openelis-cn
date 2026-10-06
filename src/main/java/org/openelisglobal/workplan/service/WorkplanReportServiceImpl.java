package org.openelisglobal.workplan.service;

import java.io.File;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import net.sf.jasperreports.engine.JRException;
import net.sf.jasperreports.engine.JasperRunManager;
import net.sf.jasperreports.engine.data.JRBeanCollectionDataSource;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.openelisglobal.workplan.form.WorkplanQueryResponse;
import org.openelisglobal.workplan.reports.IWorkplanReport;
import org.openelisglobal.workplan.reports.TestSectionWorkplanReport;
import org.openelisglobal.workplan.reports.TestWorkplanReport;
import org.springframework.stereotype.Service;

@Service
public class WorkplanReportServiceImpl implements WorkplanReportService {
    @Override
    public byte[] render(WorkplanQueryResponse response) {
        IWorkplanReport report = "test".equals(response.query().type()) ? new TestWorkplanReport(response.reportTitle())
                : new TestSectionWorkplanReport(response.reportTitle());
        var resource = getClass().getClassLoader().getResource("reports");
        if (resource == null)
            throw new IllegalStateException("workplan.reportUnavailable");
        String path = URLDecoder.decode(resource.getPath(), StandardCharsets.UTF_8) + File.separator;
        report.setReportPath(path);
        var rows = new ArrayList<TestResultItem>();
        for (var row : response.workplanTests()) {
            if (!row.canPrint())
                throw new IllegalArgumentException("workplan.invalidPrintSelection");
            var item = new TestResultItem();
            item.setAnalysisId(row.analysisId());
            item.setSampleItemId(row.sampleItemId());
            item.setTestId(row.testId());
            item.setAccessionNumber(row.accessionNumber());
            item.setReceivedDate(row.receivedDate());
            item.setTestName(row.testName());
            item.setPatientInfo(row.patientInfo());
            item.setPatientName(row.patientName());
            item.setNextVisitDate(row.nextVisitDate());
            item.setNonconforming(row.nonconforming());
            item.setSampleGroupingNumber(row.sampleGroupingNumber());
            rows.add(item);
        }
        try {
            return JasperRunManager.runReportToPdf(path + report.getFileName() + ".jasper", report.getParameters(),
                    new JRBeanCollectionDataSource(rows));
        } catch (JRException e) {
            throw new IllegalStateException("workplan.reportUnavailable", e);
        }
    }
}
