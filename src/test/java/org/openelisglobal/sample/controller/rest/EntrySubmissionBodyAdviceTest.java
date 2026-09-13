package org.openelisglobal.sample.controller.rest;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.sample.exception.EntrySubmissionException;
import org.openelisglobal.sample.form.SamplePatientEntryForm;
import org.openelisglobal.sample.service.EntrySubmissionCommand;
import org.openelisglobal.sample.service.EntrySubmissionService;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.mock.http.MockHttpInputMessage;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.Errors;
import org.springframework.validation.Validator;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** Real MVC binding/advice dispatch, with SIM service and no authentication filter or DB. */
public class EntrySubmissionBodyAdviceTest {
    private static final String KEY = "a9e817f3-3356-4518-9b85-81b0a143a531";
    private EntrySubmissionBodyAdvice advice;
    private MockHttpServletRequest request;
    private EntrySubmissionService service;
    private MockMvc mvc;

    @Before public void before() throws Exception {
        advice = new EntrySubmissionBodyAdvice(); request = new MockHttpServletRequest();
        request.addHeader(EntrySubmissionCommand.HEADER, KEY);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        var controller = new SamplePatientEntryRestController(); service = mock(EntrySubmissionService.class);
        ReflectionTestUtils.setField(controller, "entrySubmissions", service);
        when(service.submit(any(), any(), any(), any())).thenAnswer(call -> {
            var command = (EntrySubmissionCommand) call.getArgument(0);
            assertSame(call.getArgument(1), command.form());
            return new EntrySubmissionService.Result(true, true, new ObjectMapper().createObjectNode().put("submissionId", command.key()));
        });
        var module = new com.fasterxml.jackson.databind.module.SimpleModule();
        module.addDeserializer(org.hl7.fhir.r4.model.QuestionnaireResponse.class,
                new org.openelisglobal.fhir.springserialization.QuestionnaireResponseDeserializer());
        module.addDeserializer(org.hl7.fhir.r4.model.Questionnaire.class,
                new org.openelisglobal.fhir.springserialization.QuestionnaireDeserializer());
        var converter = new MappingJackson2HttpMessageConverter(new ObjectMapper().registerModule(module));
        mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(advice).setMessageConverters(converter)
                .setValidator(new Validator() {
                    @Override public boolean supports(Class<?> type) { return true; }
                    @Override public void validate(Object target, Errors errors) { errors.rejectValue("currentDate", "SIM-old-date"); }
                }).build();
    }
    @After public void after() { RequestContextHolder.resetRequestAttributes(); }
    private MockHttpInputMessage input(byte[] bytes) {
        var input = new MockHttpInputMessage(bytes); input.getHeaders().setContentType(MediaType.APPLICATION_JSON); return input;
    }
    private void capture(byte[] bytes) throws Exception {
        advice.beforeBodyRead(input(bytes), null, SamplePatientEntryForm.class, MappingJackson2HttpMessageConverter.class);
    }
    @Test public void realMvcCapturesEntireWireBodyIncludingIgnoredFieldsAndWhitespace() throws Exception {
        String body = "{\"orderEntryOnly\":true,\"SIM-unknown-tail\":\"完整原始报文\"}  \n";
        mvc.perform(post("/rest/SamplePatientEntry").header(EntrySubmissionCommand.HEADER, KEY)
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        var command = org.mockito.ArgumentCaptor.forClass(EntrySubmissionCommand.class);
        verify(service).submit(command.capture(), any(), any(), any());
        assertEquals(EntrySubmissionCommand.fingerprint(body.getBytes(StandardCharsets.UTF_8)), command.getValue().fingerprint());
    }
    @Test public void realMvcRejectsDuplicateHeaderWithoutInvokingService() throws Exception {
        mvc.perform(post("/rest/SamplePatientEntry").header(EntrySubmissionCommand.HEADER, KEY, KEY)
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
        verifyZeroInteractions(service);
    }
    @Test public void realMvcRejectsEmptyAndMalformedJsonWithoutSaving() throws Exception {
        for (String body : new String[]{"", " ", "{", "{} {}", "{\"x\":1,\"x\":2}"}) {
            mvc.perform(post("/rest/SamplePatientEntry").header(EntrySubmissionCommand.HEADER, KEY)
                    .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        }
        verifyZeroInteractions(service);
    }
    @Test public void actualReadLimitRejectsUnknownLengthOversize() {
        byte[] bytes = new byte[EntrySubmissionCommand.MAX_BYTES + 1];
        var error = assertThrows(EntrySubmissionException.class, () -> capture(bytes));
        assertEquals(413, error.getStatus()); assertNull(request.getAttribute(EntrySubmissionCommand.ATTRIBUTE));
    }
    @Test public void formReferenceCannotBeSwappedAfterCapture() throws Exception {
        capture("{}".getBytes(StandardCharsets.UTF_8));
        var form = new SamplePatientEntryForm();
        advice.afterBodyRead(form, input(new byte[0]), null, SamplePatientEntryForm.class, MappingJackson2HttpMessageConverter.class);
        assertSame(form, EntrySubmissionCommand.fromRequest(request, form).form());
        assertThrows(EntrySubmissionException.class, () -> EntrySubmissionCommand.fromRequest(request, new SamplePatientEntryForm()));
    }

    @Test public void recoveryUsesOriginalKeyAndDisablesCaching() throws Exception {
        when(service.recover(eq(KEY), any())).thenReturn(new EntrySubmissionService.Result(true, true,
                new ObjectMapper().createObjectNode().put("submissionId", KEY)));
        var response = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .get("/rest/SamplePatientEntry/submissions/" + KEY)).andExpect(status().isOk()).andReturn().getResponse();
        assertEquals("no-store", response.getHeader("Cache-Control"));
        assertTrue(response.getContentAsString().contains(KEY)); verify(service).recover(eq(KEY), any());
        verify(service, never()).submit(any(), any(), any(), any());
    }

    @Test public void unknownSaveFailureDoesNotExposeDetailsOrClaimRollback() throws Exception {
        doThrow(new IllegalStateException("SIM-private-persistence-detail")).when(service).submit(any(), any(), any(), any());
        var response = mvc.perform(post("/rest/SamplePatientEntry").header(EntrySubmissionCommand.HEADER, KEY)
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isServiceUnavailable())
                .andReturn().getResponse();
        assertEquals("no-store", response.getHeader("Cache-Control"));
        assertTrue(response.getContentAsString().contains("ENTRY_SAVE_UNKNOWN"));
        assertFalse(response.getContentAsString().contains("SIM-private-persistence-detail"));
    }
    @Test public void keyIsStrictUuidAndBodyIsBoundIncludingProgramAndDocumentChanges() {
        for (String key : new String[]{"", "123", KEY.toUpperCase(), " " + KEY}) {
            assertThrows(EntrySubmissionException.class, () -> EntrySubmissionCommand.validateKey(key));
        }
        String original = "{\"program\":{\"id\":1},\"document\":\"SIM-A\"}";
        assertNotEquals(EntrySubmissionCommand.fingerprint(original.getBytes(StandardCharsets.UTF_8)),
                EntrySubmissionCommand.fingerprint(original.replace("SIM-A", "SIM-B").getBytes(StandardCharsets.UTF_8)));
        assertNotEquals(EntrySubmissionCommand.fingerprint(original.getBytes(StandardCharsets.UTF_8)),
                EntrySubmissionCommand.fingerprint((original + " ").getBytes(StandardCharsets.UTF_8)));
    }
    @Test public void adviceOnlyTargetsTheFirstEntryFormMethod() throws Exception {
        var method = java.util.Arrays.stream(SamplePatientEntryRestController.class.getMethods())
                .filter(item -> item.getName().equals("samplePatientEntrySave")).findFirst().orElseThrow();
        assertTrue(advice.supports(new MethodParameter(method, 1), SamplePatientEntryForm.class, MappingJackson2HttpMessageConverter.class));
        assertFalse(advice.supports(new MethodParameter(method, 1), String.class, MappingJackson2HttpMessageConverter.class));
    }
}
