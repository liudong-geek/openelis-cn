package org.openelisglobal.qaevent.service;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.openelisglobal.qaevent.form.NceActionCommand;
import org.openelisglobal.qaevent.form.NceRegistrationCommand;
import org.openelisglobal.qaevent.form.NceWorkspaceQuery;
import org.openelisglobal.qaevent.form.NceWorkspaceResponse.*;
import org.springframework.web.multipart.MultipartFile;

public interface NceWorkspaceService {
    Meta meta(HttpServletRequest request);

    Workspace workspace(NceWorkspaceQuery query, HttpServletRequest request);

    Orders orders(String type, String value, int page, int pageSize, HttpServletRequest request);

    Receipt create(NceRegistrationCommand command, List<MultipartFile> files, HttpServletRequest request);

    Receipt action(String eventId, NceActionCommand command, HttpServletRequest request);

    Receipt receipt(String requestId, String operation, HttpServletRequest request);

    Users users(String search, HttpServletRequest request);

    Download attachment(String eventId, String attachmentId, HttpServletRequest request);
}
