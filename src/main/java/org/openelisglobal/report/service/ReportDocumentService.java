package org.openelisglobal.report.service;

import java.util.List;
import org.openelisglobal.report.form.ReportDocumentSummary;
import org.openelisglobal.reports.service.ReportScopeDefinition;

public interface ReportDocumentService {
    ReportDocumentSummary prepare(String sampleId, String groupKey, String actor);

    List<ReportDocumentSummary> getBySample(String sampleId, String actor);

    ReportDocumentSummary get(String documentId, String actor);

    ReportDocumentSummary lockCurrent(String documentId, String actor);

    ReportScopeDefinition authorizedScope(String documentId, String actor);
}
