package org.openelisglobal.sampletyperequest.service;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.openelisglobal.common.service.AuditableBaseObjectServiceImpl;
import org.openelisglobal.sampleitem.service.SampleItemService;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.dao.SampleTypeRequestDAO;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SampleTypeRequestServiceImpl extends AuditableBaseObjectServiceImpl<SampleTypeRequest, Integer>
        implements SampleTypeRequestService {

    @Autowired
    private SampleTypeRequestDAO sampleTypeRequestDAO;

    @Autowired
    private SampleItemService sampleItemService;

    public SampleTypeRequestServiceImpl() {
        super(SampleTypeRequest.class);
    }

    @Override
    protected SampleTypeRequestDAO getBaseObjectDAO() {
        return sampleTypeRequestDAO;
    }

    @Override
    @Transactional(readOnly = true)
    public List<SampleTypeRequest> getRequestsBySampleId(String sampleId) {
        List<SampleTypeRequest> requests = sampleTypeRequestDAO.getRequestsBySampleId(sampleId);
        // Initialize lazy-loaded associations within transaction
        for (SampleTypeRequest request : requests) {
            initializeLazyAssociations(request);
        }
        return requests;
    }

    @Override
    @Transactional(readOnly = true)
    public List<SampleTypeRequest> getPendingRequestsBySampleId(String sampleId) {
        List<SampleTypeRequest> requests = sampleTypeRequestDAO.getPendingRequestsBySampleId(sampleId);
        // Initialize lazy-loaded associations within transaction
        for (SampleTypeRequest request : requests) {
            initializeLazyAssociations(request);
        }
        return requests;
    }

    @Override
    @Transactional(readOnly = true)
    public List<SampleTypeRequest> getFulfilledRequestsBySampleId(String sampleId) {
        List<SampleTypeRequest> requests = sampleTypeRequestDAO.getFulfilledRequestsBySampleId(sampleId);
        // Initialize lazy-loaded associations within transaction
        for (SampleTypeRequest request : requests) {
            initializeLazyAssociations(request);
        }
        return requests;
    }

    /**
     * Initialize lazy-loaded associations to prevent LazyInitializationException
     * when converting to DTO outside of transaction.
     */
    private void initializeLazyAssociations(SampleTypeRequest request) {
        if (request.getSample() != null) {
            request.getSample().getId(); // Force load
        }
        if (request.getTypeOfSample() != null) {
            request.getTypeOfSample().getLocalizedName(); // Force load
        }
        if (request.getUnitOfMeasure() != null) {
            request.getUnitOfMeasure().getUnitOfMeasureName(); // Force load
        }
        if (request.getSampleItem() != null) {
            request.getSampleItem().getId(); // Force load
        }
    }

    @Override
    @Transactional
    public SampleTypeRequest fulfillRequest(Integer requestId, String sampleItemId) {
        SampleTypeRequest request = get(requestId);
        if (request == null) {
            throw new IllegalArgumentException("SampleTypeRequest not found: " + requestId);
        }
        if (request.getStatus() == SampleTypeRequest.Status.COLLECTED && request.getSampleItem() != null
                && sampleItemId.equals(request.getSampleItem().getId())) {
            initializeLazyAssociations(request);
            return request;
        }
        if (request.getStatus() != SampleTypeRequest.Status.REQUESTED) {
            throw new IllegalStateException("Cannot fulfill request in status: " + request.getStatus());
        }

        SampleItem sampleItem = sampleItemService.get(sampleItemId);
        if (sampleItem == null) {
            throw new IllegalArgumentException("SampleItem not found: " + sampleItemId);
        }

        request.setStatus(SampleTypeRequest.Status.COLLECTED);
        request.setSampleItem(sampleItem);
        update(request);
        initializeLazyAssociations(request);
        return request;
    }

    @Override
    @Transactional
    public int fulfillMatchingRequests(String sampleId, List<SampleItem> sampleItems) {
        if (sampleId == null || sampleId.trim().isEmpty() || sampleItems == null || sampleItems.isEmpty()) {
            return 0;
        }

        List<SampleTypeRequest> allRequests = sampleTypeRequestDAO.getRequestsBySampleId(sampleId);
        Set<String> alreadyLinkedItemIds = new HashSet<>();
        for (SampleTypeRequest request : allRequests) {
            if (request.getSampleItem() != null && request.getSampleItem().getId() != null) {
                alreadyLinkedItemIds.add(request.getSampleItem().getId());
            }
        }

        int fulfilledCount = 0;
        for (SampleTypeRequest request : allRequests) {
            if (request.getStatus() != SampleTypeRequest.Status.REQUESTED || request.getTypeOfSample() == null) {
                continue;
            }
            String requestedTypeId = request.getTypeOfSample().getId();
            SampleItem match = sampleItems.stream()
                    .filter(item -> item != null && item.getId() != null && item.getTypeOfSample() != null)
                    .filter(item -> !alreadyLinkedItemIds.contains(item.getId()))
                    .filter(item -> requestedTypeId.equals(item.getTypeOfSample().getId())).findFirst().orElse(null);
            if (match != null) {
                request.setStatus(SampleTypeRequest.Status.COLLECTED);
                request.setSampleItem(match);
                update(request);
                alreadyLinkedItemIds.add(match.getId());
                fulfilledCount++;
            }
        }
        return fulfilledCount;
    }

    @Override
    @Transactional
    public void cancelRequest(Integer requestId) {
        SampleTypeRequest request = get(requestId);
        if (request == null) {
            throw new IllegalArgumentException("SampleTypeRequest not found: " + requestId);
        }
        if (request.getStatus() != SampleTypeRequest.Status.REQUESTED) {
            throw new IllegalStateException("Cannot cancel request in status: " + request.getStatus());
        }

        request.setStatus(SampleTypeRequest.Status.CANCELLED);
        update(request);
    }
}
