package org.openelisglobal.fhir.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import ca.uhn.fhir.context.FhirContext;
import ca.uhn.fhir.rest.server.exceptions.ForbiddenOperationException;
import ca.uhn.fhir.rest.server.exceptions.ResourceVersionConflictException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;
import org.hl7.fhir.r4.model.ServiceRequest;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.fhir.dao.FhirIntakeReceiptDAO;
import org.openelisglobal.fhir.dao.FhirWriteLockDAO;
import org.openelisglobal.fhir.valueholder.FhirIntakeReceipt;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.sample.service.PatientManagementUpdate;
import org.openelisglobal.sample.service.SamplePatientEntryService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampletyperequest.service.SampleTypeRequestService;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockHttpServletRequest;

@RunWith(MockitoJUnitRunner.class)
public class FhirOrderIntakeServiceTest {
    @Mock
    private FhirOrderIntakeValidator validator;
    @Mock
    private FhirWriteLockDAO locks;
    @Mock
    private FhirIntakeReceiptDAO receipts;
    @Mock
    private SamplePatientEntryService entries;
    @Mock
    private SampleTypeRequestService requests;
    @Mock
    private ObjectProvider<PatientManagementUpdate> patientUpdates;
    @Mock
    private UserRoleService roles;
    @Mock
    private AnalysisService analyses;
    private final FhirContext context = FhirContext.forR4Cached();
    private final UUID id = UUID.fromString("6769b995-6cbf-4a3c-a115-22e6707b1b81");
    private FhirOrderIntakeService service;
    private MockHttpServletRequest request;

    @Before
    public void setUp() {
        service = new FhirOrderIntakeService(validator, locks, receipts, context, entries, requests, patientUpdates,
                roles, analyses);
        request = new MockHttpServletRequest();
        UserSessionData session = new UserSessionData();
        session.setSytemUserId(1);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, session);
        lenient().when(roles.userInRole("1", Constants.ROLE_GLOBAL_ADMIN)).thenReturn(true);
    }

    @Test
    public void testCreate_Replay_ReturnsOriginalAccessionWithoutWritingAgain() throws Exception {
        ServiceRequest input = new ServiceRequest();
        var receipt = receipt(input);
        when(validator.validate(input))
                .thenReturn(new FhirOrderIntakeValidator.Resolved(id, null, null, null, null, null));
        when(receipts.find(id)).thenReturn(receipt);
        var result = service.create(input, request);
        assertFalse(result.getCreated());
        assertEquals(200, (int) result.getResponseStatusCode());
        var resource = (ServiceRequest) result.getResource();
        assertEquals("TEST-LAB-001", resource.getIdentifierFirstRep().getValue());
        verifyZeroInteractions(entries, requests, patientUpdates);
        verify(receipts, never()).insert(any());
        var ordered = inOrder(locks, receipts);
        ordered.verify(locks).lock("fhir-intake-" + id);
        ordered.verify(receipts).find(id);
    }

    @Test
    public void testCreate_ReplayWithChangedPayload_RejectsWithoutWriting() throws Exception {
        ServiceRequest original = new ServiceRequest();
        var receipt = receipt(original);
        ServiceRequest changed = new ServiceRequest().setPriority(ServiceRequest.ServiceRequestPriority.STAT);
        when(validator.validate(changed))
                .thenReturn(new FhirOrderIntakeValidator.Resolved(id, null, null, null, null, null));
        when(receipts.find(id)).thenReturn(receipt);
        assertThrows(ResourceVersionConflictException.class, () -> service.create(changed, request));
        verifyZeroInteractions(entries, requests, patientUpdates);
    }

    @Test
    public void testCreate_NoReceptionPermission_RejectsBeforeResolvingPatient() {
        when(roles.userInRole("1", Constants.ROLE_GLOBAL_ADMIN)).thenReturn(false);
        assertThrows(ForbiddenOperationException.class, () -> service.create(new ServiceRequest(), request));
        verifyZeroInteractions(validator, locks, receipts, entries);
    }

    @Test
    public void testReadPending_ReturnsStoredOrderBeforeSpecimenCollection() throws Exception {
        when(receipts.find(id)).thenReturn(receipt(new ServiceRequest()));
        assertEquals(id.toString(), service.readPending(id).getIdElement().getIdPart());
        verifyZeroInteractions(analyses);
    }

    @Test
    public void collectedReadKeepsSenderIdentityAndUsesRealSpecimen() throws Exception {
        var original = new ServiceRequest().setIntent(ServiceRequest.ServiceRequestIntent.ORDER);
        original.addIdentifier().setSystem("https://example.invalid/orders").setValue("TEST-1");
        original.getCode().addCoding().setSystem("http://openelis-global.org/test-guid").setCode("TEST-GUID");
        original.getRequester().setReference("Organization/TEST-DEPARTMENT");
        original.addSpecimen().setReference("#requested");
        var stored = receipt(original);
        stored.setCreatedAt(java.time.Instant.parse("2026-08-01T00:00:00Z"));
        when(receipts.find(id)).thenReturn(stored);
        var current = new ServiceRequest().setStatus(ServiceRequest.ServiceRequestStatus.COMPLETED);
        current.addSpecimen().setReference("Specimen/REAL-SPECIMEN");
        var read = service.readCollected(id, current);
        assertEquals("TEST-1", read.getIdentifierFirstRep().getValue());
        assertEquals("TEST-GUID", read.getCode().getCodingFirstRep().getCode());
        assertEquals("Organization/TEST-DEPARTMENT", read.getRequester().getReference());
        assertEquals("Specimen/REAL-SPECIMEN", read.getSpecimenFirstRep().getReference());
        assertEquals(ServiceRequest.ServiceRequestStatus.COMPLETED, read.getStatus());
        assertEquals(ServiceRequest.ServiceRequestIntent.ORDER, read.getIntent());
        assertEquals(java.util.Date.from(stored.getCreatedAt()), read.getAuthoredOn());
    }

    @Test
    public void nonExternalOrdersKeepExistingReadContract() {
        var current = new ServiceRequest();
        assertSame(current, service.readCollected(id, current));
    }

    private FhirIntakeReceipt receipt(ServiceRequest input) throws Exception {
        String json = context.newJsonParser().encodeResourceToString(input);
        FhirIntakeReceipt receipt = new FhirIntakeReceipt();
        receipt.setId(id);
        receipt.setPayloadJson(json);
        receipt.setPayloadHash(HexFormat.of()
                .formatHex(MessageDigest.getInstance("SHA-256").digest(json.getBytes(StandardCharsets.UTF_8))));
        Sample sample = new Sample();
        sample.setAccessionNumber("TEST-LAB-001");
        receipt.setSample(sample);
        return receipt;
    }
}
