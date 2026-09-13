package org.openelisglobal.sampletyperequest.service;

import java.util.List;
import java.util.Map;
import org.openelisglobal.common.service.BaseObjectService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.dto.SampleTypeRequestDTO;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.springframework.validation.BindException;
import org.springframework.validation.BindingResult;

public interface SampleTypeRequestService extends BaseObjectService<SampleTypeRequest, Integer> {

    /**
     * Create every requested tube in the caller's first-entry transaction. Validates
     * the entire batch before inserting any tube; never fulfills physical specimens.
     * This is not an idempotent edit/replay API.
     */
    List<SampleTypeRequestDTO> createRequestsForEntry(Sample sample, List<SampleTypeRequestDTO> requestedSpecimens,
            String actor, BindingResult errors) throws BindException;

    /**
     * Get all sample type requests for a given sample.
     */
    List<SampleTypeRequest> getRequestsBySampleId(String sampleId);

    /**
     * Get pending (not yet collected) requests for a sample.
     */
    List<SampleTypeRequest> getPendingRequestsBySampleId(String sampleId);

    /**
     * Get fulfilled (collected) requests for a sample.
     */
    List<SampleTypeRequest> getFulfilledRequestsBySampleId(String sampleId);

    /**
     * Mark a request as fulfilled by linking it to a collected sample_item.
     */
    SampleTypeRequest fulfillRequest(Integer requestId, String sampleItemId);

    /**
     * Link newly persisted specimen rows to pending requests of the same sample and
     * specimen type. Called inside the order save transaction.
     *
     * @return number of requests fulfilled by this call
     */
    int fulfillMatchingRequests(String sampleId, List<SampleItem> sampleItems);

    int fulfillMatchingRequests(String sampleId, List<SampleItem> sampleItems, Map<String, Integer> requestIdsByItemId);

    /**
     * Validate and lock before inserting any new physical tube. Keys use item
     * identity.
     */
    Map<SampleItem, Integer> validateCollectionMatches(String sampleId, List<SampleItem> sampleItems,
            Map<SampleItem, Integer> explicitRequestIds);

    /**
     * Cancel a pending request.
     */
    void cancelRequest(Integer requestId);
}
