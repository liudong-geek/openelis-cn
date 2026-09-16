package org.openelisglobal.sample.service.impl;

import java.sql.Date;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.openelisglobal.sample.dao.OrderDashboardDAO;
import org.openelisglobal.sample.form.OrderDashboardCriteria;
import org.openelisglobal.sample.form.OrderDashboardQuery;
import org.openelisglobal.sample.form.OrderDashboardRecord;
import org.openelisglobal.sample.form.OrderDashboardResponse;
import org.openelisglobal.sample.form.SpecimenIntakeFacts;
import org.openelisglobal.sample.form.SpecimenIntakeState;
import org.openelisglobal.sample.service.OrderDashboardService;
import org.openelisglobal.sample.valueholder.OrderPriority;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
public class OrderDashboardServiceImpl implements OrderDashboardService {
    private static final List<String> INTAKE_STATUSES = List.of("registration_pending", "collection_pending",
            "label_pending", "qa_pending", "checklist_complete");
    private final OrderDashboardDAO dao;
    private final org.openelisglobal.sample.service.OrderDashboardAccess access;
    private final org.openelisglobal.sample.service.SpecimenIntakeDecisionReader decisions;

    public OrderDashboardServiceImpl(OrderDashboardDAO dao,
            org.openelisglobal.sample.service.OrderDashboardAccess access,
            org.openelisglobal.sample.service.SpecimenIntakeDecisionReader decisions) {
        this.dao = dao;
        this.access = access;
        this.decisions = decisions;
    }

    @Override
    public OrderDashboardResponse getDashboard(OrderDashboardQuery query,
            jakarta.servlet.http.HttpServletRequest request) {
        OrderDashboardCriteria validated = validate(query);
        var scope = access.bind(request);
        var criteria = new OrderDashboardCriteria(validated.offset(), validated.pageSize(), validated.search(),
                validated.intakeStatuses(), validated.priority(), validated.includeExternal(), validated.startDate(),
                validated.endDate(), scope.testIds(), scope.sectionIds(), scope.masked());
        long count = dao.count(criteria);
        var rows = dao.findPage(criteria);
        var physical = dao.tubes(rows.stream().map(OrderDashboardRecord::id).toList(), scope.testIds());
        var orders = rows.stream().map(row -> toOrder(row, scope.masked(),
                decisions.read(row.id(), row.labNumber(), row.patientId(), physical.getOrDefault(row.id(), List.of()))))
                .toList();
        access.requireUnchanged(request, scope);
        return new OrderDashboardResponse(orders, count, null, query.page(), query.pageSize(), "not_included", false);
    }

    /**
     * Existing order-detail consumer uses the same authorized filters as the list.
     */
    @Override
    public Optional<SpecimenIntakeState> getSpecimenIntakeState(String sampleId) {
        if (sampleId == null || !sampleId.matches("[1-9][0-9]*")) {
            throw new IllegalArgumentException("dashboard.sample.invalid");
        }
        var attributes = org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();
        if (!(attributes instanceof org.springframework.web.context.request.ServletRequestAttributes servlet)) {
            throw new org.springframework.security.access.AccessDeniedException("dashboard.access.changed");
        }
        var request = servlet.getRequest();
        var scope = access.bind(request);
        var criteria = new OrderDashboardCriteria(0, 25, null, List.of(), null, false, null, null, scope.testIds(),
                scope.sectionIds(), scope.masked());
        var state = dao.findIntakeFacts(sampleId, criteria).map(this::toState);
        access.requireUnchanged(request, scope);
        return state;
    }

    private OrderDashboardCriteria validate(OrderDashboardQuery query) {
        if (query == null) {
            throw new IllegalArgumentException("dashboard.query.required");
        }
        long offset = ((long) query.page() - 1) * query.pageSize();
        if (query.page() < 1 || !List.of(25, 50, 100).contains(query.pageSize()) || offset > Integer.MAX_VALUE) {
            throw new IllegalArgumentException("dashboard.pagination.invalid");
        }
        String search = trim(query.search());
        if (search != null && search.length() > 200) {
            throw new IllegalArgumentException("dashboard.search.tooLong");
        }
        List<String> legacy = legacyStatuses(trim(query.status()));
        String intake = trim(query.specimenIntakeStatus());
        if ("all".equals(intake)) {
            intake = null;
        }
        if (intake != null && (!INTAKE_STATUSES.contains(intake) || (!legacy.isEmpty() && !legacy.contains(intake)))) {
            throw new IllegalArgumentException("dashboard.status.invalidOrConflicting");
        }
        List<String> statuses = intake == null ? legacy : List.of(intake);
        OrderPriority priority = null;
        String inputPriority = trim(query.priority());
        if (inputPriority != null && !"all".equalsIgnoreCase(inputPriority)) {
            try {
                priority = OrderPriority.valueOf(inputPriority.toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("dashboard.priority.invalid");
            }
        }
        Date start = parseDate(query.startDate());
        Date end = parseDate(query.endDate());
        if (start != null && end != null && start.after(end)) {
            throw new IllegalArgumentException("dashboard.dateRange.invalid");
        }
        return new OrderDashboardCriteria((int) offset, query.pageSize(), search, statuses, priority,
                query.includeExternal(), start, end);
    }

    private List<String> legacyStatuses(String status) {
        if (status == null || "all".equals(status)) {
            return List.of();
        }
        return switch (status) {
        case "in_progress" -> INTAKE_STATUSES.subList(0, 3);
        case "pending_qa" -> List.of("qa_pending");
        case "completed" -> List.of("checklist_complete");
        default -> throw new IllegalArgumentException("dashboard.status.invalid");
        };
    }

    private Date parseDate(String raw) {
        String value = trim(raw);
        if (value == null) {
            return null;
        }
        try {
            if (!value.matches("\\d{4}-\\d{2}-\\d{2}")) {
                throw new DateTimeParseException("ISO date required", value, 0);
            }
            return Date.valueOf(LocalDate.parse(value));
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("dashboard.date.invalid");
        }
    }

    private OrderDashboardResponse.Order toOrder(OrderDashboardRecord row, boolean masked,
            List<org.openelisglobal.sample.service.SpecimenIntakeDecisionReader.Tube> tubes) {
        SpecimenIntakeState state = toState(new SpecimenIntakeFacts(row.registered(), row.collected(),
                row.storageAssigned(), row.qaVerified(), row.hasDisposedSpecimens(), row.hasRejectedSpecimens(),
                row.hasIntakeStatusConflict(), row.hasNoActiveTests()));
        String legacy = state.stepProgress().get("qa") ? "completed"
                : state.stepProgress().get("label") ? "pending_qa" : "in_progress";
        String first = text(row.firstName());
        String last = text(row.lastName());
        // Match the patient-list convention for CJK names; leave other names in
        // first/last order and never display the literal string "null".
        boolean cjk = (first + last).codePoints()
                .anyMatch(c -> Character.UnicodeScript.of(c) == Character.UnicodeScript.HAN);
        String patientName = cjk ? last + first : (first + " " + last).trim();
        return new OrderDashboardResponse.Order(row.id(), row.labNumber(),
                row.lastUpdated() == null ? "" : row.lastUpdated().toString(),
                row.priority() == null ? "routine" : row.priority().name().toLowerCase(Locale.ROOT), false, false,
                masked || patientName.isEmpty() ? "---" : patientName,
                trim(row.facilityName()) == null ? "---" : row.facilityName(), state.stepProgress(), legacy,
                row.storageSkipped(), state.specimenIntakeStatus(), state.statusScope(), state.reportStatus(),
                state.hasDisposedSpecimens(), state.hasRejectedSpecimens(), state.hasIntakeStatusConflict(),
                state.hasNoActiveTests(), state.qaVerificationScope(), summary(tubes),
                "generated_counter_not_physical_print");
    }

    private SpecimenIntakeState toState(SpecimenIntakeFacts facts) {
        boolean enter = facts.registered();
        boolean collect = enter && facts.collected();
        boolean label = collect && facts.stored();
        boolean blocked = facts.hasDisposedSpecimens() || facts.hasRejectedSpecimens()
                || facts.hasIntakeStatusConflict() || facts.hasNoActiveTests();
        boolean qa = label && facts.savedQaSnapshot() && !blocked;
        String intake = !enter ? "registration_pending"
                : !collect ? "collection_pending"
                        : !label ? "label_pending" : !qa ? "qa_pending" : "checklist_complete";
        return new SpecimenIntakeState(Map.of("enter", enter, "collect", collect, "label", label, "qa", qa), intake,
                "preanalytic_progress", "stored_checklist_snapshot_not_acceptance", "not_tracked",
                facts.hasDisposedSpecimens(), facts.hasRejectedSpecimens(), facts.hasIntakeStatusConflict(),
                facts.hasNoActiveTests());
    }

    private OrderDashboardResponse.DecisionSummary summary(
            List<org.openelisglobal.sample.service.SpecimenIntakeDecisionReader.Tube> tubes) {
        int accepted = 0, rejected = 0, missing = 0, review = 0;
        for (var tube : tubes) {
            if ("RECORDED".equals(tube.state()) && "ACCEPTED".equals(tube.recordedDecision()))
                accepted++;
            else if ("RECORDED".equals(tube.state()) && "REJECTED".equals(tube.recordedDecision()))
                rejected++;
            else if ("NOT_RECORDED".equals(tube.state()))
                missing++;
            else
                review++;
        }
        return new OrderDashboardResponse.DecisionSummary(accepted, rejected, missing, review, false);
    }

    private static String trim(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String text(String value) {
        return value == null ? "" : value.trim();
    }
}
