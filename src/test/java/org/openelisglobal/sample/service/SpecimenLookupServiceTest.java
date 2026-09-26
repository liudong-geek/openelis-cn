package org.openelisglobal.sample.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.lang.reflect.Constructor;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.sample.dao.OrderDashboardDAO;
import org.openelisglobal.sample.dao.SpecimenLookupCandidateDAO;
import org.openelisglobal.sample.dao.SpecimenLookupCandidateDAO.Candidate;
import org.openelisglobal.sample.form.OrderDashboardCriteria;
import org.openelisglobal.sample.form.SpecimenIntakeFacts;
import org.openelisglobal.sample.form.SpecimenIntakeEvidence;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;

public class SpecimenLookupServiceTest {
    private SpecimenLookupCandidateDAO candidates;
    private EntryCurrentStateReader currentStates;
    private OrderDashboardDAO dashboard;
    private OrderDashboardAccess access;
    private SpecimenLookupService service;
    private MockHttpServletRequest request;
    private OrderDashboardAccess.Scope scope;

    @Before
    public void setUp() throws Exception {
        candidates = mock(SpecimenLookupCandidateDAO.class);
        currentStates = mock(EntryCurrentStateReader.class);
        dashboard = mock(OrderDashboardDAO.class);
        access = mock(OrderDashboardAccess.class);
        var configuration = mock(DefaultConfigurationProperties.class);
        when(configuration.getPropertyValue("domain.human")).thenReturn("H");
        request = new MockHttpServletRequest();
        scope = scope(false);
        when(access.bind(request)).thenReturn(scope);
        when(dashboard.findIntakeFacts(anyString(), any())).thenReturn(Optional.of(
                new SpecimenIntakeFacts(true, false, false, false, false, false, false, false)));
        service = new SpecimenLookupService(candidates, currentStates, dashboard, access, configuration);
    }

    private OrderDashboardAccess.Scope scope(boolean masked) throws Exception {
        Constructor<OrderEntryActorGuard.BoundActor> constructor = OrderEntryActorGuard.BoundActor.class
                .getDeclaredConstructor(org.springframework.security.core.Authentication.class, Object.class,
                        String.class, String.class, jakarta.servlet.http.HttpSession.class, int.class, Set.class);
        constructor.setAccessible(true);
        var actor = constructor.newInstance(null, null, "operator", "7", null, 1, Set.of());
        return new OrderDashboardAccess.Scope(actor, List.of("41"), List.of("3"), masked);
    }

    private EntryCurrentStateReader.Snapshot snapshot() {
        var patient = new EntryCurrentStateReader.PatientView("601", "SECRET-NATIONAL-ID", "小明", "王", "M",
                "1990-01-02");
        var requested = List.of(new EntryCurrentStateReader.RequestView("701", 0, "31", 1.0, null,
                List.of("41"), List.of(), "COLLECTED", "801", null, null));
        var physical = List.of(new EntryCurrentStateReader.SpecimenView("801", "701", "1", "31", 1.0, null,
                "12", false, false, "2026-09-26T01:00:00Z", "2026-09-26T02:00:00Z", "collector", null,
                List.of(new EntryCurrentStateReader.AnalysisView("901", "41", "13", null))));
        return new EntryCurrentStateReader.Snapshot(1, true, "301", "SIM.1", "clinical", "11", null, patient,
                requested, physical);
    }

    private EntryCurrentStateReader.Snapshot decisionSnapshot(String received, String state, String operation,
            String requestVersion) {
        var original = snapshot();
        var requested = List.of(new EntryCurrentStateReader.RequestView("701", 0, "31", 1.0, null,
                List.of("41"), List.of(), "COLLECTED", "801", "2026-09-26T00:00:00Z", requestVersion));
        var physical = List.of(new EntryCurrentStateReader.SpecimenView("801", "701", "1", "31", 1.0, null,
                "12", false, false, "2026-09-26T01:00:00Z", received, "collector", "2026-09-26T02:01:00Z",
                List.of(new EntryCurrentStateReader.AnalysisView("901", "41", "13", "2026-09-26T01:02:00Z"))));
        var decisions = List.of(new SpecimenIntakeDecisionReader.Tube("801", state,
                "RECORDED".equals(state) ? "ACCEPTED" : null, operation, null, null, null, false, null));
        return new EntryCurrentStateReader.Snapshot(1, true, "301", "SIM.1", "clinical", "11",
                "2026-09-26T01:00:00Z", original.patient(), requested, physical, null, null, decisions);
    }

    private void found(Candidate... matches) {
        when(candidates.exactMatches(anyString()))
                .thenReturn(new SpecimenLookupCandidateDAO.Candidates(List.of(matches), false));
        when(currentStates.readCurrentClinical("301", "7")).thenReturn(snapshot());
    }

    @Test
    public void otherOperatorCanReadOnlyLookupOrderAfterWholeOrderScopeAndTestChecks() {
        found(new Candidate("301", "SIM.1", "H", null, null));
        var result = service.lookup("SIM.1", request);
        assertEquals("order", result.matchedKind());
        assertTrue(result.readOnly());
        assertNull(result.selection().sampleItemId());
        assertEquals("王", result.current().patient().lastName());
        assertEquals("COLLECTED", result.current().requestedSpecimens().get(0).status());
        var criteria = org.mockito.ArgumentCaptor.forClass(OrderDashboardCriteria.class);
        verify(dashboard).findIntakeFacts(eq("301"), criteria.capture());
        assertEquals(List.of("41"), criteria.getValue().testIds());
        assertEquals(List.of("3"), criteria.getValue().sectionIds());
        verify(currentStates).readCurrentClinical("301", "7");
        verify(access).requireUnchanged(request, scope);
        assertFalse(result.toString().contains("SECRET-NATIONAL-ID"));
    }

    @Test
    public void exactRealTubeSelectsItsLinkedRequestNotATypeOrArrayPosition() {
        found(new Candidate("301", "SIM.1", "H", "801", "1"));
        var result = service.lookup("SIM.1.1", request);
        assertEquals("specimen", result.matchedKind());
        assertEquals("801", result.selection().sampleItemId());
        assertEquals("701", result.selection().requestId());
        assertEquals("12", result.current().physicalSpecimens().get(0).statusId());
    }

    @Test
    public void signedUndecidedTubeExposesTheSameEvidenceDigestAsTheWriteContract() {
        found(new Candidate("301", "SIM.1", "H", "801", "1"));
        when(currentStates.readCurrentClinical("301", "7")).thenReturn(
                decisionSnapshot("2026-09-26T02:00:00Z", "NOT_RECORDED", null, "2026-09-26T01:01:00Z"));

        var tube = service.lookup("SIM.1.1", request).current().physicalSpecimens().get(0);
        var expected = new SpecimenIntakeEvidence(1, "2026-09-26T01:00:00Z", "2026-09-26T01:01:00Z",
                "2026-09-26T02:01:00Z", "31", "2026-09-26T01:00:00Z", "2026-09-26T02:00:00Z",
                List.of(new SpecimenIntakeEvidence.Analysis("901", "41", "2026-09-26T01:02:00Z")));
        assertEquals(SpecimenIntakeEvidence.digest(expected.encode()), tube.expectedEvidenceDigest());
        assertNull(tube.operationId());
    }

    @Test
    public void noDecisionDigestBeforeReceiptOrForIncompleteFacts() {
        found(new Candidate("301", "SIM.1", "H", "801", "1"));
        when(currentStates.readCurrentClinical("301", "7"))
                .thenReturn(decisionSnapshot(null, "NOT_RECORDED", null, "2026-09-26T01:01:00Z"));
        assertNull(service.lookup("SIM.1.1", request).current().physicalSpecimens().get(0).expectedEvidenceDigest());

        when(currentStates.readCurrentClinical("301", "7")).thenReturn(
                decisionSnapshot("2026-09-26T02:00:00Z", "NOT_RECORDED", null, null));
        assertNull(service.lookup("SIM.1.1", request).current().physicalSpecimens().get(0).expectedEvidenceDigest());
    }

    @Test
    public void recordedDecisionReturnsOperationIdButNeverOffersANewDigest() {
        found(new Candidate("301", "SIM.1", "H", "801", "1"));
        String operation = "11111111-2222-4333-8444-555555555555";
        when(currentStates.readCurrentClinical("301", "7")).thenReturn(
                decisionSnapshot("2026-09-26T02:00:00Z", "RECORDED", operation, "2026-09-26T01:01:00Z"));

        var tube = service.lookup("SIM.1.1", request).current().physicalSpecimens().get(0);
        assertEquals(operation, tube.operationId());
        assertEquals("ACCEPTED", tube.recordedDecision());
        assertNull(tube.expectedEvidenceDigest());
    }

    @Test
    public void rejectedTubeExposesOnlyItsRecordedEvidenceAndAuthorizedReasonCatalog() throws Exception {
        found(new Candidate("301", "SIM.1", "H", "801", "1"));
        var original = snapshot();
        var reason = new SpecimenIntakeDecision.Reason("DICTIONARY:resultRejectionReasons", "41",
                "2026-09-26T01:00:00Z", "容器不合格");
        var reasons = new SpecimenIntakeDecisionReader.Reasons(1, "READY", List.of(reason));
        var decision = new SpecimenIntakeDecisionReader.Tube("801", "RECORDED", "REJECTED",
                "11111111-2222-4333-8444-555555555555", reason, "7", "2026-09-26T02:00:00Z", false,
                "a".repeat(64));
        var rejected = new EntryCurrentStateReader.SpecimenView("801", "701", "1", "31", 1.0, null,
                "12", false, true, "2026-09-26T01:00:00Z", "2026-09-26T02:00:00Z", "collector", null,
                original.physicalSpecimens().get(0).analyses());
        var current = new EntryCurrentStateReader.Snapshot(1, true, "301", "SIM.1", "clinical", "11", null,
                original.patient(), original.requestedSpecimens(), List.of(rejected), null, null,
                List.of(decision), reasons);
        when(currentStates.readCurrentClinical("301", "7")).thenReturn(current);

        var result = service.lookup("SIM.1.1", request).current();
        assertEquals(reasons, result.intakeReasons());
        assertEquals(reason, result.physicalSpecimens().get(0).recordedReason());
        assertEquals("a".repeat(64), result.physicalSpecimens().get(0).recordedEvidenceDigest());
        assertNull(result.physicalSpecimens().get(0).expectedEvidenceDigest());

        scope = scope(true);
        when(access.bind(request)).thenReturn(scope);
        var masked = service.lookup("SIM.1.1", request).current();
        assertNull(masked.intakeReasons());
        assertNull(masked.physicalSpecimens().get(0).recordedReason());
        assertNull(masked.physicalSpecimens().get(0).recordedEvidenceDigest());
        assertFalse(masked.toString().contains("容器不合格"));
        assertFalse(masked.toString().contains("a".repeat(64)));
    }

    @Test
    public void orderAndTubeCodeCollisionIsAmbiguousBeforePatientRead() {
        found(new Candidate("301", "SIM.1", "H", null, null),
                new Candidate("302", "SIM", "H", "802", "1"));
        var failure = assertThrows(SpecimenLookupService.Failure.class, () -> service.lookup("SIM.1", request));
        assertEquals("SPECIMEN_LOOKUP_AMBIGUOUS", failure.code());
        verifyZeroInteractions(currentStates);
    }

    @Test
    public void incompleteWholeOrderGrantReturnsNoPatientOrTubeDetails() {
        found(new Candidate("301", "SIM.1", "H", null, null));
        when(dashboard.findIntakeFacts(eq("301"), any())).thenReturn(Optional.empty());
        assertThrows(AccessDeniedException.class, () -> service.lookup("SIM.1", request));
        verifyZeroInteractions(currentStates);
    }

    @Test
    public void privacyMaskRemovesPatientIdentityFromPublicProjection() throws Exception {
        scope = scope(true);
        when(access.bind(request)).thenReturn(scope);
        found(new Candidate("301", "SIM.1", "H", null, null));
        var result = service.lookup("SIM.1", request);
        assertTrue(result.current().patientMasked());
        assertNull(result.current().patient());
        assertFalse(result.toString().contains("小明"));
        when(currentStates.readCurrentClinical("301", "7")).thenReturn(
                decisionSnapshot("2026-09-26T02:00:00Z", "NOT_RECORDED", null, "2026-09-26T01:01:00Z"));
        assertNull(service.lookup("SIM.1", request).current().physicalSpecimens().get(0).expectedEvidenceDigest());
    }

    @Test
    public void invalidCodeAndNoMatchRemainDistinctAndDoNotReadPatient() {
        var invalid = assertThrows(SpecimenLookupService.Failure.class, () -> service.lookup("SIM/1", request));
        assertEquals(400, invalid.status());
        verifyZeroInteractions(access, candidates, currentStates);
        when(candidates.exactMatches("UNKNOWN"))
                .thenReturn(new SpecimenLookupCandidateDAO.Candidates(List.of(), false));
        var missing = assertThrows(SpecimenLookupService.Failure.class, () -> service.lookup("UNKNOWN", request));
        assertEquals(404, missing.status());
        verifyZeroInteractions(currentStates);
    }

    @Test
    public void staleTubeIdentityFailsInsteadOfSelectingAnUnrelatedTube() {
        found(new Candidate("301", "SIM.1", "H", "999", "1"));
        var failure = assertThrows(SpecimenLookupService.Failure.class, () -> service.lookup("SIM.1.1", request));
        assertEquals("SPECIMEN_LOOKUP_STATE_CONFLICT", failure.code());
    }
}
