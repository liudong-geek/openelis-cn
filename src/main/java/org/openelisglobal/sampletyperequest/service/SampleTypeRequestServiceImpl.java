package org.openelisglobal.sampletyperequest.service;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.service.AuditableBaseObjectServiceImpl;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.panel.service.PanelService;
import org.openelisglobal.panelitem.service.PanelItemService;
import org.openelisglobal.sample.exception.SampleCollectionValidationException;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.dao.SampleItemDAO;
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
    private SampleItemDAO sampleItemDAO;
    @Autowired
    private IStatusService statusService;

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
    public int fulfillMatchingRequests(String sampleId, List<SampleItem> sampleItems,
            Map<String, Integer> requestIdsByItemId) {
        if (sampleId == null || sampleId.trim().isEmpty() || sampleItems == null || sampleItems.isEmpty()) {
            return 0;
        }
        Map<SampleItem, Integer> explicit = new IdentityHashMap<>();
        for (SampleItem item : sampleItems) {
            if (item != null && requestIdsByItemId.containsKey(item.getId())) {
                explicit.put(item, requestIdsByItemId.get(item.getId()));
            }
        }
        List<SampleTypeRequest> allRequests = sampleTypeRequestDAO.getRequestsBySampleIdForUpdate(sampleId);
        Map<SampleItem, Integer> matches = matchRequests(sampleId, sampleItems, explicit, allRequests);
        // Validate the entire batch before mutating even one managed request.
        for (Map.Entry<SampleItem, Integer> entry : matches.entrySet()) {
            SampleTypeRequest request = allRequests.stream().filter(r -> entry.getValue().equals(r.getId())).findFirst()
                    .orElseThrow();
            if (request.getStatus() == SampleTypeRequest.Status.COLLECTED) {
                continue; // An exact bound replay is read-only, including its audit history.
            }
            request.setStatus(SampleTypeRequest.Status.COLLECTED);
            request.setSampleItem(entry.getKey());
            request.setSysUserId(entry.getKey().getSysUserId());
            update(request);
        }
        return matches.size();
    }

    @Override
    @Transactional
    public Map<SampleItem, Integer> validateCollectionMatches(String sampleId, List<SampleItem> sampleItems,
            Map<SampleItem, Integer> explicitRequestIds) {
        if (sampleItems == null || sampleItems.isEmpty())
            return Collections.emptyMap();
        if (sampleId == null || sampleId.isBlank()) {
            if (!explicitRequestIds.isEmpty())
                throw collectionError(409, "sampleMismatch");
            return Collections.emptyMap();
        }
        List<SampleTypeRequest> requests = sampleTypeRequestDAO.getRequestsBySampleIdForUpdate(sampleId);
        Map<SampleItem, Integer> matches = matchRequests(sampleId, sampleItems, explicitRequestIds, requests);
        // Include voided physical rows: their barcode identity must never be reused.
        List<SampleItem> existingItems = sampleItemDAO.getSampleItemsBySampleId(sampleId);
        if (existingItems == null) {
            throw collectionError(409, "requestChanged");
        }
        Set<Integer> occupied = new HashSet<>();
        for (SampleItem existing : existingItems) {
            try {
                if (existing == null || existing.getSortOrder() == null
                        || !existing.getSortOrder().matches("[1-9][0-9]*")
                        || !occupied.add(Integer.valueOf(existing.getSortOrder()))) {
                    throw collectionError(409, "requestChanged");
                }
            } catch (NumberFormatException failure) {
                throw collectionError(409, "requestChanged");
            }
        }
        List<SampleTypeRequest> ordered = requests.stream()
                .sorted(Comparator.comparing(SampleTypeRequest::getSortOrder, Comparator.nullsLast(Integer::compareTo))
                        .thenComparing(SampleTypeRequest::getId)).toList();
        // Visit the submitted list, not IdentityHashMap's unstable iteration order.
        for (SampleItem item : sampleItems) {
            if (!matches.containsKey(item)) {
                continue;
            }
            if (item.getId() != null)
                continue; // Never renumber an existing physical tube.
            SampleTypeRequest request = ordered.stream().filter(r -> matches.get(item).equals(r.getId())).findFirst()
                    .orElseThrow();
            int number = ordered.indexOf(request) + 1;
            if (occupied.contains(number)) {
                long next = Math.max((long) ordered.size(), occupied.stream().mapToInt(Integer::intValue).max().orElse(0)) + 1;
                if (next > Integer.MAX_VALUE) {
                    throw collectionError(409, "requestChanged");
                }
                number = (int) next;
            }
            occupied.add(number);
            String tubeNumber = Integer.toString(number);
            item.setSortOrder(tubeNumber);
            item.setExternalId(item.getSample().getAccessionNumber() + "-" + tubeNumber);
        }
        return matches;
    }

    private Map<SampleItem, Integer> matchRequests(String sampleId, List<SampleItem> sampleItems,
            Map<SampleItem, Integer> explicit, List<SampleTypeRequest> allRequests) {
        Map<SampleItem, Integer> matches = new IdentityHashMap<>();
        Set<Integer> usedRequestIds = new HashSet<>();
        Set<String> seenItemIds = new HashSet<>();
        Set<String> alreadyLinkedItemIds = new HashSet<>();
        Set<Integer> allIds = new HashSet<>();
        for (SampleTypeRequest request : allRequests) {
            if (request == null || request.getId() == null || !allIds.add(request.getId())) {
                throw collectionError(409, "requestChanged");
            }
            if (request.getSampleItem() != null && (request.getSampleItem().getId() == null
                    || !alreadyLinkedItemIds.add(request.getSampleItem().getId()))) {
                throw collectionError(409, "requestChanged");
            }
        }
        List<SampleItem> legacy = new ArrayList<>();
        for (SampleItem item : sampleItems) {
            if (item == null || item.getSample() == null || !sampleId.equals(item.getSample().getId())) {
                throw collectionError(409, "sampleMismatch");
            }
            if (item.getId() != null && !seenItemIds.add(item.getId()))
                throw collectionError(400, "requestInvalid");
            Integer requestId = explicit.get(item);
            if (requestId != null) {
                if (requestId <= 0 || !usedRequestIds.add(requestId))
                    throw collectionError(400, "requestInvalid");
                SampleTypeRequest request = allRequests.stream().filter(r -> requestId.equals(r.getId())).findFirst()
                        .orElseThrow(() -> collectionError(409, "requestChanged"));
                if (request.getSample() == null || !sampleId.equals(request.getSample().getId())
                        || request.getTypeOfSample() == null || item.getTypeOfSample() == null
                        || !request.getTypeOfSample().getId().equals(item.getTypeOfSample().getId())) {
                    throw collectionError(409, "sampleMismatch");
                }
                requireCollectedItem(item);
                if (request.getStatus() == SampleTypeRequest.Status.COLLECTED && request.getSampleItem() != null) {
                    SampleItem original = request.getSampleItem();
                    requireCollectedItem(original);
                    if (original.getSample() == null || !sampleId.equals(original.getSample().getId())
                            || original.getTypeOfSample() == null
                            || !request.getTypeOfSample().getId().equals(original.getTypeOfSample().getId())
                            || (item.getId() != null && !item.getId().equals(original.getId()))
                            || original.getCollectionDate().getTime() / 60000 != item.getCollectionDate().getTime() / 60000) {
                        throw collectionError(409, "requestChanged");
                    }
                    // Resolve a lost response by the original request identity, not a
                    // fresh physical row. Preserve every committed collection field.
                    item.setId(original.getId()); item.setSortOrder(original.getSortOrder());
                    item.setCollectionDate(original.getCollectionDate()); item.setCollector(original.getCollector());
                    item.setReceivedDate(original.getReceivedDate()); item.setQuantity(original.getQuantity());
                    item.setUnitOfMeasure(original.getUnitOfMeasure()); item.setCollectionConditions(original.getCollectionConditions());
                    matches.put(item, requestId);
                    continue;
                }
                if (request.getStatus() != SampleTypeRequest.Status.REQUESTED || request.getSampleItem() != null) {
                    throw collectionError(409, "requestChanged");
                }
                if (alreadyLinkedItemIds.contains(item.getId()))
                    throw collectionError(409, "requestChanged");
                matches.put(item, requestId);
            } else if (!alreadyLinkedItemIds.contains(item.getId()) && item.getCollectionDate() != null
                    && !item.isVoided() && !item.isRejected()) {
                legacy.add(item);
            }
        }
        for (SampleItem item : legacy) {
            if (item.getTypeOfSample() == null)
                continue;
            List<SampleTypeRequest> candidates = allRequests.stream()
                    .filter(r -> r.getStatus() == SampleTypeRequest.Status.REQUESTED && r.getSampleItem() == null)
                    .filter(r -> !usedRequestIds.contains(r.getId()) && r.getTypeOfSample() != null)
                    .filter(r -> item.getTypeOfSample().getId().equals(r.getTypeOfSample().getId())).toList();
            if (candidates.isEmpty())
                continue;
            long matchingItems = legacy.stream().filter(i -> i.getTypeOfSample() != null
                    && item.getTypeOfSample().getId().equals(i.getTypeOfSample().getId())).count();
            if (candidates.size() != 1 || matchingItems != 1)
                throw collectionError(409, "ambiguousRequest");
            requireCollectedItem(item);
            matches.put(item, candidates.getFirst().getId());
            usedRequestIds.add(candidates.getFirst().getId());
        }
        return matches;
    }

    private void requireCollectedItem(SampleItem item) {
        if (item.getCollectionDate() == null || item.getCollectionDate().getTime() > System.currentTimeMillis()) {
            throw collectionError(400, "dateTimeInvalid");
        }
        if (item.isVoided() || item.isRejected() || !statusService.matches(item.getStatusId(), SampleStatus.Entered)) {
            throw collectionError(409, "requestChanged");
        }
    }

    private SampleCollectionValidationException collectionError(int status, String key) {
        return new SampleCollectionValidationException(status, "collection." + key);
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
