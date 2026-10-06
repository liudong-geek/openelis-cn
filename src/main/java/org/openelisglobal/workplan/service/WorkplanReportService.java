package org.openelisglobal.workplan.service;

import org.openelisglobal.workplan.form.WorkplanQueryResponse;

public interface WorkplanReportService {
    byte[] render(WorkplanQueryResponse report);
}
