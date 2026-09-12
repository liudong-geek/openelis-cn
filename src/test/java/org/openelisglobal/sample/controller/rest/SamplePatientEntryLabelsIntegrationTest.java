package org.openelisglobal.sample.controller.rest;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.labelpreset.dto.OrderLabelPersistRequest;
import org.openelisglobal.sample.bean.SampleOrderItem;
import org.openelisglobal.sample.form.SamplePatientEntryForm;
import org.openelisglobal.sample.service.SamplePatientEntryService;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.validator.SamplePatientEntryFormValidator;
import org.openelisglobal.sample.valueholder.OrderPriority;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.BindException;
import org.springframework.validation.BindingResult;
import org.springframework.web.servlet.mvc.support.RedirectAttributesModelMap;

/**
 * Controller delegation only; real transaction behavior has a separate service test.
 */
public class SamplePatientEntryLabelsIntegrationTest {
    private SamplePatientEntryService service;
    private SamplePatientEntryRestController controller;
    private SamplePatientEntryForm form;
    private BindingResult errors;
    private MockHttpServletRequest request;
    private SampleService samples;

    @Before
    public void setUp() {
        controller = new SamplePatientEntryRestController();
        service = mock(SamplePatientEntryService.class);
        samples = mock(SampleService.class);
        ReflectionTestUtils.setField(controller, "samplePatientService", service);
        ReflectionTestUtils.setField(controller, "sampleService", samples);
        ReflectionTestUtils.setField(controller, "formValidator", mock(SamplePatientEntryFormValidator.class));
        form = new SamplePatientEntryForm();
        SampleOrderItem order = new SampleOrderItem();
        order.setLabNo("SIM-ENTRY");
        form.setSampleOrderItems(order);
        errors = new BeanPropertyBindingResult(form, "form");
        request = new MockHttpServletRequest();
        ReflectionTestUtils.setField(controller, "request", request);
        Sample sample = mock(Sample.class);
        when(sample.getId()).thenReturn("701");
        when(samples.getSampleByAccessionNumber("SIM-ENTRY")).thenReturn(sample);
    }

    @Test
    public void testSaveEntry_LabelPayloadUsesSingleServiceCall() throws Exception {
        OrderLabelPersistRequest labels = new OrderLabelPersistRequest();
        form.setLabelPersistRequest(labels);
        assertSame(form, save().getBody());
        assertSame(labels, form.getLabelPersistRequest());
        verify(service).saveEntry(form, request, errors);
        assertNoSplitSave();
    }

    @Test
    public void testSaveEntry_AbsentLabelsRemainAbsent() throws Exception {
        assertNull(form.getLabelPersistRequest());
        assertEquals(200, save().getStatusCode().value());
        verify(service).saveEntry(form, request, errors);
        assertNoSplitSave();
    }

    @Test
    public void testSaveEntry_ValidationFailureMapsTo400WithoutReadback() throws Exception {
        rejectDuringSave("SIM-invalid");
        assertEquals(400, save().getStatusCode().value());
        verify(samples, never()).getSampleByAccessionNumber("SIM-ENTRY");
        assertNoSplitSave();
    }

    @Test
    public void testSaveEntry_DuplicatePatientStillMapsTo409() throws Exception {
        rejectDuringSave("error.duplicate.patient");
        assertEquals(409, save().getStatusCode().value());
        verify(samples, never()).getSampleByAccessionNumber("SIM-ENTRY");
    }

    @Test
    public void testSaveEntry_OptionalNotificationFailureDoesNotUndoSuccess() throws Exception {
        form.getSampleOrderItems().setPriority(OrderPriority.STAT);
        UserRoleService roles = mock(UserRoleService.class);
        ReflectionTestUtils.setField(controller, "userRoleService", roles);
        when(roles.getUserIdsForRole(org.openelisglobal.common.constants.Constants.ROLE_RESULTS))
                .thenThrow(new IllegalStateException("SIM notification unavailable"));
        assertEquals(200, save().getStatusCode().value());
        verify(service).saveEntry(form, request, errors);
        assertFalse(errors.hasErrors());
    }

    private void rejectDuringSave(String code) throws Exception {
        doAnswer(call -> {
            errors.reject(code);
            throw new BindException(errors);
        }).when(service).saveEntry(form, request, errors);
    }

    private ResponseEntity<?> save() throws Exception {
        return controller.samplePatientEntrySave(request, form, errors, new RedirectAttributesModelMap());
    }

    private void assertNoSplitSave() {
        // Broad matchers intentionally prohibit every former split-write argument combination.
        verify(service, never()).persistData(any(), any(), any(), any(), any());
        verify(service, never()).persistLabelRequests(any(), any(), any());
    }
}
