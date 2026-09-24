package org.openelisglobal.result.service;

import java.sql.Connection;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.result.form.SpecimenResultAdmission;
import org.openelisglobal.sample.form.SpecimenIntakeEvidence;
import org.openelisglobal.sample.service.EntryCurrentStateReader.AnalysisView;
import org.openelisglobal.sample.service.EntryCurrentStateReader.SpecimenView;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Joins an authorized order read with the ordinary result worklist's current
 * admission rules. The result destination and every save still recheck
 * authority.
 */
@Service
public class SpecimenResultAdmissionReader {
    public static final String PERMISSION = "order.intakeAdmission.permission";
    private final ResultSpecimenAvailabilityService availability;
    private final UserService users;

    public SpecimenResultAdmissionReader(ResultSpecimenAvailabilityService availability, UserService users) {
        this.availability = availability;
        this.users = users;
    }

    @Transactional(propagation = Propagation.MANDATORY, readOnly = true)
    public Map<String, SpecimenResultAdmission> read(String sampleId, String actorId, List<SpecimenView> physical,
            List<Analysis> actual) {
        requireCurrentTransaction();
        Map<String, SpecimenResultAdmission> result = new HashMap<>();
        for (var item : physical) {
            result.put(item.id(), SpecimenResultAdmission.unavailable(sampleId, item.id(), item.lastUpdated()));
        }
        if (!positive(sampleId) || !positive(actorId) || actual == null || actual.isEmpty() || actual.size() > 5000
                || result.size() != physical.size()) {
            return Map.copyOf(result);
        }
        Map<String, Analysis> byId = new HashMap<>();
        Set<String> expected = new HashSet<>();
        for (var item : physical) {
            for (var view : item.analyses()) {
                if (!expected.add(view.id())) {
                    return Map.copyOf(result);
                }
            }
        }
        for (var analysis : actual) {
            if (analysis == null || !positive(analysis.getId()) || byId.put(analysis.getId(), analysis) != null) {
                return Map.copyOf(result);
            }
        }
        if (!expected.equals(byId.keySet())) {
            return Map.copyOf(result);
        }
        // Use actual analysis laboratory sections, plus the same test catalog scope
        // as the result save service. Reception permission does not imply Results.
        var permitted = users.filterAnalysesByLabUnitRoles(actorId, actual, Constants.ROLE_RESULTS);
        Set<String> allowedAnalyses = new HashSet<>();
        if (permitted != null) {
            for (var analysis : permitted) {
                if (analysis != null && byId.get(analysis.getId()) == analysis && analysis.getTestSection() != null
                        && positive(analysis.getTestSection().getId())) {
                    allowedAnalyses.add(analysis.getId());
                }
            }
        }
        Set<String> allowedTests = new HashSet<>();
        // A missing Results role is already represented by an empty analysis scope.
        // The legacy catalog adapter assumes that role exists; do not call it when
        // there can be no allowed row, so reception can still inspect the order.
        var tests = allowedAnalyses.isEmpty() ? null
                : users.getAllDisplayUserTestsByLabUnit(actorId, Constants.ROLE_RESULTS);
        if (tests != null) {
            for (var test : tests) {
                if (test != null && positive(test.getId())) {
                    allowedTests.add(test.getId());
                }
            }
        }
        for (var item : physical) {
            List<SpecimenResultAdmission.Item> rows = new ArrayList<>();
            boolean valid = !item.analyses().isEmpty();
            for (var view : item.analyses()) {
                var analysis = byId.get(view.id());
                if (!matches(sampleId, item, view, analysis)) {
                    valid = false;
                    break;
                }
                String reason = PERMISSION;
                if (allowedAnalyses.contains(view.id()) && allowedTests.contains(view.testId())) {
                    var entry = new TestResultItem();
                    entry.setAnalysisId(view.id());
                    entry.setTestId(view.testId());
                    entry.setSampleItemId(item.id());
                    availability.explain(analysis, List.of(entry));
                    reason = entry.getResultEntryBlockedReason();
                    if (entry.isReadOnly() && reason == null) {
                        reason = ResultSpecimenWriteGuard.BLOCKED;
                    }
                }
                rows.add(new SpecimenResultAdmission.Item(view.id(), view.testId(), view.lastUpdated(), reason == null,
                        reason));
            }
            if (valid) {
                long allowed = rows.stream().filter(SpecimenResultAdmission.Item::allowed).count();
                String state = allowed == rows.size() ? "READY" : allowed == 0 ? "BLOCKED" : "PARTIAL";
                result.put(item.id(), new SpecimenResultAdmission(1, sampleId, item.id(), item.lastUpdated(), state,
                        List.copyOf(rows)));
            }
        }
        return Map.copyOf(result);
    }

    private static boolean matches(String sampleId, SpecimenView item, AnalysisView view, Analysis actual) {
        if (actual == null || actual.getSampleItem() == null || actual.getTest() == null
                || actual.getLastupdated() == null || actual.getSampleItem().getSample() == null
                || actual.getSampleItem().getLastupdated() == null) {
            return false;
        }
        var tube = actual.getSampleItem();
        return Objects.equals(sampleId, tube.getSample().getId()) && Objects.equals(item.id(), tube.getId())
                && Objects.equals(item.statusId(), tube.getStatusId()) && item.voided() == tube.isVoided()
                && item.rejected() == tube.isRejected()
                && Objects.equals(item.lastUpdated(), SpecimenIntakeEvidence.wallClockTime(tube.getLastupdated()))
                && Objects.equals(view.testId(), actual.getTest().getId())
                && Objects.equals(view.statusId(), actual.getStatusId())
                && Objects.equals(view.lastUpdated(), SpecimenIntakeEvidence.wallClockTime(actual.getLastupdated()));
    }

    private static void requireCurrentTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                || !Integer.valueOf(Connection.TRANSACTION_REPEATABLE_READ)
                        .equals(TransactionSynchronizationManager.getCurrentTransactionIsolationLevel())) {
            throw new IllegalStateException("Result admission requires the authorized current read transaction");
        }
    }

    private static boolean positive(String value) {
        return value != null && value.matches("[1-9][0-9]{0,9}");
    }
}
