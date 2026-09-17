package org.openelisglobal.result.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.sql.Connection;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.*;
import org.openelisglobal.result.form.SpecimenResultAdmission;
import org.openelisglobal.sample.service.EntryCurrentStateReader.AnalysisView;
import org.openelisglobal.sample.service.EntryCurrentStateReader.SpecimenView;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.test.valueholder.TestSection;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * SIM: real current admission/review policy; scalar repositories are explicit
 * memory fixtures.
 */
public class SpecimenResultAdmissionReaderTest {
    private static final String TIME = "2026-09-01T01:02:03.123456Z";
    private final OrdinaryResultSaveStateDAO states = mock(OrdinaryResultSaveStateDAO.class);
    private final IStatusService statuses = mock(IStatusService.class);
    private final UserService users = mock(UserService.class);
    private final List<Analysis> actual = new ArrayList<>();
    private final List<SpecimenView> physical = new ArrayList<>();
    private SpecimenResultAdmissionReader reader;

    @Before
    public void setup() {
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.setCurrentTransactionReadOnly(true);
        TransactionSynchronizationManager.setCurrentTransactionIsolationLevel(Connection.TRANSACTION_REPEATABLE_READ);
        for (AnalysisStatus status : AnalysisStatus.values()) {
            when(statuses.getStatusID(status)).thenReturn(Integer.toString(100 + status.ordinal()));
        }
        when(statuses.getStatusID(SampleStatus.Entered)).thenReturn("2");
        when(statuses.getStatusID(SampleStatus.SampleRejected)).thenReturn("4");
        when(statuses.getStatusID(SampleStatus.Canceled)).thenReturn("6");
        when(statuses.getStatusID(SampleStatus.Disposed)).thenReturn("8");
        var sample = new Sample();
        sample.setId("301");
        var tube = new SampleItem();
        tube.setId("201");
        tube.setSample(sample);
        tube.setStatusId("2");
        tube.setLastupdated(Timestamp.from(Instant.parse(TIME)));
        var section = new TestSection();
        section.setId("601");
        var test = new org.openelisglobal.test.valueholder.Test();
        test.setId("401");
        test.setIsActive("Y");
        var analysis = new Analysis();
        analysis.setId("101");
        analysis.setTest(test);
        analysis.setTestSection(section);
        analysis.setSampleItem(tube);
        analysis.setStatusId(statuses.getStatusID(AnalysisStatus.NotStarted));
        analysis.setLastupdated(Timestamp.from(Instant.parse(TIME)));
        actual.add(analysis);
        refreshView();
        when(users.filterAnalysesByLabUnitRoles("801", actual, Constants.ROLE_RESULTS)).thenReturn(actual);
        when(users.getAllDisplayUserTestsByLabUnit("801", Constants.ROLE_RESULTS))
                .thenReturn(List.of(new IdValuePair("401", "SIM test")));
        when(states.findSpecimenState("101")).thenAnswer(c -> new SpecimenState("101", "401", "201", "301",
                tube.getStatusId(), tube.isRejected(), tube.isVoided()));
        when(states.findState("101")).thenAnswer(
                c -> new State("101", analysis.getStatusId(), analysis.getReleasedDate(), analysis.getPrintedDate()));
        ResultIntakeAdmissionTest.allow(states, "201", "101");
        reader = new SpecimenResultAdmissionReader(new ResultSpecimenAvailabilityService(states, statuses), users);
    }

    @After
    public void cleanup() {
        TransactionSynchronizationManager.clear();
    }

    private void refreshView() {
        var a = actual.get(0);
        var tube = a.getSampleItem();
        physical.clear();
        physical.add(new SpecimenView("201", "501", "1", "601", 1.0, null, tube.getStatusId(), tube.isVoided(),
                tube.isRejected(), TIME, TIME, "SIM", tube.getLastupdated().toInstant().toString(),
                actual.stream().map(v -> new AnalysisView(v.getId(), v.getTest().getId(), v.getStatusId(),
                        v.getLastupdated().toInstant().toString())).toList()));
    }

    private SpecimenResultAdmission read() {
        return reader.read("301", "801", physical, actual).get("201");
    }

    private void blocked(String reason) {
        var result = read();
        assertEquals("BLOCKED", result.state());
        assertFalse(result.analyses().get(0).allowed());
        assertEquals(reason, result.analyses().get(0).blockedReason());
    }

    @Test
    public void currentAcceptedTubeAndActualResultsRoleCanEnter() {
        var result = read();
        assertEquals("READY", result.state());
        assertEquals("301", result.sampleId());
        assertEquals(TIME, result.itemVersion());
        assertTrue(result.analyses().get(0).allowed());
        assertNull(result.analyses().get(0).blockedReason());
        verify(users).filterAnalysesByLabUnitRoles("801", actual, Constants.ROLE_RESULTS);
    }

    @Test
    public void receptionOrCatalogPermissionCannotSubstituteForActualAnalysisSection() {
        when(users.filterAnalysesByLabUnitRoles("801", actual, Constants.ROLE_RESULTS)).thenReturn(List.of());
        blocked(SpecimenResultAdmissionReader.PERMISSION);
        verifyZeroInteractions(states);
    }

    @Test
    public void absentResultsRoleStillReturnsPermissionExplanationInsteadOfFailingOrderRead() {
        when(users.filterAnalysesByLabUnitRoles("801", actual, Constants.ROLE_RESULTS)).thenReturn(List.of());
        when(users.getAllDisplayUserTestsByLabUnit("801", Constants.ROLE_RESULTS))
                .thenThrow(new NullPointerException("SIM missing Results role in legacy catalog"));
        blocked(SpecimenResultAdmissionReader.PERMISSION);
        verify(users, never()).getAllDisplayUserTestsByLabUnit("801", Constants.ROLE_RESULTS);
        verifyZeroInteractions(states);
    }

    @Test
    public void actualSectionPermissionCannotSubstituteForTestScope() {
        when(users.getAllDisplayUserTestsByLabUnit("801", Constants.ROLE_RESULTS)).thenReturn(List.of());
        blocked(SpecimenResultAdmissionReader.PERMISSION);
    }

    @Test
    public void missingSectionFailsClosedEvenIfPermissionAdapterReturnsIt() {
        actual.get(0).setTestSection(null);
        blocked(SpecimenResultAdmissionReader.PERMISSION);
    }

    @Test
    public void unsignedLegacyTubeAndQaAreNotCurrentAcceptance() {
        var s = ResultIntakeAdmissionTest.accepted("201", "101");
        when(states.findIntakeState("201"))
                .thenReturn(new IntakeState(s.tube(), s.patients(), s.requests(), s.tests(), List.of()));
        blocked(ResultIntakeAdmission.MISSING);
    }

    @Test
    public void changedRequestInvalidatesPreviouslyAcceptedTube() {
        var s = ResultIntakeAdmissionTest.accepted("201", "101");
        var r = s.requests().get(0);
        when(states.findIntakeState("201"))
                .thenReturn(
                        new IntakeState(
                                s.tube(), s.patients(), List.of(new IntakeRequest(r.id(), r.sampleId(), r.itemId(),
                                        r.typeId(), r.status(), r.tests(), "2026-09-02T01:00:00Z")),
                                s.tests(), s.decisions()));
        blocked(ResultIntakeAdmission.CHANGED);
    }

    @Test
    public void currentRejectionAndVoidOverrideEarlierAcceptance() {
        var tube = actual.get(0).getSampleItem();
        tube.setRejected(true);
        refreshView();
        blocked("error.results.specimenRejected");
        tube.setVoided(true);
        refreshView();
        blocked("error.results.specimenVoided");
    }

    @Test
    public void reviewedOrReleasedResultIsLockedEvenWithCurrentTubeAcceptance() {
        actual.get(0).setStatusId(statuses.getStatusID(AnalysisStatus.Finalized));
        refreshView();
        blocked(OrdinaryResultReviewPolicy.REVIEWED);
        actual.get(0).setStatusId(statuses.getStatusID(AnalysisStatus.NotStarted));
        // Hydrate the persisted scalar without invoking the legacy display-date
        // formatter.
        org.springframework.test.util.ReflectionTestUtils.setField(actual.get(0), "releasedDate",
                Timestamp.from(Instant.parse(TIME)));
        refreshView();
        blocked(OrdinaryResultReviewPolicy.REVIEWED);
    }

    @Test
    public void invalidStatusConfigurationDoesNotGrantEntry() {
        when(statuses.getStatusID(AnalysisStatus.Finalized)).thenReturn(null);
        blocked(OrdinaryResultReviewPolicy.CONFIGURATION);
    }

    @Test
    public void staleSnapshotVersionOrMovedOwnershipIsUnavailable() {
        actual.get(0).setLastupdated(Timestamp.from(Instant.parse("2026-09-02T01:00:00Z")));
        assertEquals("UNAVAILABLE", read().state());
        refreshView();
        actual.get(0).getSampleItem().getSample().setId("302");
        assertEquals("UNAVAILABLE", read().state());
        verifyZeroInteractions(states);
    }

    @Test
    public void omittedOrDuplicateMembersCannotProducePartialReadyProjection() {
        var original = actual.get(0);
        actual.add(original);
        assertEquals("UNAVAILABLE", read().state());
        actual.clear();
        assertEquals("UNAVAILABLE", read().state());
        verifyZeroInteractions(states);
    }

    @Test
    public void appendedReflexHasItsOwnBlockedReasonWhileOriginalRemainsReady() {
        var a = new Analysis();
        a.setId("102");
        var test = new org.openelisglobal.test.valueholder.Test();
        test.setId("402");
        test.setIsActive("Y");
        a.setTest(test);
        a.setTestSection(actual.get(0).getTestSection());
        a.setSampleItem(actual.get(0).getSampleItem());
        a.setStatusId(actual.get(0).getStatusId());
        a.setLastupdated(Timestamp.from(Instant.parse(TIME)));
        actual.add(a);
        refreshView();
        when(users.getAllDisplayUserTestsByLabUnit("801", Constants.ROLE_RESULTS))
                .thenReturn(List.of(new IdValuePair("401", "SIM original"), new IdValuePair("402", "SIM reflex")));
        var s = ResultIntakeAdmissionTest.accepted("201", "101");
        when(states.findIntakeState("201")).thenReturn(new IntakeState(s.tube(), s.patients(), s.requests(),
                List.of(s.tests().get(0), new IntakeTest("102", "402", "Y")), s.decisions()));
        when(states.findSpecimenState("102"))
                .thenReturn(new SpecimenState("102", "402", "201", "301", "2", false, false));
        var result = read();
        assertEquals("PARTIAL", result.state());
        assertTrue(result.analyses().get(0).allowed());
        assertFalse(result.analyses().get(1).allowed());
        assertEquals(ResultIntakeAdmission.TEST_CHANGED, result.analyses().get(1).blockedReason());
    }

    @Test
    public void requiresAuthorizedRepeatableReadBoundary() {
        TransactionSynchronizationManager.setCurrentTransactionIsolationLevel(Connection.TRANSACTION_READ_COMMITTED);
        try {
            read();
            fail();
        } catch (IllegalStateException expected) {
            verifyZeroInteractions(users, states);
        }
    }
}
