package org.openelisglobal.qaevent.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.qaevent.dao.NceWorkspaceDAO;
import org.openelisglobal.qaevent.form.NceActionCommand;
import org.openelisglobal.qaevent.form.NceRegistrationCommand;
import org.openelisglobal.qaevent.form.NceRegistrationCommand.LinkedSpecimen;
import org.openelisglobal.qaevent.form.NceWorkspaceQuery;
import org.openelisglobal.qaevent.form.NceWorkspaceResponse.*;
import org.openelisglobal.qaevent.service.*;
import org.openelisglobal.qaevent.service.NceWorkspaceAccess.Action;
import org.openelisglobal.qaevent.service.NceWorkspaceAccess.Scope;
import org.openelisglobal.qaevent.valueholder.NcEvent;
import org.openelisglobal.qaevent.valueholder.NceRegistrationReceipt;
import org.openelisglobal.qaevent.valueholder.NceSpecimen;
import org.openelisglobal.sample.dao.SavedOrderReadDAO;
import org.openelisglobal.sampleitem.service.SampleItemService;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.test.service.TestService;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * One transaction owns validation, writes, file compensation and authoritative
 * receipt completion.
 */
@Service
public class NceWorkspaceServiceImpl implements NceWorkspaceService {
    private final NceWorkspaceDAO dao;
    private final SavedOrderReadDAO orders;
    private final NceWorkspaceAccess access;
    private final NceRegistrationFileStore files;
    private final NCEventService events;
    private final NceSpecimenService specimens;
    private final NceHistoryService history;
    private final NceAttachmentService attachments;
    private final NceCategoryService categories;
    private final NceTypeService types;
    private final SystemUserService users;
    private final TestSectionService sections;
    private final TestService tests;
    private final SampleItemService items;
    private final ObjectMapper mapper = new ObjectMapper();

    public NceWorkspaceServiceImpl(NceWorkspaceDAO dao, SavedOrderReadDAO orders, NceWorkspaceAccess access,
            NceRegistrationFileStore files, NCEventService events, NceSpecimenService specimens,
            NceHistoryService history, NceAttachmentService attachments, NceCategoryService categories,
            NceTypeService types, SystemUserService users, TestSectionService sections, TestService tests,
            SampleItemService items) {
        this.dao = dao;
        this.orders = orders;
        this.access = access;
        this.files = files;
        this.events = events;
        this.specimens = specimens;
        this.history = history;
        this.attachments = attachments;
        this.categories = categories;
        this.types = types;
        this.users = users;
        this.sections = sections;
        this.tests = tests;
        this.items = items;
    }

    @Override
    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public Meta meta(HttpServletRequest request) {
        var scope = access.bind(request, Action.SELECT);
        var actor = user(scope.actor().userId());
        Scope addScope = null;
        try {
            addScope = access.forAction(request, scope, Action.ADD);
        } catch (AccessDeniedException noAdd) {
            /* Read scope does not grant registration in that unit. */}
        boolean create = addScope != null && !addScope.sectionIds().isEmpty();
        List<Choice> units = new ArrayList<>();
        for (String id : (create ? addScope.sectionIds() : Set.<String>of()).stream().sorted().toList()) {
            var section = sections.get(id);
            units.add(new Choice(id, sections.getUserLocalizedTesSectionName(section)));
        }
        var categoryViews = categoryViews();
        if (create)
            access.requireUnchanged(request, addScope);
        access.requireUnchanged(request, scope);
        return new Meta("2", scope.actor().userId(), scope.view(), create, create ? null : "NCE_ADD_PERMISSION_DENIED",
                new Reporter(actor.getFirstName(), actor.getLastName(), actor.getLoginName()), List.copyOf(units),
                categoryViews, List.of());
    }

    @Override
    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public Workspace workspace(NceWorkspaceQuery query, HttpServletRequest request) {
        var scope = access.bind(request, Action.SELECT);
        List<Map<String, Object>> visible = new ArrayList<>();
        for (var event : dao.candidates(scope.sectionIds())) {
            try {
                var links = eventLinks(event, scope);
                if (matches(event, links, query))
                    visible.add(eventView(event, links, scope, request));
            } catch (AccessDeniedException invisible) {
                /* Omit only currently unauthorized complete events. */}
        }
        boolean create = access.allowed(request, scope, Action.ADD);
        var categoryViews = categoryViews();
        var paging = paging(query.page(), query.pageSize(), visible.size());
        var page = page(visible, paging);
        access.requireUnchanged(request, scope);
        return new Workspace("2", scope.actor().userId(), scope.view(), query, paging, categoryViews, create,
                create ? null : "NCE_ADD_PERMISSION_DENIED", List.copyOf(page), List.of());
    }

    @Override
    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public Orders orders(String type, String value, int page, int size, HttpServletRequest request) {
        if (!Set.of("labNumber", "STNumber", "firstName", "lastName").contains(type == null ? "" : type))
            throw new IllegalArgumentException("INVALID_NCE_ORDER_QUERY");
        NceRegistrationCommand.text(value, 200, true);
        NceWorkspaceQuery.paging(page, size);
        var scope = access.bind(request, Action.SELECT);
        List<Map<String, Object>> visible = new ArrayList<>();
        for (var sample : dao.searchOrders(type, value)) {
            var graph = orders.loadExact(sample.getAccessionNumber())
                    .orElseThrow(() -> error(409, "NCE_ORDER_CHANGED"));
            try {
                requireOwner(graph, scope);
                visible.add(orderView(graph, scope));
            } catch (AccessDeniedException invisible) {
                /* Search must not reveal a partially authorized owner order. */}
        }
        var paging = paging(page, size, visible.size());
        access.requireUnchanged(request, scope);
        return new Orders("2", scope.actor().userId(), scope.view(),
                map("searchType", type, "value", value, "page", page, "pageSize", size), paging,
                List.copyOf(page(visible, paging)), List.of());
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public Receipt create(NceRegistrationCommand command, List<MultipartFile> uploads, HttpServletRequest request) {
        var scope = access.bind(request, Action.ADD);
        requireActor(command.currentUserId(), scope);
        request.setAttribute("nceCurrentUserId", scope.actor().userId());
        var prepared = files.prepare(uploads);
        String hash = digest("CREATE", command, prepared.stream()
                .map(f -> map("name", f.name(), "type", f.type(), "size", f.size(), "sha256", f.sha256())).toList());
        var existing = dao.receipt(command.requestId());
        if (existing.isPresent())
            return replay(existing.get(), "CREATE", hash, scope);
        requireClassification(command, scope);
        requireLinks(command.linkedSpecimens(), scope);
        var claim = NceRegistrationReceipt.claim(command.requestId(), scope.actor().userId(), "CREATE", hash);
        claim(claim);
        var event = new NcEvent();
        var actor = user(scope.actor().userId());
        event.setSysUserId(scope.actor().userId());
        event.setReportDate(Date.valueOf(LocalDate.now()));
        event.setDateOfEvent(Date.valueOf(NceRegistrationCommand.eventDate(command.dateOfEvent())));
        event.setName(displayName(actor));
        event.setNameOfReporter(displayName(actor));
        event.setTitle(command.title());
        event.setDescription(command.description());
        event.setImmediateAction(command.immediateAction());
        event.setSuspectedCauses(command.suspectedCauses());
        event.setProposedAction(command.proposedAction());
        event.setSeverity(command.severity());
        event.setStatus("Pending");
        event.setReportingUnitId(Integer.valueOf(command.reportingUnit()));
        event.setNceCategoryId(Integer.valueOf(command.nceCategoryId()));
        event.setNceTypeId(command.nceTypeId() == null ? null : Integer.valueOf(command.nceTypeId()));
        var labs = command.linkedSpecimens().stream().map(LinkedSpecimen::labNumber).distinct().toList();
        event.setLabOrderNumber(labs.size() == 1 ? labs.get(0) : null);
        event.setNceNumber(dao.allocateNumber(scope.module(), LocalDate.now().getYear()));
        event = events.save(event);
        for (var link : command.linkedSpecimens()) {
            var ns = new NceSpecimen();
            ns.setNceId(event.getId());
            ns.setSampleItemId(Integer.valueOf(link.sampleItemId()));
            ns.setAnalysisId(link.analysisId() == null ? null : Integer.valueOf(link.analysisId()));
            ns.setSysUserId(scope.actor().userId());
            specimens.save(ns);
        }
        history.logActivity(event.getId(), "CREATED", "Non-conforming event registered", null, "Pending",
                Integer.valueOf(scope.actor().userId()));
        var paths = files.store(event.getId(), prepared);
        for (int i = 0; i < prepared.size(); i++) {
            var f = prepared.get(i);
            attachments.createAttachment(event.getId(), f.name(), paths.get(i).toString(), f.type(), f.size(),
                    Integer.valueOf(scope.actor().userId()));
        }
        dao.flush();
        access.requireUnchanged(request, scope);
        var response = receiptView(event, claim, eventLinks(event, scope));
        dao.complete(claim, event.getId(), json(response));
        return response;
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public Receipt action(String eventId, NceActionCommand command, HttpServletRequest request) {
        NceRegistrationCommand.id(eventId);
        var scope = access.bind(request, Action.UPDATE);
        requireActor(command.currentUserId(), scope);
        request.setAttribute("nceCurrentUserId", scope.actor().userId());
        String hash = digest(command.type(), map("eventId", eventId, "command", command), List.of());
        var existing = dao.receipt(command.requestId());
        if (existing.isPresent())
            return replay(existing.get(), command.type(), hash, scope);
        var event = dao.event(Integer.parseInt(eventId), true).orElseThrow(() -> error(404, "NCE_NOT_FOUND"));
        eventLinks(event, scope);
        if (!Objects.equals(version(event.getLastupdated()), command.lastupdated()))
            throw error(409, "NCE_EVENT_CHANGED");
        if ("ACKNOWLEDGE".equals(command.type()) && !"Pending".equals(event.getStatus()))
            throw error(409, "NCE_EVENT_CHANGED");
        SystemUser assignee = null;
        if ("ASSIGN".equals(command.type())) {
            assignee = user(command.assignedTo());
            if (!"Y".equals(assignee.getIsActive()))
                throw error(409, "NCE_ASSIGNEE_UNAVAILABLE");
        }
        var claim = NceRegistrationReceipt.claim(command.requestId(), scope.actor().userId(), command.type(), hash);
        claim(claim);
        String old = event.getStatus();
        String activity, description;
        switch (command.type()) {
        case "ACKNOWLEDGE" -> {
            event.setStatus("Under Investigation");
            activity = "ACKNOWLEDGED";
            description = command.description() == null ? "Non-conforming event acknowledged" : command.description();
        }
        case "ADD_NOTE" -> {
            activity = "NOTE_ADDED";
            description = command.description();
        }
        case "ASSIGN" -> {
            event.setAssignedTo(Integer.valueOf(command.assignedTo()));
            activity = "ASSIGNED";
            description = "Assigned to " + displayName(assignee);
        }
        default -> throw new IllegalArgumentException("INVALID_NCE_ACTION");
        }
        event.setSysUserId(scope.actor().userId());
        event = events.update(event);
        dao.advanceVersion(event);
        history.logActivity(event.getId(), activity, description, old, event.getStatus(),
                Integer.valueOf(scope.actor().userId()));
        dao.flush();
        access.requireUnchanged(request, scope);
        var response = receiptView(event, claim, eventLinks(event, scope));
        dao.complete(claim, event.getId(), json(response));
        return response;
    }

    @Override
    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public Receipt receipt(String key, String operation, HttpServletRequest request) {
        NceRegistrationCommand.key(key);
        requireOperation(operation);
        var scope = access.bind(request, Action.SELECT);
        var result = dao.receipt(key);
        if (result.isEmpty()) {
            access.requireUnchanged(request, scope);
            return new Receipt("2", scope.actor().userId(), key, null, "NOT_FOUND", operation, null, null, null, null,
                    List.of(), List.of());
        }
        var stored = result.get();
        requireReceiptOwner(stored, operation, scope);
        if (stored.getEventId() == null || stored.getResponseJson() == null)
            throw error(409, "NCE_RECEIPT_INCOMPLETE");
        var event = dao.event(stored.getEventId(), false).orElseThrow(() -> error(409, "NCE_RECEIPT_INCOMPLETE"));
        eventLinks(event, scope);
        var response = readReceipt(stored);
        access.requireUnchanged(request, scope);
        return response;
    }

    @Override
    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public Users users(String search, HttpServletRequest request) {
        search = NceWorkspaceQuery.string(search, 100);
        var scope = access.bind(request, Action.SELECT);
        var result = dao.users(search).stream()
                .map(u -> new User(u.getId(), u.getFirstName(), u.getLastName(), u.getLoginName())).toList();
        access.requireUnchanged(request, scope);
        return new Users("2", scope.actor().userId(), result);
    }

    @Override
    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public Download attachment(String eventId, String id, HttpServletRequest request) {
        NceRegistrationCommand.id(eventId);
        NceRegistrationCommand.id(id);
        var scope = access.bind(request, Action.SELECT);
        var a = attachments.get(Integer.valueOf(id));
        if (a == null || !Objects.equals(a.getNceId(), Integer.valueOf(eventId)))
            throw error(404, "NCE_ATTACHMENT_NOT_FOUND");
        var event = dao.event(Integer.parseInt(eventId), false).orElseThrow(() -> error(404, "NCE_NOT_FOUND"));
        eventLinks(event, scope);
        var file = files.download(a);
        access.requireUnchanged(request, scope);
        return file;
    }

    private void requireClassification(NceRegistrationCommand c, Scope scope) {
        if (!scope.sectionIds().contains(c.reportingUnit()))
            throw denied();
        var category = categories.get(Integer.valueOf(c.nceCategoryId()));
        dao.refresh(category);
        if (category == null || Boolean.FALSE.equals(category.getActive()))
            throw error(409, "NCE_CATEGORY_UNAVAILABLE");
        if (c.nceTypeId() != null) {
            var type = types.get(Integer.valueOf(c.nceTypeId()));
            dao.refresh(type);
            if (type == null || Boolean.FALSE.equals(type.getActive())
                    || !Objects.equals(type.getCategoryId(), category.getId()))
                throw error(409, "NCE_TYPE_UNAVAILABLE");
        }
    }

    private void requireLinks(List<LinkedSpecimen> links, Scope scope) {
        Map<String, SavedOrderReadDAO.Graph> graphs = new LinkedHashMap<>();
        for (var link : links) {
            var graph = graphs.computeIfAbsent(link.labNumber(),
                    lab -> orders.loadExact(lab).orElseThrow(() -> error(404, "NCE_ORDER_NOT_FOUND")));
            dao.lockOwner(graph.sample());
            graph.items().forEach(dao::lockOwner);
            graph.analyses().forEach(dao::lockOwner);
            graph.requests().forEach(dao::lockOwner);
            requireOwner(graph, scope);
            if (!Objects.equals(graph.sample().getId(), link.sampleId())
                    || !Objects.equals(version(graph.sample().getLastupdated()), link.sampleLastupdated()))
                throw error(409, "NCE_ORDER_CHANGED");
            var item = graph.items().stream().filter(i -> Objects.equals(i.getId(), link.sampleItemId())).findFirst()
                    .orElseThrow(() -> error(409, "NCE_SPECIMEN_CHANGED"));
            if (!Objects.equals(version(item.getLastupdated()), link.lastupdated()))
                throw error(409, "NCE_SPECIMEN_CHANGED");
            if (link.analysisId() != null) {
                var a = graph.analyses().stream().filter(v -> Objects.equals(v.getId(), link.analysisId())).findFirst()
                        .orElseThrow(() -> error(409, "NCE_ANALYSIS_CHANGED"));
                if (!Objects.equals(a.getSampleItem().getId(), link.sampleItemId())
                        || !Objects.equals(version(a.getLastupdated()), link.analysisLastupdated()))
                    throw error(409, "NCE_ANALYSIS_CHANGED");
            }
        }
    }

    /**
     * The entire owner order, including requested tests, is the authorization unit.
     */
    private void requireOwner(SavedOrderReadDAO.Graph graph, Scope scope) {
        if (graph.sample() == null || graph.sample().getId() == null || graph.sample().getAccessionNumber() == null)
            throw error(409, "INVALID_NCE_RELATION");
        Set<String> itemIds = new HashSet<>();
        for (var item : graph.items()) {
            if (item == null || item.getSample() == null
                    || !Objects.equals(item.getSample().getId(), graph.sample().getId()) || !itemIds.add(item.getId()))
                throw error(409, "INVALID_NCE_RELATION");
        }
        boolean scoped = false;
        for (var a : graph.analyses()) {
            if (a == null || a.getSampleItem() == null || !itemIds.contains(a.getSampleItem().getId())
                    || a.getSampleItem().getSample() == null
                    || !Objects.equals(a.getSampleItem().getSample().getId(), graph.sample().getId()))
                throw error(409, "INVALID_NCE_RELATION");
            if (a.getTest() == null || a.getTestSection() == null
                    || !scope.sectionIds().contains(a.getTestSection().getId()) || a.getTest().getTestSection() == null
                    || !scope.sectionIds().contains(a.getTest().getTestSection().getId()))
                throw denied();
            scoped = true;
        }
        for (var r : graph.requests()) {
            if (r.getSample() == null || !Objects.equals(r.getSample().getId(), graph.sample().getId())
                    || r.getSampleItem() != null && !itemIds.contains(r.getSampleItem().getId()))
                throw error(409, "INVALID_NCE_RELATION");
            if (r.getRequestedTests() == null || r.getRequestedTests().isBlank())
                throw denied();
            for (String id : r.getRequestedTests().split(",", -1)) {
                try {
                    NceRegistrationCommand.id(id.strip());
                } catch (IllegalArgumentException e) {
                    throw error(409, "INVALID_NCE_RELATION");
                }
                var test = tests.get(id.strip());
                if (test == null || test.getTestSection() == null
                        || !scope.sectionIds().contains(test.getTestSection().getId()))
                    throw denied();
                scoped = true;
            }
        }
        if (!scoped)
            throw denied();
    }

    private List<Map<String, Object>> eventLinks(NcEvent event, Scope scope) {
        List<Map<String, Object>> result = new ArrayList<>();
        Map<String, SavedOrderReadDAO.Graph> graphs = new LinkedHashMap<>();
        for (var link : dao.links(event.getId())) {
            var item = items.get(String.valueOf(link.getSampleItemId()));
            if (item == null || item.getSample() == null || item.getSample().getAccessionNumber() == null)
                throw error(409, "INVALID_NCE_RELATION");
            var graph = graphs.computeIfAbsent(item.getSample().getAccessionNumber(),
                    lab -> orders.loadExact(lab).orElseThrow(() -> error(409, "INVALID_NCE_RELATION")));
            requireOwner(graph, scope);
            if (!Objects.equals(graph.sample().getId(), item.getSample().getId())
                    || graph.items().stream().noneMatch(i -> Objects.equals(i.getId(), item.getId())))
                throw error(409, "INVALID_NCE_RELATION");
            Analysis analysis = null;
            if (link.getAnalysisId() != null) {
                String id = link.getAnalysisId().toString();
                analysis = graph.analyses().stream().filter(a -> Objects.equals(a.getId(), id)).findFirst()
                        .orElseThrow(() -> error(409, "INVALID_NCE_RELATION"));
                if (!Objects.equals(analysis.getSampleItem().getId(), item.getId()))
                    throw error(409, "INVALID_NCE_RELATION");
            }
            result.add(map("sampleId", graph.sample().getId(), "labNumber", graph.sample().getAccessionNumber(),
                    "labOrderNumber", graph.sample().getAccessionNumber(), "sampleLastupdated",
                    version(graph.sample().getLastupdated()), "sampleItemId", item.getId(), "lastupdated",
                    version(item.getLastupdated()), "externalId", item.getExternalId(), "typeName",
                    item.getTypeOfSample() == null ? null : item.getTypeOfSample().getLocalizedName(), "sampleType",
                    item.getTypeOfSample() == null ? null : item.getTypeOfSample().getLocalizedName(), "analysisId",
                    analysis == null ? null : analysis.getId(), "analysisLastupdated",
                    analysis == null ? null : version(analysis.getLastupdated()), "testId",
                    analysis == null ? null : analysis.getTest().getId(), "testName",
                    analysis == null ? null : analysis.getTest().getLocalizedName()));
        }
        if (result.isEmpty() && event.getLabOrderNumber() != null && !event.getLabOrderNumber().isBlank()) {
            var graph = orders.loadExact(event.getLabOrderNumber())
                    .orElseThrow(() -> error(409, "INVALID_NCE_RELATION"));
            requireOwner(graph, scope);
        }
        if (result.isEmpty() && (event.getReportingUnitId() == null
                || !scope.sectionIds().contains(event.getReportingUnitId().toString())))
            throw denied();
        return List.copyOf(result);
    }

    private Map<String, Object> orderView(SavedOrderReadDAO.Graph graph, Scope scope) {
        List<Map<String, Object>> tubes = new ArrayList<>();
        for (var item : graph.items()) {
            List<Map<String, Object>> analysisViews = graph.analyses().stream()
                    .filter(a -> Objects.equals(a.getSampleItem().getId(), item.getId()))
                    .map(a -> map("analysisId", a.getId(), "testId", a.getTest().getId(), "testName",
                            a.getTest().getLocalizedName(), "statusId", a.getStatusId(), "lastupdated",
                            version(a.getLastupdated())))
                    .toList();
            tubes.add(map("sampleItemId", item.getId(), "lastupdated", version(item.getLastupdated()), "externalId",
                    item.getExternalId(), "typeName",
                    item.getTypeOfSample() == null ? null : item.getTypeOfSample().getLocalizedName(), "statusId",
                    item.getStatusId(), "analyses", analysisViews));
        }
        Map<String, Object> patient = null;
        if (graph.patients().size() == 1) {
            var p = graph.patients().get(0);
            var person = p.getPerson();
            patient = map("patientId", p.getId(), "firstName",
                    scope.masked() || person == null ? null : person.getFirstName(), "lastName",
                    scope.masked() || person == null ? null : person.getLastName());
        }
        return map("sampleId", graph.sample().getId(), "labNumber", graph.sample().getAccessionNumber(), "lastupdated",
                version(graph.sample().getLastupdated()), "patient", patient, "specimens", List.copyOf(tubes));
    }

    private Map<String, Object> eventView(NcEvent e, List<Map<String, Object>> links, Scope scope,
            HttpServletRequest request) {
        var record = map("id", e.getId().toString(), "eventId", e.getId().toString(), "nceNumber", e.getNceNumber(),
                "title", e.getTitle(), "description", e.getDescription(), "status", e.getStatus(), "statusCode",
                e.getStatus(), "severity", e.getSeverity(), "nceCategoryId",
                e.getNceCategoryId() == null ? null : e.getNceCategoryId().toString(), "nceTypeId",
                e.getNceTypeId() == null ? null : e.getNceTypeId().toString(), "labOrderNumber", e.getLabOrderNumber(),
                "dateOfEvent", date(e.getDateOfEvent()), "reportDate", date(e.getReportDate()), "nameOfReporter",
                e.getNameOfReporter(), "immediateAction", e.getImmediateAction(), "suspectedCauses",
                e.getSuspectedCauses(), "proposedAction", e.getProposedAction(), "assignedTo",
                e.getAssignedTo() == null ? null : e.getAssignedTo().toString(), "assignedToName",
                e.getAssignedTo() == null ? null : displayName(users.get(e.getAssignedTo().toString())),
                "linkedSpecimens", links, "attachments", attachmentViews(e.getId()), "lastupdated",
                version(e.getLastupdated()));
        List<Map<String, Object>> histories = new ArrayList<>(), notes = new ArrayList<>();
        for (var h : history.findByNceId(e.getId())) {
            String name = h.getUserId() == null ? null : displayName(users.get(h.getUserId().toString()));
            String at = h.getTimestamp() == null ? null : h.getTimestamp().toInstant().toString();
            histories.add(map("id", h.getId().toString(), "activity", h.getActivity(), "description",
                    h.getDescription(), "timestamp", at, "userName", name));
            if ("NOTE_ADDED".equals(h.getActivity()))
                notes.add(
                        map("id", h.getId().toString(), "text", h.getDescription(), "timestamp", at, "userName", name));
        }
        boolean update = false;
        try {
            var updateScope = access.forAction(request, scope, Action.UPDATE);
            eventLinks(e, updateScope);
            update = true;
        } catch (AccessDeniedException unavailable) {
            /* Capability applies to this entire event, not any granted unit. */}
        var mutable = new LinkedHashMap<>(record);
        mutable.put("history", List.copyOf(histories));
        mutable.put("notes", List.copyOf(notes));
        mutable.put("notesCount", notes.size());
        mutable.put("canAcknowledge", update && "Pending".equals(e.getStatus()));
        mutable.put("canAddNote", update);
        mutable.put("canAssign", update);
        mutable.put("actionUnavailableReason", update ? null : "NCE_UPDATE_PERMISSION_DENIED");
        return Collections.unmodifiableMap(mutable);
    }

    private List<Category> categoryViews() {
        var activeTypes = types.getAll().stream().filter(t -> !Boolean.FALSE.equals(t.getActive())).toList();
        return categories.getAll().stream().filter(c -> !Boolean.FALSE.equals(c.getActive())).map(c -> new Category(
                c.getId().toString(), c.getLocalizedName(), c.getDisplayKey(),
                activeTypes.stream().filter(t -> Objects.equals(t.getCategoryId(), c.getId()))
                        .map(t -> new Type(t.getId().toString(), t.getLocalizedName(), t.getDisplayKey())).toList()))
                .toList();
    }

    private List<Map<String, Object>> attachmentViews(int id) {
        return attachments.findByNceId(id).stream()
                .map(a -> map("id", a.getId().toString(), "fileName", a.getFileName(), "fileType", a.getFileType(),
                        "fileSize", a.getFileSize(), "uploadedDate",
                        a.getUploadedDate() == null ? null : a.getUploadedDate().toInstant().toString()))
                .toList();
    }

    private Receipt receiptView(NcEvent event, NceRegistrationReceipt claim, List<Map<String, Object>> links) {
        return new Receipt("2", claim.getCreatedBy(), claim.getId(), claim.getRequestHash(), "APPLIED",
                claim.getOperation(), event.getId().toString(), event.getNceNumber(), event.getStatus(),
                version(event.getLastupdated()), links, attachmentViews(event.getId()));
    }

    private Receipt replay(NceRegistrationReceipt r, String operation, String hash, Scope scope) {
        requireReceiptOwner(r, operation, scope);
        if (!hash.equals(r.getRequestHash()))
            throw error(409, "NCE_REQUEST_REPLAY_MISMATCH");
        if (r.getEventId() == null || r.getResponseJson() == null)
            throw error(409, "NCE_RECEIPT_INCOMPLETE");
        var event = dao.event(r.getEventId(), false).orElseThrow(() -> error(409, "NCE_RECEIPT_INCOMPLETE"));
        eventLinks(event, scope);
        return readReceipt(r);
    }

    private void requireReceiptOwner(NceRegistrationReceipt r, String operation, Scope scope) {
        if (!scope.actor().userId().equals(r.getCreatedBy()))
            throw denied();
        if (!operation.equals(r.getOperation()))
            throw error(409, "NCE_REQUEST_OPERATION_MISMATCH");
    }

    private Receipt readReceipt(NceRegistrationReceipt r) {
        try {
            return mapper.readValue(r.getResponseJson(), Receipt.class);
        } catch (Exception e) {
            throw error(409, "NCE_RECEIPT_INCOMPLETE");
        }
    }

    private void claim(NceRegistrationReceipt r) {
        try {
            dao.claim(r);
        } catch (RuntimeException e) {
            for (Throwable t = e; t != null; t = t.getCause())
                if (t instanceof java.sql.SQLException sql && "23505".equals(sql.getSQLState()))
                    throw new NceWorkspaceException.ClaimCollision(r.getRequestHash());
            throw e;
        }
    }

    private String digest(String operation, Object command, Object files) {
        return NceRegistrationFileStore.hash(
                json(map("hashVersion", "NCE_V2_SHA256_1", "operation", operation, "command", command, "files", files))
                        .getBytes(StandardCharsets.UTF_8));
    }

    private String json(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException("NCE_SERIALIZATION_FAILED", e);
        }
    }

    private boolean matches(NcEvent event, List<Map<String, Object>> links, NceWorkspaceQuery q) {
        if (!q.status().isEmpty() && !Objects.equals(q.status(), event.getStatus()))
            return false;
        if (!q.categoryId().isEmpty() && !Objects.equals(q.categoryId(),
                event.getNceCategoryId() == null ? null : event.getNceCategoryId().toString()))
            return false;
        if (!q.severity().isEmpty() && !Objects.equals(q.severity(), event.getSeverity()))
            return false;
        if (q.keyword().isEmpty())
            return true;
        String keyword = q.keyword().toLowerCase(Locale.ROOT);
        return contains(event.getNceNumber(), keyword) || contains(event.getTitle(), keyword)
                || contains(event.getDescription(), keyword) || contains(event.getLabOrderNumber(), keyword)
                || links.stream().anyMatch(l -> contains((String) l.get("labNumber"), keyword));
    }

    private boolean contains(String value, String keyword) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(keyword);
    }

    private Paging paging(int page, int size, int count) {
        int pages = (count + size - 1) / size;
        if ((count == 0 && page != 1) || (count > 0 && page > pages))
            throw error(409, "NCE_PAGE_CHANGED");
        return new Paging(page, pages, count, size);
    }

    private <T> List<T> page(List<T> rows, Paging p) {
        int start = (p.currentPage() - 1) * p.pageSize();
        return rows.subList(start, Math.min(start + p.pageSize(), rows.size()));
    }

    private SystemUser user(String id) {
        var u = users.get(id);
        dao.refresh(u);
        if (u == null)
            throw error(409, "NCE_USER_UNAVAILABLE");
        return u;
    }

    private void requireActor(String id, Scope scope) {
        if (!Objects.equals(id, scope.actor().userId()))
            throw denied();
    }

    private void requireOperation(String op) {
        if (!Set.of("CREATE", "ACKNOWLEDGE", "ADD_NOTE", "ASSIGN").contains(op == null ? "" : op))
            throw new IllegalArgumentException("INVALID_NCE_OPERATION");
    }

    private String version(Timestamp t) {
        return t == null ? null : t.toString();
    }

    private String date(Date d) {
        return d == null ? null : d.toLocalDate().toString();
    }

    private String displayName(SystemUser u) {
        if (u == null)
            return null;
        String first = u.getFirstName() == null ? "" : u.getFirstName(),
                last = u.getLastName() == null ? "" : u.getLastName();
        boolean chinese = (first + last).codePoints()
                .anyMatch(c -> Character.UnicodeScript.of(c) == Character.UnicodeScript.HAN);
        return chinese ? last + first : (first + " " + last).strip();
    }

    private NceWorkspaceException error(int status, String code) {
        return new NceWorkspaceException(status, code);
    }

    private AccessDeniedException denied() {
        return new AccessDeniedException("NCE_OWNER_SCOPE_DENIED");
    }

    private Map<String, Object> map(Object... entries) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < entries.length; i += 2)
            result.put((String) entries[i], entries[i + 1]);
        return Collections.unmodifiableMap(result);
    }
}
