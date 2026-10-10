package org.openelisglobal.result.service;

import jakarta.servlet.http.HttpServletRequest;
import org.openelisglobal.result.form.ResultRestrictionRequest;
import org.openelisglobal.result.form.ResultRestrictionResponse;

public interface ResultRestrictionService {
    ResultRestrictionResponse inspect(ResultRestrictionRequest query, HttpServletRequest request);
}
