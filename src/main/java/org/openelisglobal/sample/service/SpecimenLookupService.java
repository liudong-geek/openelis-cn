package org.openelisglobal.sample.service;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.List;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.config.EntryRecoveryTransactionManager;
import org.openelisglobal.sample.dao.OrderDashboardDAO;
import org.openelisglobal.sample.dao.SpecimenLookupCandidateDAO;
import org.openelisglobal.sample.exception.EntrySubmissionException;
import org.openelisglobal.sample.form.OrderDashboardCriteria;
import org.openelisglobal.sample.form.SpecimenIntakeEvidence;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Daily read-only lookup with the existing Reception and whole-order Test scope. */
@Service
public class SpecimenLookupService {
    private final SpecimenLookupCandidateDAO candidates;
    private final EntryCurrentStateReader currentStates;
    private final OrderDashboardDAO dashboard;
    private final OrderDashboardAccess access;
    private final DefaultConfigurationProperties configuration;

    public SpecimenLookupService(SpecimenLookupCandidateDAO candidates, EntryCurrentStateReader currentStates,
            OrderDashboardDAO dashboard, OrderDashboardAccess access, DefaultConfigurationProperties configuration) {
        this.candidates = candidates;
        this.currentStates = currentStates;
        this.dashboard = dashboard;
        this.access = access;
        this.configuration = configuration;
    }

    public record Selection(String sampleId, String sampleItemId, String requestId) {
    }

    public record Patient(String id, String firstName, String lastName, String gender, String birthDate) {
    }

    public record RequestedSpecimen(String id, String typeOfSampleId, String sampleTypeName, String status,
            String sampleItemId) {
    }

    public record PhysicalSpecimen(String id, String requestId, String sortOrder, String typeOfSampleId,
            String statusId, boolean voided, boolean rejected, String collectionDate, String receivedDate,
            String decisionState, String recordedDecision, String expectedEvidenceDigest, String operationId,
            SpecimenIntakeDecision.Reason recordedReason, String recordedEvidenceDigest) {
    }

    public record Current(String sampleId, String labNo, String orderStatusId, boolean patientMasked, Patient patient,
            List<RequestedSpecimen> requestedSpecimens, List<PhysicalSpecimen> physicalSpecimens,
            SpecimenIntakeDecisionReader.Reasons intakeReasons) {
    }

    public record Result(int version, String source, boolean readOnly, String matchedKind, Selection selection,
            Current current, String generatedAt) {
    }

    public static final class Failure extends RuntimeException {
        private final int status;
        private final String code;

        public Failure(int status, String code, String message) {
            super(message);
            this.status = status;
            this.code = code;
        }

        public int status() {
            return status;
        }

        public String code() {
            return code;
        }
    }

    @Transactional(transactionManager = EntryRecoveryTransactionManager.BEAN_NAME,
            propagation = Propagation.REQUIRES_NEW, isolation = Isolation.REPEATABLE_READ,
            readOnly = true, rollbackFor = Exception.class, timeout = 20)
    public Result lookup(String code, HttpServletRequest request) {
        if (code == null || !code.matches("[A-Za-z0-9._-]{1,30}")) {
            throw fail(400, "SPECIMEN_LOOKUP_INVALID_CODE", "请输入有效的本地申请号或标本管码。");
        }
        // bind checks the current Reception/GlobalAdmin role, account, session and lab
        // unit; Scope also snapshots the user's current Reception Test/section grants.
        var scope = access.bind(request);
        var found = candidates.exactMatches(code);
        if (found == null || found.overflow()) {
            throw fail(409, "SPECIMEN_LOOKUP_STATE_CONFLICT", "查询范围内的标本记录过多或状态不完整，请联系管理员核对。");
        }
        if (found.matches().isEmpty()) {
            throw fail(404, "SPECIMEN_LOOKUP_NOT_FOUND", "未查到对应的本地临床申请或实管。");
        }
        if (found.matches().size() > 1) {
            throw fail(409, "SPECIMEN_LOOKUP_AMBIGUOUS", "该编码对应多个申请或实管，请联系管理员核对。");
        }
        var match = found.matches().get(0);
        if (!validIdentity(match) || (match.specimen()
                ? !code.equals(match.labNo() + "." + match.sortOrder())
                : !code.equals(match.labNo()))) {
            throw fail(409, "SPECIMEN_LOOKUP_STATE_CONFLICT", "申请或实管身份记录不完整，请联系管理员核对。");
        }
        String clinicalDomain = configuration.getPropertyValue("domain.human");
        if (clinicalDomain == null || clinicalDomain.isBlank()) {
            throw fail(503, "SPECIMEN_LOOKUP_UNAVAILABLE", "临床申请配置暂不可用，请稍后重试。");
        }
        if (!clinicalDomain.equals(match.domain())) {
            throw fail(409, "SPECIMEN_LOOKUP_UNSUPPORTED", "此编码不属于本地临床采收范围。");
        }
        // The existing dashboard filter refuses partial orders: every current
        // Analysis and logical-request Test must belong to this Reception scope.
        var criteria = new OrderDashboardCriteria(0, 25, null, List.of(), null, false, null, null,
                scope.testIds(), scope.sectionIds(), scope.masked());
        if (dashboard.findIntakeFacts(match.sampleId(), criteria).isEmpty()) {
            throw new AccessDeniedException("Whole-order Reception scope denied");
        }

        EntryCurrentStateReader.Snapshot snapshot;
        try {
            // Independently rechecks all current request Tests and every physical
            // Analysis, including canceled ones, before loading patient details.
            snapshot = currentStates.readCurrentClinical(match.sampleId(), scope.actor().userId());
        } catch (EntrySubmissionException oldState) {
            if ("ENTRY_CURRENT_STATE_UNSUPPORTED".equals(oldState.getCode())
                    || "SPECIMEN_LOOKUP_LEGACY_READONLY".equals(oldState.getCode())) {
                throw fail(409, "SPECIMEN_LOOKUP_LEGACY_READONLY", "该旧申请的标本关系暂不支持在采收工作区操作，请使用原查看入口核对。");
            }
            throw fail(409, "SPECIMEN_LOOKUP_STATE_CONFLICT", "当前申请或标本关系不完整，请联系管理员核对。");
        }
        if (snapshot == null || !match.sampleId().equals(snapshot.sampleId())
                || !match.labNo().equals(snapshot.labNo()) || !"clinical".equals(snapshot.workflowType())) {
            throw fail(409, "SPECIMEN_LOOKUP_STATE_CONFLICT", "申请身份在查询期间发生变化，请重新核对。");
        }

        Selection selection = new Selection(match.sampleId(), null, null);
        if (match.specimen()) {
            List<EntryCurrentStateReader.SpecimenView> selected = snapshot.physicalSpecimens().stream()
                    .filter(item -> match.sampleItemId().equals(item.id())).toList();
            if (selected.size() != 1 || !code.equals(snapshot.labNo() + "." + selected.get(0).sortOrder())
                    || selected.get(0).requestId() == null || snapshot.requestedSpecimens().stream()
                            .filter(row -> selected.get(0).requestId().equals(row.id())
                                    && match.sampleItemId().equals(row.sampleItemId())).count() != 1) {
                throw fail(409, "SPECIMEN_LOOKUP_STATE_CONFLICT", "实管与申请的关联已变化，请重新核对。");
            }
            selection = new Selection(match.sampleId(), match.sampleItemId(), selected.get(0).requestId());
        }
        access.requireUnchanged(request, scope);
        return new Result(1, "specimen_lookup", true, match.specimen() ? "specimen" : "order", selection,
                project(snapshot, scope.masked()), Instant.now().toString());
    }

    private Current project(EntryCurrentStateReader.Snapshot snapshot, boolean masked) {
        Patient patient = null;
        if (!masked && snapshot.patient() != null) {
            var value = snapshot.patient();
            patient = new Patient(value.id(), value.firstName(), value.lastName(), value.gender(), value.birthDate());
        }
        var decisions = snapshot.specimenDecisions();
        var types = snapshot.collectionContext() == null ? List.<EntryCurrentStateReader.MasterDataView>of()
                : snapshot.collectionContext().masterData();
        var requested = snapshot.requestedSpecimens().stream()
                .map(row -> new RequestedSpecimen(row.id(), row.typeOfSampleId(), types.stream()
                        .filter(type -> "TYPE".equals(type.kind()) && row.typeOfSampleId().equals(type.id()))
                        .findFirst().map(EntryCurrentStateReader.MasterDataView::name).orElse(null), row.status(),
                        row.sampleItemId()))
                .toList();
        var physical = snapshot.physicalSpecimens().stream().map(item -> {
            var matches = decisions.stream().filter(row -> item.id().equals(row.sampleItemId())).toList();
            String state = matches.size() == 1 ? matches.get(0).state() : "REVIEW_REQUIRED";
            String decision = matches.size() == 1 ? matches.get(0).recordedDecision() : null;
            String operation = "RECORDED".equals(state) ? matches.get(0).operationId() : null;
            boolean recordedRejection = !masked && "RECORDED".equals(state) && "REJECTED".equals(decision)
                    && item.rejected();
            SpecimenIntakeDecision.Reason recordedReason = recordedRejection
                    ? matches.get(0).reason() : null;
            String recordedEvidenceDigest = recordedRejection
                    ? matches.get(0).evidenceDigest() : null;
            String expectedEvidenceDigest = null;
            if (!masked && snapshot.patient() != null && "NOT_RECORDED".equals(state)
                    && item.collectionDate() != null && item.receivedDate() != null && !item.voided()
                    && !item.rejected()) {
                var linked = snapshot.requestedSpecimens().stream()
                        .filter(row -> row.id().equals(item.requestId()) && item.id().equals(row.sampleItemId())
                                && "COLLECTED".equals(row.status())
                                && item.typeOfSampleId().equals(row.typeOfSampleId()))
                        .toList();
                if (linked.size() == 1) {
                    expectedEvidenceDigest = evidenceDigest(snapshot, linked.get(0), item);
                }
            }
            return new PhysicalSpecimen(item.id(), item.requestId(), item.sortOrder(), item.typeOfSampleId(),
                    item.statusId(), item.voided(), item.rejected(), item.collectionDate(), item.receivedDate(),
                    state, decision, expectedEvidenceDigest, operation, recordedReason, recordedEvidenceDigest);
        }).toList();
        return new Current(snapshot.sampleId(), snapshot.labNo(), snapshot.orderStatusId(), masked, patient, requested,
                physical, masked ? null : snapshot.intakeReasons());
    }

    private static String evidenceDigest(EntryCurrentStateReader.Snapshot snapshot,
            EntryCurrentStateReader.RequestView request, EntryCurrentStateReader.SpecimenView item) {
        if (item.analyses() == null || item.analyses().stream().anyMatch(java.util.Objects::isNull)) {
            return null;
        }
        try {
            var evidence = new SpecimenIntakeEvidence(1, snapshot.lastUpdated(), request.lastUpdated(),
                    item.lastUpdated(), item.typeOfSampleId(), item.collectionDate(), item.receivedDate(),
                    item.analyses().stream()
                            .map(analysis -> new SpecimenIntakeEvidence.Analysis(analysis.id(), analysis.testId(),
                                    analysis.lastUpdated()))
                            .toList());
            return SpecimenIntakeEvidence.digest(evidence.encode());
        } catch (IllegalArgumentException invalidEvidence) {
            // A legacy or incomplete row remains visible for review, without an
            // actionable decision digest.
            return null;
        }
    }

    private static boolean validIdentity(SpecimenLookupCandidateDAO.Candidate candidate) {
        if (candidate == null || candidate.sampleId() == null
                || !candidate.sampleId().matches("[1-9][0-9]*") || candidate.labNo() == null
                || candidate.labNo().isBlank() || candidate.domain() == null) {
            return false;
        }
        return !candidate.specimen() || candidate.sampleItemId().matches("[1-9][0-9]*")
                && candidate.sortOrder() != null && candidate.sortOrder().matches("[1-9][0-9]{0,4}");
    }

    private static Failure fail(int status, String code, String message) {
        return new Failure(status, code, message);
    }
}
