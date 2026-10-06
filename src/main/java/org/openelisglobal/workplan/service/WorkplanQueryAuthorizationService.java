package org.openelisglobal.workplan.service;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;

public interface WorkplanQueryAuthorizationService {
    String requireRead(HttpServletRequest request, String type);

    boolean canPrint(HttpServletRequest request, String actor, String type);

    Set<String> allowedTestIds(String actor);
}
