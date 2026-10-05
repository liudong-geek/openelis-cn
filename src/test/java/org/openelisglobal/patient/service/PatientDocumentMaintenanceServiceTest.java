package org.openelisglobal.patient.service;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.sql.Timestamp;
import java.util.Optional;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.patient.action.bean.PatientIdDocumentInfo;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.patient.valueholder.PatientIdDocument;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.server.ResponseStatusException;

public class PatientDocumentMaintenanceServiceTest {
    private PatientIdDocumentService documents;
    private PatientService patients;
    private PatientManagementAuthorizationService authorization;
    private PatientDocumentMaintenanceService service;
    private MockHttpServletRequest request;
    private PatientIdDocument doc;
    private Patient parent;
    private static final String VERSION = "2026-10-05 10:20:30.123456";

    @Before
    public void setup() {
        documents = mock(PatientIdDocumentService.class);
        patients = mock(PatientService.class);
        authorization = mock(PatientManagementAuthorizationService.class);
        service = new PatientDocumentMaintenanceService(documents, patients, authorization);
        request = new MockHttpServletRequest();
        doc = new PatientIdDocument();
        doc.setId(9);
        doc.setPatientId("42");
        doc.setLastupdated(Timestamp.valueOf(VERSION));
        parent = new Patient();
        parent.setId("42");
        when(documents.getMatch("id", 9)).thenReturn(Optional.of(doc));
        when(patients.get("42")).thenReturn(parent);
        when(documents.updateDocument(eq(9), any(), any(), any(), eq("7"))).thenReturn(doc);
    }

    @Test
    public void deniedImmediateActionsNeverReadOrMutateDocuments() {
        doThrow(new AccessDeniedException("revoked")).when(authorization).requireEdit(request, "7");
        assertThrows(AccessDeniedException.class,
                () -> service.update(request, "7", 9, "42", VERSION, new PatientIdDocumentInfo()));
        assertThrows(AccessDeniedException.class, () -> service.delete(request, "7", 9, "42", VERSION));
        verifyZeroInteractions(documents, patients);
    }

    @Test
    public void validUpdateAndDeletePreserveIndependentExistingDocumentCalls() {
        var info = new PatientIdDocumentInfo();
        info.setId(9);
        info.setCategory("OTHER");
        info.setDescription("updated");
        service.update(request, "7", 9, "42", VERSION, info);
        verify(documents).updateDocument(9, null, "OTHER", "updated", "7");
        service.delete(request, "7", 9, "42", VERSION);
        verify(documents).softDeleteDocument(9, "7");
        verify(authorization, times(4)).requireEdit(request, "7");
    }

    @Test
    public void mismatchingPatientOrDocumentIdentityIsRejectedBeforeMutation() {
        assertThrows(PatientMaintenanceConflictException.class, () -> service.delete(request, "7", 9, "43", VERSION));
        var info = new PatientIdDocumentInfo();
        info.setId(10);
        assertThrows(PatientMaintenanceConflictException.class,
                () -> service.update(request, "7", 9, "42", VERSION, info));
        verify(documents, never()).softDeleteDocument(any(), any());
        verify(documents, never()).updateDocument(any(), any(), any(), any(), any());
    }

    @Test
    public void expectedPatientRequiresExactFullPrecisionDocumentVersion() {
        for (String version : new String[] { null, "", "bad", "2026-10-05 10:20:30.123",
                "2026-10-04 10:20:30.123456" }) {
            assertThrows(PatientMaintenanceConflictException.class,
                    () -> service.delete(request, "7", 9, "42", version));
        }
        verify(documents, never()).softDeleteDocument(any(), any());
    }

    @Test public void missingDeletedOrMergedRecordsDoNotReturnFalseSuccess() {
        when(documents.getMatch("id",9)).thenReturn(Optional.empty());
        assertThrows(ResponseStatusException.class,()->service.delete(request,"7",9,"42",VERSION));
        when(documents.getMatch("id",9)).thenReturn(Optional.of(doc)); doc.setDeleted(true);
        assertThrows(PatientMaintenanceConflictException.class,()->service.delete(request,"7",9,"42",VERSION));
        doc.setDeleted(false); parent.setIsMerged(true);
        assertThrows(PatientMaintenanceConflictException.class,()->service.delete(request,"7",9,"42",VERSION));
        verify(documents,never()).softDeleteDocument(any(),any());
    }

    @Test
    public void legacyNoContextActionsStillRequireCurrentPermissionAndActualParent() {
        service.delete(request, "7", 9, null, null);
        verify(documents).softDeleteDocument(9, "7");
        verify(authorization, times(2)).requireEdit(request, "7");
    }

    @Test
    public void latePermissionChangeThrowsForCallerTransactionRollback() {
        doNothing().doThrow(new AccessDeniedException("changed")).when(authorization).requireEdit(request, "7");
        assertThrows(AccessDeniedException.class, () -> service.delete(request, "7", 9, "42", VERSION));
        verify(documents).softDeleteDocument(9, "7");
    }

    @Test
    public void malformedDocumentAndPatientIdsAreRejectedBeforeMutation() {
        assertThrows(IllegalArgumentException.class, () -> service.delete(request, "7", 0, "42", VERSION));
        assertThrows(IllegalArgumentException.class, () -> service.delete(request, "7", 9, "bad", VERSION));
        verify(documents, never()).softDeleteDocument(any(), any());
    }
}
