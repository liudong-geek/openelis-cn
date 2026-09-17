package org.openelisglobal.resultvalidation.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.registration.interfaces.IResultUpdate;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformService;
import org.openelisglobal.esig.service.ElectronicSignatureService;
import org.openelisglobal.esig.valueholder.ElectronicSignature;
import org.openelisglobal.esig.valueholder.SignatureMeaning;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.note.service.NoteService;
import org.openelisglobal.note.valueholder.Note;
import org.openelisglobal.notification.service.TestNotificationService;
import org.openelisglobal.qc.service.QCReleaseGateService;
import org.openelisglobal.resultvalidation.form.ResultValidationForm;
import org.openelisglobal.resultvalidation.form.ResultValidationForm.ReviewSignature;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

/**
 * SIM transaction ordering and dispatch boundaries; does not simulate
 * PostgreSQL rollback.
 */
public class ReviewSubmissionServiceTest {
    private ReviewWriteGuardTest fixture;
    private ReviewSubmissionService service;
    private AnalysisService analyses;
    private ElectronicSignatureService signatures;
    private NoteService notes;
    private FhirTransformService fhir;
    private TestNotificationService notifications;
    private MockHttpServletRequest request;
    private ReviewSignature credentials;
    private IResultUpdate updater;
    private QCReleaseGateService qcReleaseGate;

    @Before
    public void setup() {
        fixture = new ReviewWriteGuardTest();
        fixture.setup();
        when(fixture.states.analysis("101"))
                .thenAnswer(call -> new org.openelisglobal.resultvalidation.dao.ReviewSaveStateDAO.AnalysisState("101",
                        "401", "201", "301", "SIM-RESULT-301", "501", fixture.analysis.getStatusId(),
                        String.valueOf(fixture.analysis.getLastupdated().getTime()),
                        fixture.analysis.getReleasedDate() != null, fixture.analysis.getPrintedDate() != null));
        analyses = mock(AnalysisService.class);
        signatures = mock(ElectronicSignatureService.class);
        notes = mock(NoteService.class);
        fhir = mock(FhirTransformService.class);
        notifications = mock(TestNotificationService.class);
        qcReleaseGate = mock(QCReleaseGateService.class);
        var users = mock(SystemUserService.class);
        var user = new SystemUser();
        user.setId("801");
        user.setLoginName("sim-reviewer");
        user.setIsActive("Y");
        when(users.get("801")).thenReturn(user);
        service = spy(
                new ReviewSubmissionService(fixture.guard, analyses, fixture.statuses, notes, mock(SampleService.class),
                        mock(SampleHumanService.class), signatures, users, fixture.specimens, fhir, notifications,
                        qcReleaseGate));
        updater = mock(IResultUpdate.class);
        doReturn(List.of(updater)).when(service).registeredUpdaters();
        request = new MockHttpServletRequest();
        var data = new UserSessionData();
        data.setSytemUserId(801);
        data.setLoginName("sim-reviewer");
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, data);
        credentials = new ReviewSignature();
        credentials.setUsername("sim-reviewer");
        credentials.setPassword("SIM-only-secret");
        when(notes.createSavableNote(any(), any(), anyString(), anyString(), eq("801"))).thenAnswer(call -> {
            Note note = new Note();
            note.setText(call.getArgument(2));
            return note;
        });
        when(fixture.statuses.getStatusID(AnalysisStatus.Canceled)).thenReturn("22");
        when(fixture.statuses.getStatusID(AnalysisStatus.NonConforming_depricated)).thenReturn("23");
        when(signatures.isEsigEnabled()).thenReturn(true);
        var signature = new ElectronicSignature();
        signature.setId(901L);
        when(signatures.executeSignatureForSnapshot(anyString(), anyString(), any(), anyString(), anyLong(), any(),
                any(), any(), anyString())).thenReturn(signature);
    }

    @After
    public void cleanup() {
        fixture.cleanup();
    }

    private void save() {
        service.save(request, "801", List.of(fixture.row), credentials);
    }

    @Test
    public void signatureIsBoundToStoredValueAndVersionBeforeAnalysisMutation() {
        save();
        var order = inOrder(signatures, analyses, notes);
        var content = ArgumentCaptor.forClass(String.class);
        order.verify(signatures).executeSignatureForSnapshot(eq("sim-reviewer"), eq("SIM-only-secret"),
                eq(SignatureMeaning.VALIDATED_AND_RELEASED), eq("ANALYSIS"), eq(101L), isNull(), any(), any(),
                content.capture());
        order.verify(analyses).update(fixture.analysis);
        assertTrue(content.getValue().contains("5.2000"));
        assertTrue(content.getValue().contains("\"analysisVersion\":\"" + ReviewWriteGuardTest.TIME.getTime() + "\""));
        assertFalse(content.getValue().contains("SIM-only-secret"));
        assertNull(credentials.getPassword());
        assertEquals("20", fixture.analysis.getStatusId());
        assertEquals("5.2000", fixture.result.getValue());
        verify(qcReleaseGate, atLeast(2)).requireReleasable(anyMap(), anyMap());
    }

    @Test public void qcReleaseBlockerStopsAcceptanceBeforeSignatureOrMutation() {
        doThrow(QCReleaseGateService.blocked()).when(qcReleaseGate).requireReleasable(anyMap(), anyMap());
        assertEquals(422, assertThrows(ResponseStatusException.class, this::save).getStatusCode().value());
        verify(signatures, never()).executeSignatureForSnapshot(anyString(), anyString(), any(), anyString(), anyLong(),
                any(), any(), any(), anyString());
        verify(analyses, never()).update(any());
    }

    @Test public void invalidCredentialsNeverChangeAnalysisOrCreateNotes() {
        when(signatures.executeSignatureForSnapshot(anyString(), anyString(), any(), anyString(), anyLong(), any(), any(), any(), anyString()))
                .thenThrow(new IllegalArgumentException("SIM invalid"));
        assertEquals(400, assertThrows(ResponseStatusException.class, this::save).getStatusCode().value());
        assertEquals("15", fixture.analysis.getStatusId());
        verify(analyses, never()).update(any()); verify(notes, never()).insert(any());
        assertNull(credentials.getPassword());
    }

    @Test
    public void staleEvidenceFailsBeforeSignatureCreation() {
        fixture.result.setValue("stale");
        assertEquals(409, assertThrows(ResponseStatusException.class, this::save).getStatusCode().value());
        verify(signatures, never()).executeSignatureForSnapshot(anyString(), anyString(), any(), anyString(), anyLong(),
                any(), any(), any(), anyString());
        assertEquals("15", fixture.analysis.getStatusId());
        assertNull(credentials.getPassword());
    }

    @Test
    public void returnHasReasonInSignatureAndInternalAuditAndNoReleasedDate() {
        fixture.row.setIsAccepted(false);
        fixture.row.setIsRejected(true);
        fixture.row.setNote("模拟退回复检");
        save();
        verify(signatures).executeSignatureForSnapshot(eq("sim-reviewer"), anyString(), eq(SignatureMeaning.REJECTED),
                eq("ANALYSIS"), eq(101L), eq("模拟退回复检"), any(), any(), contains("模拟退回复检"));
        assertEquals("21", fixture.analysis.getStatusId());
        assertNull(fixture.analysis.getReleasedDate());
        verify(notes).createSavableNote(eq(fixture.analysis),
                eq(org.openelisglobal.note.service.NoteServiceImpl.NoteType.INTERNAL), contains("signatureId=901"),
                eq("Review Decision"), eq("801"));
    }

    @Test public void disabledEsigUsesSameReviewGuardAndAuditWithoutCredentialExecution() {
        when(signatures.isEsigEnabled()).thenReturn(false);
        service.save(request, "801", List.of(fixture.row), null);
        assertEquals("20", fixture.analysis.getStatusId());
        verify(signatures, never()).executeSignatureForSnapshot(anyString(), anyString(), any(), anyString(), anyLong(), any(), any(), any(), anyString());
        verify(notes).createSavableNote(eq(fixture.analysis), any(), contains("sha256="), eq("Review Decision"), eq("801"));
    }

    @Test
    public void notificationsAndExternalUpdatesOnlyRunAfterSuccessfulCommit() throws Exception {
        save();
        verifyZeroInteractions(fhir, notifications);
        verify(updater).transactionalUpdate(any());
        verify(updater, never()).postTransactionalCommitUpdate(any());
        for (var synchronization : TransactionSynchronizationManager.getSynchronizations())
            synchronization.afterCommit();
        verify(fhir).transformPersistResultValidationFhirObjects(anyList(), anyList(), any(), anyList(), any(), any());
        verify(notifications).createAndSendNotificationsToConfiguredSources(any(), eq(fixture.result));
        verify(updater).postTransactionalCommitUpdate(any());
    }

    @Test
    public void updaterFailureIsPropagatedWithoutSchedulingExternalEffects() {
        doThrow(new IllegalStateException("SIM updater failed")).when(updater).transactionalUpdate(any());
        assertThrows(IllegalStateException.class, this::save);
        assertTrue(TransactionSynchronizationManager.getSynchronizations().isEmpty());
        verifyZeroInteractions(fhir, notifications);
        assertNull(credentials.getPassword());
    }

    @Test
    public void callbackCannotChangeReviewedResultValueOrRevokeAccess() {
        doAnswer(call -> {
            fixture.result.setValue("unexpected");
            return null;
        }).when(updater).transactionalUpdate(any());
        assertEquals(409, assertThrows(ResponseStatusException.class, this::save).getStatusCode().value());
        verifyZeroInteractions(fhir, notifications);
    }

    @Test public void sessionChangeDuringSigningIsRejectedBeforeAnalysisUpdate() {
        when(signatures.executeSignatureForSnapshot(anyString(), anyString(), any(), anyString(), anyLong(), any(), any(), any(), anyString()))
                .thenAnswer(call -> { var data = new UserSessionData(); data.setSytemUserId(802);
                    request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, data);
                    var signature = new ElectronicSignature(); signature.setId(901L); return signature; });
        assertEquals(403, assertThrows(ResponseStatusException.class, this::save).getStatusCode().value());
        assertEquals("15", fixture.analysis.getStatusId()); verify(analyses, never()).update(any());
    }

    @Test
    public void passwordAndSignatureRequestAreNeverSerializedBack() throws Exception {
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        var form = new ResultValidationForm();
        form.setReviewSignature(credentials);
        assertFalse(mapper.writeValueAsString(form).contains("SIM-only-secret"));
        assertFalse(mapper.writeValueAsString(form).contains("reviewSignature"));
        var parsed = mapper.readValue("{\"reviewSignature\":{\"username\":\"sim-reviewer\",\"password\":\"SIM-only\"}}",
                ResultValidationForm.class);
        assertEquals("SIM-only", parsed.getReviewSignature().getPassword());
    }
}
