package org.openelisglobal.workplan.service;

import jakarta.servlet.http.HttpServletRequest;
import org.openelisglobal.workplan.form.*;

public interface WorkplanQueryService {
    WorkplanQueryResponse query(HttpServletRequest request, WorkplanQueryRequest query);

    WorkplanQueryResponse preparePrint(HttpServletRequest request, WorkplanPrintRequest selection);
}
