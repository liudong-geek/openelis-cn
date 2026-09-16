package org.openelisglobal.report.service;

import java.util.List;
import org.openelisglobal.report.form.ReportDocumentSummary;
import org.openelisglobal.reports.service.ReportScopeDefinition;

public interface ReportDocumentService {
    ReportDocumentSummary prepare(String sampleId, String groupKey, String actor);

    List<ReportDocumentSummary> getBySample(String sampleId, String actor);

    ReportDocumentSummary get(String documentId, String actor);

    ReportDocumentSummary lockCurrent(String documentId, String actor);

    /**
     * Internal service contract, using only a release's verified persisted
     * membership.
     */
    ReportDocumentSummary authorizePersistedScope(String documentId, ReportScopeDefinition scope, String actor,
            boolean lock);

    ReportScopeDefinition authorizedScope(String documentId, String actor);
}
