package org.openelisglobal.sample.dao;

import java.util.List;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;

public interface SpecimenReceiptDAO {
    void requireCleanContext();

    Sample lockOrder(String sampleId);

    List<SampleTypeRequest> lockRequests(String sampleId);

    List<SampleItem> lockItems(String sampleId);

    List<Analysis> lockAnalyses(String sampleId);

    List<String> clinicalPatientIds(String sampleId);

    String statusName(String id, String type);

    record Membership(List<Integer> requestIds, List<String> itemIds, List<String> analysisIds) {
        public Membership {
            requestIds = List.copyOf(requestIds);
            itemIds = List.copyOf(itemIds);
            analysisIds = List.copyOf(analysisIds);
        }
    }

    Membership currentMembership(String sampleId);

    void flush();
}
