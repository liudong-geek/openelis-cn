package org.openelisglobal.sample.controller.rest;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.hibernate.validator.messageinterpolation.ParameterMessageInterpolator;
import org.junit.AfterClass;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.provider.validation.AccessionNumberValidatorFactory;
import org.openelisglobal.common.provider.validation.IAccessionNumberGenerator;
import org.openelisglobal.common.provider.validation.IAccessionNumberValidator.ValidationResults;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.config.AppConfig;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformService;
import org.openelisglobal.internationalization.MessageUtil;
import org.openelisglobal.login.dao.UserModuleService;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.patient.form.PatientEntryByProjectForm;
import org.openelisglobal.sample.action.util.SampleUtil;
import org.openelisglobal.sample.bean.SampleOrderItem;
import org.openelisglobal.sample.form.SampleEditForm;
import org.openelisglobal.sample.service.SampleEditAuthorizationService;
import org.openelisglobal.sample.service.SampleEditService;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.util.AccessionNumberUtil;
import org.openelisglobal.sample.validator.SampleEditFormValidator;
import org.openelisglobal.sample.valueholder.OrderPriority;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.service.SampleItemService;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.siteinformation.service.SiteInformationService;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.openelisglobal.typeofsample.service.TypeOfSampleTestService;
import org.openelisglobal.userrole.service.UserRoleService;
import org.openelisglobal.validation.constraintvalidator.NameValidator;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.context.support.StaticMessageSource;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

/**
 * Exercises actual MVC binding and the legacy validator before any write
 * service runs.
 */
public class SampleEditRestControllerValidationTest {
    private static final String ACCESSION = "24-00001";
    private static GenericApplicationContext context;
    private static Object previousContext;
    private static Object previousFactory;
    private static Object previousAccessionFactory;
    private static Object previousMessages;
    private static Object previousFormFields;
    private static AccessionNumberValidatorFactory accessionFactory;
    private static IAccessionNumberGenerator accessionValidator;
    private static final String[] NAME_REGEX_FIELDS = { "FIRST_NAME_REGEX", "LAST_NAME_REGEX", "FULL_NAME_REGEX",
            "USER_NAME_REGEX" };
    private static final Object[] previousNameRegex = new Object[NAME_REGEX_FIELDS.length];

    private MockMvc mvc;
    private LocalValidatorFactoryBean beanValidator;
    private SampleEditRestController controller;
    private ObjectMapper mapper;
    private SampleEditService edits;
    private SampleEditAuthorizationService authorization;
    private SampleService samples;
    private FhirTransformService fhir;
    private SampleEditFormValidator validator;
    private SampleEditForm form;

    @BeforeClass
    public static void initializeLegacyStatics() throws Exception {
        previousContext = ReflectionTestUtils.getField(SpringContext.class, "context");
        previousFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        previousMessages = ReflectionTestUtils.getField(MessageUtil.class, "instance");
        previousFormFields = ReflectionTestUtils.getField(FormFields.class, "instance");
        context = new GenericApplicationContext();
        DefaultConfigurationProperties properties = mock(DefaultConfigurationProperties.class);
        when(properties.getPropertyValue("default.idSeparator")).thenReturn("-");
        when(properties.getPropertyValue(Property.AccessionFormat)).thenReturn("ALPHANUM");
        when(properties.getPropertyValue(Property.ACCESSION_NUMBER_VALIDATE)).thenReturn("false");
        context.getBeanFactory().registerSingleton("configurationProperties", properties);
        accessionFactory = mock(AccessionNumberValidatorFactory.class);
        accessionValidator = mock(IAccessionNumberGenerator.class);
        when(accessionFactory.getValidator(any())).thenReturn(accessionValidator);
        when(accessionFactory.getGenerator(any())).thenReturn(accessionValidator);
        context.getBeanFactory().registerSingleton("accessionFactory", accessionFactory);
        IStatusService statuses = mock(IStatusService.class);
        when(statuses.getStatusID(AnalysisStatus.Canceled)).thenReturn("canceled");
        when(statuses.getStatusID(SampleStatus.Entered)).thenReturn("entered");
        context.getBeanFactory().registerSingleton("statuses", statuses);
        context.getBeanFactory().registerSingleton("siteInformation", mock(SiteInformationService.class));
        context.refresh();
        new SpringContext().setApplicationContext(context);
        for (int index = 0; index < NAME_REGEX_FIELDS.length; index++) {
            previousNameRegex[index] = ReflectionTestUtils.getField(NameValidator.class, NAME_REGEX_FIELDS[index]);
        }
        new NameValidator().initSpring();
        previousAccessionFactory = ReflectionTestUtils.getField(AccessionNumberUtil.class,
                "accessionNumberValidatorFactory");
        ReflectionTestUtils.setField(AccessionNumberUtil.class, "accessionNumberValidatorFactory", accessionFactory);
        MessageUtil.setMessageSource(new StaticMessageSource());
    }

    @AfterClass
    public static void restoreLegacyStatics() {
        ReflectionTestUtils.setField(AccessionNumberUtil.class, "accessionNumberValidatorFactory",
                previousAccessionFactory);
        ReflectionTestUtils.setField(SpringContext.class, "context", previousContext);
        ReflectionTestUtils.setField(SpringContext.class, "factory", previousFactory);
        ReflectionTestUtils.setField(MessageUtil.class, "instance", previousMessages);
        ReflectionTestUtils.setField(FormFields.class, "instance", previousFormFields);
        for (int index = 0; index < NAME_REGEX_FIELDS.length; index++) {
            ReflectionTestUtils.setField(NameValidator.class, NAME_REGEX_FIELDS[index], previousNameRegex[index]);
        }
        context.close();
    }

    @Before
    public void setUp() throws Exception {
        reset(accessionValidator);
        when(accessionValidator.validFormat(anyString(), anyBoolean())).thenReturn(ValidationResults.SUCCESS);
        when(accessionValidator.getChangeableLength()).thenReturn(8);
        edits = mock(SampleEditService.class);
        samples = mock(SampleService.class);
        fhir = mock(FhirTransformService.class);
        validator = spy(new SampleEditFormValidator());
        SampleUtil util = new SampleUtil();
        ReflectionTestUtils.setField(util, "sampleService", samples);
        controller = new SampleEditRestController();
        ReflectionTestUtils.setField(controller, "formValidator", validator);
        ReflectionTestUtils.setField(controller, "sampleUtil", util);
        ReflectionTestUtils.setField(controller, "sampleService", samples);
        ReflectionTestUtils.setField(controller, "userModuleService", mock(UserModuleService.class));
        ReflectionTestUtils.setField(controller, "userRoleService", mock(UserRoleService.class));
        ReflectionTestUtils.setField(controller, "sampleEditService", edits);
        authorization = mock(SampleEditAuthorizationService.class);
        ReflectionTestUtils.setField(controller, "authorization", authorization);
        ReflectionTestUtils.setField(controller, "fhirTransformService", fhir);
        beanValidator = new LocalValidatorFactoryBean();
        beanValidator.setMessageInterpolator(new ParameterMessageInterpolator());
        beanValidator.afterPropertiesSet();
        MappingJackson2HttpMessageConverter jsonConverter = new AppConfig().jacksonMessageConverter();
        mapper = jsonConverter.getObjectMapper();
        mvc = MockMvcBuilders.standaloneSetup(controller).setValidator(beanValidator)
                .setMessageConverters(jsonConverter).build();
        form = new SampleEditForm();
        form.setAccessionNumber(ACCESSION);
        form.setMaxAccessionNumber(ACCESSION + "-1");
        form.setSampleXML("<samples/>");
        SampleOrderItem order = new SampleOrderItem();
        order.setPriority(OrderPriority.ROUTINE);
        order.setReceivedDateForDisplay("01/01/2024");
        form.setSampleOrderItems(order);
        when(edits.getUpdatedAnalysisList()).thenReturn(List.of());
    }

    private AutoCloseable requestDateFieldSet(String fieldSet) {
        Object previous = ReflectionTestUtils.getField(FormFields.class, "instance");
        DefaultConfigurationProperties properties = context.getBean(DefaultConfigurationProperties.class);
        when(properties.getPropertyValueUpperCase(Property.FormFieldSet)).thenReturn(fieldSet);
        ReflectionTestUtils.setField(FormFields.class, "instance", null);
        return () -> {
            when(properties.getPropertyValueUpperCase(Property.FormFieldSet)).thenReturn(null);
            ReflectionTestUtils.setField(FormFields.class, "instance", previous);
        };
    }

    @Test
    public void serializedEditFormExposesTheExistingRequestDateRequirementWithoutFillingADate() throws Exception {
        try (AutoCloseable ignored = requestDateFieldSet("CI_GENERAL")) {
            assertTrue(mapper.valueToTree(form).path("requestDateRequired").asBoolean());
            assertNull(form.getSampleOrderItems().getRequestDate());
        }
        try (AutoCloseable ignored = requestDateFieldSet(null)) {
            assertFalse(mapper.valueToTree(form).path("requestDateRequired").asBoolean(true));
        }
    }

    @Test
    public void clientCannotDisableRequiredDateAndMissingDateNeverReachesWriteService() throws Exception {
        try (AutoCloseable ignored = requestDateFieldSet("CI_GENERAL")) {
            var body = mapper.valueToTree(form);
            ((com.fasterxml.jackson.databind.node.ObjectNode) body).put("requestDateRequired", false);
            UserSessionData actor = new UserSessionData();
            actor.setSytemUserId(12);
            mvc.perform(post("/rest/SampleEdit").sessionAttr(IActionConstants.USER_SESSION_DATA, actor)
                    .contentType(MediaType.APPLICATION_JSON).content(body.toString()))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errors[0].field").value("sampleOrderItems.requestDate"))
                    .andExpect(jsonPath("$.errors[0].code").value("OptionalNotBlank"));
            assertNoWrites();
        }
    }

    @Test
    public void explicitlyEnteredRequestDateReachesSaveWithoutChangingReceiptDate() throws Exception {
        try (AutoCloseable ignored = requestDateFieldSet("CI_GENERAL")) {
            form.getSampleOrderItems().setRequestDate("01/02/2023");
            perform(200);
            ArgumentCaptor<SampleEditForm> captured = ArgumentCaptor.forClass(SampleEditForm.class);
            verify(edits).editSample(captured.capture(), any(), isNull(), eq(false), eq("12"));
            assertEquals("01/02/2023", captured.getValue().getSampleOrderItems().getRequestDate());
            assertEquals("01/01/2024", captured.getValue().getSampleOrderItems().getReceivedDateForDisplay());
        }
    }

    @Test
    public void serverFormattedWesternDisplayNameCanBeSubmittedUnchanged() throws Exception {
        form.setPatientName("Smith, John");
        perform(200);
        ArgumentCaptor<SampleEditForm> captured = ArgumentCaptor.forClass(SampleEditForm.class);
        verify(edits).editSample(captured.capture(), any(), isNull(), eq(false), eq("12"));
        assertEquals("Smith, John", captured.getValue().getPatientName());
        assertEquals(ACCESSION, captured.getValue().getAccessionNumber());
    }

    @Test
    public void serverFormattedChineseDisplayNameCanBeSubmittedUnchanged() throws Exception {
        form.setPatientName("张, 伟");
        perform(200);
        ArgumentCaptor<SampleEditForm> captured = ArgumentCaptor.forClass(SampleEditForm.class);
        verify(edits).editSample(captured.capture(), any(), isNull(), eq(false), eq("12"));
        assertEquals("张, 伟", captured.getValue().getPatientName());
        assertEquals(ACCESSION, captured.getValue().getAccessionNumber());
    }

    @Test
    public void displayNameMarkupIsRejectedBeforeAnyWrite() throws Exception {
        for (String name : new String[] { "<script>alert(1)</script>", "<b>Smith</b>", "Smith,\n<b>John</b>",
                "张,\r\n<script>alert(1)</script>", "John<", "John>" }) {
            form.setPatientName(name);
            perform(400);
        }
        verify(validator, never()).validate(any(), any());
        assertNoWrites();
    }

    @Test
    public void editablePatientAndRequesterNamesKeepTheirOriginalCharacterRules() {
        for (String field : new String[] { "firstName", "lastName" }) {
            assertTrue(beanValidator.validateValue(PatientEntryByProjectForm.class, field, "张伟").isEmpty());
            assertFalse(beanValidator.validateValue(PatientEntryByProjectForm.class, field, "Smith, John").isEmpty());
            assertFalse(beanValidator.validateValue(PatientEntryByProjectForm.class, field, "<b>John</b>").isEmpty());
        }
        for (String field : new String[] { "providerFirstName", "providerLastName" }) {
            assertTrue(beanValidator.validateValue(SampleOrderItem.class, field, "张伟", SampleEditForm.SampleEdit.class)
                    .isEmpty());
            assertFalse(beanValidator
                    .validateValue(SampleOrderItem.class, field, "Smith, John", SampleEditForm.SampleEdit.class)
                    .isEmpty());
            assertFalse(beanValidator
                    .validateValue(SampleOrderItem.class, field, "<b>John</b>", SampleEditForm.SampleEdit.class)
                    .isEmpty());
        }
    }

    @Test
    public void beanValidationFailureReturns400BeforeCustomValidationAndWrites() throws Exception {
        form.setIsEditable(null);
        perform(400);
        verify(validator, never()).validate(any(), any());
        assertNoWrites();
    }

    @Test
    public void blankXmlForInformationOnlyEditNormalizesAndSavesOnce() throws Exception {
        form.setSampleXML("   ");
        perform(200);
        ArgumentCaptor<SampleEditForm> captured = ArgumentCaptor.forClass(SampleEditForm.class);
        verify(edits).editSample(captured.capture(), any(), isNull(), eq(false), eq("12"));
        assertEquals("<samples/>", captured.getValue().getSampleXML());
        verify(fhir).transformAnalysisByIds(List.of());
    }

    @Test
    public void nullXmlFromLegacyInformationOnlyClientIsCompatible() throws Exception {
        form.setSampleXML(null);
        perform(200);
        verify(edits).editSample(any(), any(), isNull(), eq(false), eq("12"));
    }

    @Test
    public void malformedNonemptyXmlReturns400WithoutWrites() throws Exception {
        form.setSampleXML("<samples>");
        perform(400);
        assertNoWrites();
    }

    @Test
    public void xmlMissingRequiredAttributeReturns400InsteadOfThrowing() throws Exception {
        form.setSampleXML("<samples><sample/></samples>");
        perform(400);
        assertNoWrites();
    }

    @Test
    public void unexpectedXmlRootIsRejectedRatherThanIgnored() throws Exception {
        form.setSampleXML("<unexpected/>");
        perform(400);
        assertNoWrites();
    }

    @Test
    public void malformedMaximumTubeNumberReturns400WithoutWrites() throws Exception {
        for (String value : new String[] { null, "", "withoutSeparator", "24-00001-", "24-00001-invalid" }) {
            form.setMaxAccessionNumber(value);
            perform(400);
        }
        assertNoWrites();
    }

    @Test
    public void accessionWithHyphenIsValidatedAsWholeOriginalNumber() throws Exception {
        perform(200);
        verify(accessionValidator).validFormat(ACCESSION, false);
    }

    @Test
    public void invalidNewAccessionReturns400BeforeLoadingOrMutatingSample() throws Exception {
        form.setNewAccessionNumber("24-00002");
        when(accessionValidator.validFormat("24-00002", false)).thenReturn(ValidationResults.FORMAT_FAIL);
        perform(400);
        assertNoWrites();
        verifyZeroInteractions(samples);
    }

    @Test
    public void usedNewAccessionReturns400BeforeLoadingOrMutatingSample() throws Exception {
        form.setNewAccessionNumber("24-00002");
        when(accessionValidator.accessionNumberIsUsed("24-00002", null)).thenReturn(true);
        perform(400);
        assertNoWrites();
        verifyZeroInteractions(samples);
    }

    @Test
    public void validRenameIsPassedToTransactionWithoutEntityMutationInController() throws Exception {
        form.setNewAccessionNumber("24-00002");
        perform(200);
        verify(edits).editSample(any(), any(), isNull(), eq(true), eq("12"));
        verifyZeroInteractions(samples);
    }

    @Test
    public void failedServiceGuardReturns400AndDoesNotRunFhirTransform() throws Exception {
        doThrow(new LIMSRuntimeException("Cannot cancel this analysis")).when(edits).editSample(any(), any(), isNull(),
                anyBoolean(), eq("12"));
        perform(400);
        verifyZeroInteractions(samples, fhir);
    }

    @Test
    public void postWithoutWritePermissionReturns403BeforeValidationOrDataLoads() throws Exception {
        doThrow(new AccessDeniedException("denied")).when(authorization).requireWrite(any(), eq("12"));
        perform(403);
        verify(validator, never()).validate(any(), any());
        assertNoWrites();
        verifyZeroInteractions(samples);
    }

    @Test
    public void getWithoutReadPermissionReturns403BeforeLoadingPatientData() throws Exception {
        doThrow(new AccessDeniedException("denied")).when(authorization).requireRead(any(), eq("12"));
        UserSessionData actor = new UserSessionData();
        actor.setSytemUserId(12);
        mvc.perform(get("/rest/SampleEdit").sessionAttr(IActionConstants.USER_SESSION_DATA, actor)
                .param("accessionNumber", ACCESSION)).andExpect(status().isForbidden());
        verifyZeroInteractions(samples, edits, fhir);
    }

    @Test
    public void transactionPermissionRevokedAfterControllerCheckReturns403() throws Exception {
        doThrow(new AccessDeniedException("revoked")).when(edits).editSample(any(), any(), isNull(), anyBoolean(),
                eq("12"));
        perform(403);
        verifyZeroInteractions(samples, fhir);
    }

    @Test
    public void authorizedListModifyEntryDoesNotNeedOldWritableSessionParameter() throws Exception {
        when(authorization.canWrite(any(), eq("12"))).thenReturn(true);
        UserSessionData actor = new UserSessionData();
        actor.setSytemUserId(12);
        mvc.perform(get("/rest/SampleEdit").sessionAttr(IActionConstants.USER_SESSION_DATA, actor)
                .param("accessionNumber", ACCESSION)).andExpect(status().isOk())
                .andExpect(jsonPath("$.isEditable").value(true));
    }

    @Test
    public void explicitReadonlyBookmarkRemainsReadonlyForWriter() throws Exception {
        when(authorization.canWrite(any(), eq("12"))).thenReturn(true);
        UserSessionData actor = new UserSessionData();
        actor.setSytemUserId(12);
        mvc.perform(get("/rest/SampleEdit").sessionAttr(IActionConstants.USER_SESSION_DATA, actor)
                .param("accessionNumber", ACCESSION).param("type", "readonly"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.isEditable").value(false));
    }

    @Test
    public void writableQueryAndOldSessionFlagCannotElevateReadonlyOperator() throws Exception {
        when(authorization.canWrite(any(), eq("12"))).thenReturn(false);
        UserSessionData actor = new UserSessionData();
        actor.setSytemUserId(12);
        mvc.perform(get("/rest/SampleEdit").sessionAttr(IActionConstants.USER_SESSION_DATA, actor)
                .sessionAttr(IActionConstants.SAMPLE_EDIT_WRITABLE, "readwrite")
                .param("accessionNumber", ACCESSION).param("type", "readwrite"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.isEditable").value(false));
    }

    @Test
    public void missingOrderInformationReturns400BeforeServiceCouldDereferenceIt() throws Exception {
        form.setSampleOrderItems(null);
        perform(400);
        assertNoWrites();
    }

    @Test
    public void allTubesRemainVisibleInNumericOrderWithHighestNonEnteredTubeReserved() {
        Sample sample = new Sample();
        sample.setId("9400001");
        SampleItem entered = persistedTube("9600012", "2", "entered");
        SampleItem otherState = persistedTube("9600011", "10", "order-test-entered");
        SampleItem canceled = persistedTube("9600013", "1", "canceled");
        List<SampleItem> persisted = List.of(otherState, entered, canceled);
        SampleItemService tubes = mock(SampleItemService.class);
        when(tubes.getSampleItemsBySampleId(sample.getId())).thenReturn(persisted);
        ReflectionTestUtils.setField(controller, "sampleItemService", tubes);

        List<SampleItem> displayed = ReflectionTestUtils.invokeMethod(controller, "getSampleItems", sample);

        assertEquals("Reading must retain every real tube, regardless of state", 3, displayed.size());
        assertEquals(List.of(canceled, entered, otherState), displayed);
        assertEquals("The read must not rearrange the service's returned collection",
                List.of(otherState, entered, canceled), persisted);
        assertEquals("New tube numbering must reserve the largest persisted number, including non-Entered tubes",
                ACCESSION + "-10",
                ReflectionTestUtils.invokeMethod(controller, "getMaxAccessionNumber", persisted, ACCESSION));
        verify(tubes).getSampleItemsBySampleId(sample.getId());
        verify(tubes, never()).getSampleItemsBySampleIdAndStatus(anyString(), anySet());
        assertNoWrites();
    }

    @Test
    public void nonEnteredTubeDoesNotLoadOrOfferAddOnTests() {
        SampleItem tube = persistedTube("9600011", "1", "order-test-entered");
        TypeOfSampleService sampleTypes = mock(TypeOfSampleService.class);
        TypeOfSampleTestService mappings = mock(TypeOfSampleTestService.class);
        TestService tests = mock(TestService.class);
        ReflectionTestUtils.setField(controller, "typeOfSampleService", sampleTypes);
        ReflectionTestUtils.setField(controller, "typeOfSampleTestService", mappings);
        ReflectionTestUtils.setField(controller, "testService", tests);
        when(SpringContext.getBean(IStatusService.class).matches(tube.getStatusId(), SampleStatus.Entered))
                .thenReturn(false);

        ReflectionTestUtils.invokeMethod(controller, "setAddableTestInfo", form, List.of(tube), ACCESSION);

        assertTrue("A persisted non-Entered tube must have no add-on choices", form.getPossibleTests().isEmpty());
        verifyZeroInteractions(sampleTypes, mappings, tests);
        assertNoWrites();
    }

    private SampleItem persistedTube(String id, String sortOrder, String status) {
        SampleItem tube = new SampleItem();
        tube.setId(id);
        tube.setSortOrder(sortOrder);
        tube.setStatusId(status);
        return tube;
    }

    private void perform(int status) throws Exception {
        UserSessionData actor = new UserSessionData();
        actor.setSytemUserId(12);
        mvc.perform(post("/rest/SampleEdit").sessionAttr(IActionConstants.USER_SESSION_DATA, actor)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.copy().setSerializationInclusion(JsonInclude.Include.ALWAYS).writeValueAsString(form)))
                .andExpect(
                        result -> assertEquals(
                                "Resolved exception: " + result.getResolvedException() + "; response: "
                                        + result.getResponse().getContentAsString(),
                                status, result.getResponse().getStatus()));
    }

    private void assertNoWrites() {
        verifyZeroInteractions(edits, fhir);
    }
}
