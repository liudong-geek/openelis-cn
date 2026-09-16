package org.openelisglobal.report.dao;

import java.util.List;
import org.openelisglobal.common.dao.BaseDAO;
import org.openelisglobal.report.valueholder.ReportDocument;
import org.openelisglobal.report.valueholder.ReportDocumentMember;

public interface ReportDocumentDAO extends BaseDAO<ReportDocument, String> {
    void lockSample(String sampleId);

    ReportDocument findBySampleAndGroup(String sampleId, String groupKey);

    ReportDocument getWithMembers(String documentId, boolean lock);

    List<ReportDocument> getBySample(String sampleId);

    void insertMember(ReportDocumentMember member);
}
