package org.openelisglobal.sampletyperequest.controller;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.util.Map;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampletyperequest.controller.rest.SampleTypeRequestRestController;
import org.openelisglobal.sampletyperequest.dto.SampleTypeRequestDTO;
import org.openelisglobal.sampletyperequest.service.SampleTypeRequestService;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

/** In-memory SIM service boundary only; does not prove a database commit. */
public class SampleTypeRequestCreationReceiptTest {
    private SampleTypeRequestRestController controller;
    private SampleTypeRequestService requests;
    private HttpServletRequest request;

    @Before
    public void setUp() {
        controller = new SampleTypeRequestRestController();
        requests = mock(SampleTypeRequestService.class);
        SampleService samples = mock(SampleService.class);
        TypeOfSampleService types = mock(TypeOfSampleService.class);
        ReflectionTestUtils.setField(controller, "sampleTypeRequestService", requests);
        ReflectionTestUtils.setField(controller, "sampleService", samples);
        ReflectionTestUtils.setField(controller, "typeOfSampleService", types);
        Sample sample = new Sample();
        sample.setId("701");
        sample.setAccessionNumber("SIM-RECEIPT-001");
        TypeOfSample type = new TypeOfSample();
        type.setId("2");
        when(samples.get("701")).thenReturn(sample);
        when(types.get("2")).thenReturn(type);
        request = mock(HttpServletRequest.class);
        HttpSession session = mock(HttpSession.class);
        UserSessionData user = new UserSessionData();
        user.setSytemUserId(91);
        when(request.getSession()).thenReturn(session);
        when(session.getAttribute(IActionConstants.USER_SESSION_DATA)).thenReturn(user);
    }

    private SampleTypeRequestDTO input() {
        SampleTypeRequestDTO dto = new SampleTypeRequestDTO();
        dto.setSampleId("701");
        dto.setTypeOfSampleId("2");
        return dto;
    }

    private void assertUnconfirmed(Integer id) {
        when(requests.insert(any(SampleTypeRequest.class))).thenReturn(id);
        ResponseEntity<?> response = controller.createRequest(input(), request);
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
        assertTrue(response.getBody() instanceof Map);
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertEquals(false, body.get("success"));
        assertEquals("WRITE_READBACK_UNCONFIRMED", body.get("code"));
        assertEquals("order.save.readbackUnconfirmed", body.get("errorKey"));
    }

    @Test
    public void testCreateRequest_NullInsertedId_ReturnsUnconfirmed() {
        assertUnconfirmed(null);
    }

    @Test
    public void testCreateRequest_ZeroInsertedId_ReturnsUnconfirmed() {
        assertUnconfirmed(0);
    }

    @Test
    public void testCreateRequest_NegativeInsertedId_ReturnsUnconfirmed() {
        assertUnconfirmed(-1);
    }

    @Test
    public void testCreateRequest_ValidInsertedId_PreservesReceiptContract() {
        when(requests.insert(any(SampleTypeRequest.class))).thenReturn(901);
        ResponseEntity<?> response = controller.createRequest(input(), request);
        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        SampleTypeRequestDTO body = (SampleTypeRequestDTO) response.getBody();
        assertEquals("901", body.getId());
        assertEquals("701", body.getSampleId());
        assertEquals("2", body.getTypeOfSampleId());
        assertEquals(Integer.valueOf(0), body.getSortOrder());
        assertEquals(Double.valueOf(1), body.getRequestedQuantity());
        assertEquals("REQUESTED", body.getStatus());
    }
}
