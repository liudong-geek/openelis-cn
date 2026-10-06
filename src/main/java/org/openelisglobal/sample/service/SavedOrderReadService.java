package org.openelisglobal.sample.service;

import jakarta.servlet.http.HttpServletRequest;
import org.openelisglobal.sample.form.SavedOrderReadRequest;
import org.openelisglobal.sample.form.SavedOrderReadResponse;

public interface SavedOrderReadService {
    SavedOrderReadResponse read(SavedOrderReadRequest query, HttpServletRequest request);
}
