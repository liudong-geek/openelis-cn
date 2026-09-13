package org.openelisglobal.sampletyperequest.service;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.service.AuditableBaseObjectServiceImpl;
import org.openelisglobal.panel.service.PanelService;
import org.openelisglobal.panelitem.service.PanelItemService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.service.SampleItemService;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.dao.SampleTypeRequestDAO;
import org.openelisglobal.sampletyperequest.dto.SampleTypeRequestDTO;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.typeofsample.service.TypeOfSamplePanelService;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.openelisglobal.typeofsample.service.TypeOfSampleTestService;
import org.openelisglobal.unitofmeasure.service.UnitOfMeasureService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.BindException;
import org.springframework.validation.BindingResult;

@Service
public class SampleTypeRequestServiceImpl extends AuditableBaseObjectServiceImpl<SampleTypeRequest, Integer>
        implements SampleTypeRequestService {

    @Autowired
    private SampleTypeRequestDAO sampleTypeRequestDAO;

    @Autowired
    private SampleItemService sampleItemService;

    @Autowired
    private TypeOfSampleService typeOfSampleService;
    @Autowired
    private TypeOfSampleTestService typeOfSampleTestService;
    @Autowired
    private TypeOfSamplePanelService typeOfSamplePanelService;
    @Autowired
    private TestService testService;
    @Autowired
    private PanelService panelService;
    @Autowired
    private PanelItemService panelItemService;
    @Autowired
    private UnitOfMeasureService unitOfMeasureService;
    @Autowired
    private UserService userService;

    public SampleTypeRequestServiceImpl() {
        super(SampleTypeRequest.class);
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public List<SampleTypeRequestDTO> createRequestsForEntry(Sample sample,
            List<SampleTypeRequestDTO> requestedSpecimens, String actor, BindingResult errors) throws BindException {
        int previousErrors = errors.getErrorCount();
        if (sample == null || !entryId(sample.getId()) || !entryId(actor) || requestedSpecimens == null
                || requestedSpecimens.isEmpty()) {
            entryError(errors, "requestedSpecimens", "请确认新申请、当前用户，并至少添加一管标本及检验项目。");
            throw new BindException(errors);
        }
        Set<String> authorizedTests = new HashSet<>();
        var allowed = userService.getAllDisplayUserTestsByLabUnit(actor, Constants.ROLE_RECEPTION);
        if (allowed != null) {
            allowed.forEach(item -> {
                if (item != null) {
                    authorizedTests.add(item.getId());
                }
            });
        }
        List<SampleTypeRequest> prepared = new ArrayList<>();
        for (int index = 0; index < requestedSpecimens.size(); index++) {
            var dto = requestedSpecimens.get(index);
            String field = "requestedSpecimens[" + index + "]";
            if (dto == null) {
                entryError(errors, "requestedSpecimens", "标本列表包含空白记录，请重新选择。");
                continue;
            }
            if (entryText(dto.getId()) || entryText(dto.getSampleId()) || entryText(dto.getStatus())
                    || entryText(dto.getSampleItemId()) || entryText(dto.getCreatedDate())
                    || entryText(dto.getTypeOfSampleName()) || entryText(dto.getUnitOfMeasureName())
                    || entryText(dto.getRequestedTestNames()) || entryText(dto.getRequestedPanelNames())) {
                entryError(errors, field + ".id", "新标本不能携带已有编号、归属、状态或展示字段，请重新确认申请。");
            }
            if (dto.getSortOrder() != null && dto.getSortOrder() != index) {
                entryError(errors, field + ".sortOrder", "标本顺序已变化，请按当前列表重新确认。");
            }
            if (dto.getRequestedQuantity() == null || !Double.isFinite(dto.getRequestedQuantity())
                    || dto.getRequestedQuantity() <= 0) {
                entryError(errors, field + ".requestedQuantity", "标本数量必须为大于零的有效数值。");
            }
            var type = entryId(dto.getTypeOfSampleId()) ? typeOfSampleService.get(dto.getTypeOfSampleId()) : null;
            if (type == null || !type.isActive() || !dto.getTypeOfSampleId().equals(type.getId())) {
                entryError(errors, field + ".typeOfSampleId", "标本类型不存在或已停用，请重新选择。");
                continue;
            }
            var unit = entryId(dto.getUnitOfMeasureId()) ? unitOfMeasureService.get(dto.getUnitOfMeasureId()) : null;
            if (entryText(dto.getUnitOfMeasureId()) && (unit == null || !"Y".equals(unit.getIsActive())
                    || !dto.getUnitOfMeasureId().equals(unit.getId()))) {
                entryError(errors, field + ".unitOfMeasureId", "标本单位不存在或已停用，请重新选择。");
            }
            Set<String> requestedTests = entryIds(dto.getRequestedTests(), errors, field + ".requestedTests", true);
            Set<String> requestedPanels = entryIds(dto.getRequestedPanels(), errors, field + ".requestedPanels", false);
            // Resolve current junction rows and current tests; do not trust display names
            // or the long-lived display-list cache as the master-data authority.
            Set<String> eligibleTests = new HashSet<>();
            var links = typeOfSampleTestService.getTypeOfSampleTestsForSampleType(type.getId());
            if (links != null) {
                for (var link : links) {
                    if (link == null || !type.getId().equals(link.getTypeOfSampleId())) {
                        continue;
                    }
                    var test = entryId(link.getTestId()) ? testService.get(link.getTestId()) : null;
                    if (test != null && link.getTestId().equals(test.getId()) && test.isActive() && test.getOrderable()) {
                        eligibleTests.add(test.getId());
                    }
                }
            }
            if (!eligibleTests.containsAll(requestedTests) || !authorizedTests.containsAll(requestedTests)) {
                entryError(errors, field + ".requestedTests", "检验项目已失效、不适用此标本，或不在当前用户的登记权限内。");
            }
            Set<String> linkedPanels = new HashSet<>();
            if (!requestedPanels.isEmpty()) {
                var panelLinks = typeOfSamplePanelService.getTypeOfSamplePanelsForSampleType(type.getId());
                if (panelLinks != null) {
                    panelLinks.stream().filter(link -> link != null && type.getId().equals(link.getTypeOfSampleId()))
                            .forEach(link -> linkedPanels.add(link.getPanelId()));
                }
            }
            for (String panelId : requestedPanels) {
                var panel = panelService.get(panelId);
                if (panel == null || !panelId.equals(panel.getId()) || !"Y".equals(panel.getIsActive())
                        || !linkedPanels.contains(panelId)) {
                    entryError(errors, field + ".requestedPanels", "检验组合不存在、已停用或不适用此标本。");
                    continue;
                }
                Set<String> relevantMembers = new HashSet<>();
                var members = panelItemService.getPanelItemsForPanel(panelId);
                if (members != null) {
                    for (var member : members) {
                        if (member != null && member.getTest() != null
                                && eligibleTests.contains(member.getTest().getId())) {
                            relevantMembers.add(member.getTest().getId());
                        }
                    }
                }
                // A panel may span specimen types. Require its current type's effective
                // members, never add tests belonging to another tube type implicitly.
                if (relevantMembers.isEmpty() || !requestedTests.containsAll(relevantMembers)
                        || !authorizedTests.containsAll(relevantMembers)) {
                    entryError(errors, field + ".requestedPanels", "检验组合的项目或权限已变化，请重新选择并核对本管项目。");
                }
            }
            var entity = new SampleTypeRequest();
            entity.setSample(sample);
            entity.setTypeOfSample(type);
            entity.setSortOrder(index);
            entity.setRequestedQuantity(dto.getRequestedQuantity());
            entity.setUnitOfMeasure(unit);
            entity.setRequestedTests(String.join(",", requestedTests));
            entity.setRequestedPanels(String.join(",", requestedPanels));
            entity.setStatus(SampleTypeRequest.Status.REQUESTED);
            entity.setCreatedDate(new Timestamp(System.currentTimeMillis()));
            entity.setSysUserId(actor);
            prepared.add(entity);
        }
        if (errors.getErrorCount() != previousErrors) {
            throw new BindException(errors);
        }
        Set<Integer> insertedIds = new HashSet<>();
        List<SampleTypeRequestDTO> saved = new ArrayList<>();
        for (var entity : prepared) {
            Integer id = insert(entity);
            if (id == null || id <= 0 || !insertedIds.add(id)) {
                // Throw through the outer entry transaction. A normal return here would
                // commit a partial order. This is not a durable recovery receipt.
                throw new IllegalStateException("标本申请保存未获得完整结果，请勿重复提交。");
            }
            entity.setId(id);
            saved.add(new SampleTypeRequestDTO(entity));
        }
        return saved;
    }

    private static Set<String> entryIds(String csv, BindingResult errors, String field, boolean required) {
        Set<String> ids = new LinkedHashSet<>();
        if (!entryText(csv)) {
            if (required) {
                entryError(errors, field, "请至少选择一个有效检验项目。");
            }
            return ids;
        }
        for (String value : csv.split(",", -1)) {
            String id = value.trim();
            if (!entryId(id) || !ids.add(id)) {
                entryError(errors, field, "检验项目或组合编号无效、空缺或重复，请重新选择。");
            }
        }
        return ids;
    }

    private static boolean entryId(String value) {
        return value != null && value.matches("[1-9][0-9]*");
    }

    private static boolean entryText(String value) {
        return value != null && !value.isBlank();
    }

    private static void entryError(BindingResult errors, String field, String message) {
        errors.rejectValue(field, "order.entry.specimens.invalid", message);
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
        SampleItem sampleItem = sampleItemService.get(sampleItemId);
        if (sampleItem == null) {
            throw new IllegalArgumentException("SampleItem not found: " + sampleItemId);
        }

        if (fulfillmentIdentityConflict(request, requestId, sampleItem, sampleItemId) != null) {
            throw new IllegalStateException("标本关联的申请、类型或状态不一致，请核对后重试。");
        }
        if (request.getStatus() == SampleTypeRequest.Status.COLLECTED && request.getSampleItem() != null
                && sampleItemId.equals(request.getSampleItem().getId())) {
            initializeLazyAssociations(request);
            return request;
        }
        if (request.getStatus() != SampleTypeRequest.Status.REQUESTED) {
            throw new IllegalStateException("Cannot fulfill request in status: " + request.getStatus());
        }

        request.setStatus(SampleTypeRequest.Status.COLLECTED);
        request.setSampleItem(sampleItem);
        update(request);
        initializeLazyAssociations(request);
        return request;
    }

    /** Identity checks apply to new links AND read-only retries of existing links. */
    private String fulfillmentIdentityConflict(SampleTypeRequest request, Integer requestId, SampleItem item,
            String itemId) {
        if (requestId == null || requestId <= 0 || !requestId.equals(request.getId())
                || !entryId(itemId) || !itemId.equals(item.getId())) {
            return "requestChanged";
        }
        if (request.getSample() == null || item.getSample() == null
                || !entryId(request.getSample().getId())
                || !request.getSample().getId().equals(item.getSample().getId())
                || request.getTypeOfSample() == null || item.getTypeOfSample() == null
                || !entryId(request.getTypeOfSample().getId())
                || !request.getTypeOfSample().getId().equals(item.getTypeOfSample().getId())) {
            return "sampleMismatch";
        }
        if (item.isVoided() || item.isRejected()
                || (request.getStatus() == SampleTypeRequest.Status.REQUESTED && request.getSampleItem() != null)
                || (request.getStatus() == SampleTypeRequest.Status.COLLECTED
                        && (request.getSampleItem() == null || !itemId.equals(request.getSampleItem().getId())))
                || (request.getStatus() != SampleTypeRequest.Status.REQUESTED
                        && request.getStatus() != SampleTypeRequest.Status.COLLECTED)) {
            return "requestChanged";
        }
        return null;
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
