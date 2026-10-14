package org.openelisglobal.samplebatchentry.controller.rest;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyZeroInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.HashMap;
import java.util.Map;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.provider.validation.AccessionNumberValidatorFactory;
import org.openelisglobal.common.provider.validation.SiteYearAccessionValidator;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.OrderStatus;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DateUtil;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.config.AppConfig;
import org.openelisglobal.internationalization.MessageUtil;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.patient.action.IPatientUpdate.PatientUpdateStatus;
import org.openelisglobal.sample.service.PatientManagementUpdate;
import org.openelisglobal.sample.service.SamplePatientEntryService;
import org.openelisglobal.sample.util.AccessionNumberUtil;
import org.openelisglobal.sample.validator.SamplePatientEntryFormValidator;
import org.openelisglobal.spring.util.SpringContext;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.context.support.StaticMessageSource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.Errors;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;
import org.springframework.web.servlet.HandlerInterceptor;

public class SampleBatchEntrySaveErrorMvcTest {
    private MockMvc mvc;
    private MockHttpSession session;
    private SamplePatientEntryFormValidator validator;
    private SamplePatientEntryService persistence;
    private LocalValidatorFactoryBean beanValidator;
    private final Map<Class<?>, Object> beans = new HashMap<>();
    private Object oldContext, oldFactory, oldFields, oldMessages, oldAccessionFactory, oldDisplayList;
    private final Map<String, Object> oldNamePatterns = new HashMap<>();

    @Before
    public void setup() throws Exception {
        oldContext = ReflectionTestUtils.getField(SpringContext.class, "context");
        oldFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        oldFields = ReflectionTestUtils.getField(FormFields.class, "instance");
        oldMessages = ReflectionTestUtils.getField(MessageUtil.class, "instance");
        oldDisplayList = ReflectionTestUtils.getField(org.openelisglobal.common.services.DisplayListService.class,
                "instance");
        var lists = mock(org.openelisglobal.common.services.DisplayListService.class);
        when(lists.getList(any(org.openelisglobal.common.services.DisplayListService.ListType.class)))
                .thenReturn(java.util.List.of());
        ReflectionTestUtils.setField(org.openelisglobal.common.services.DisplayListService.class, "instance", lists);
        var factory = mock(AutowireCapableBeanFactory.class);
        when(factory.getBean(any(Class.class)))
                .thenAnswer(call -> beans.computeIfAbsent((Class<?>) call.getArguments()[0], key -> mock(key)));
        var settings = mock(DefaultConfigurationProperties.class);
        when(settings.getPropertyValue(any(Property.class))).thenAnswer(call -> {
            Property key = (Property) call.getArguments()[0];
            if (key == Property.DEFAULT_DATE_LOCALE || key == Property.DEFAULT_LANG_LOCALE)
                return "zh-CN";
            if (key == Property.ACCESSION_NUMBER_VALIDATE)
                return "true";
            if (key == Property.ACCESSION_NUMBER_PREFIX)
                return "DEV01";
            if (key == Property.AccessionFormat)
                return "SITEYEARNUM";
            return "false";
        });
        when(settings.getPropertyValue(any(String.class))).thenReturn("");
        when(settings.getPropertyValue("domain.human")).thenReturn("H");
        beans.put(DefaultConfigurationProperties.class, settings);
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        ReflectionTestUtils.setField(FormFields.class, "instance", mock(FormFields.class));
        MessageUtil.setMessageSource(new StaticMessageSource());
        for (String name : new String[] { "FIRST_NAME_REGEX", "LAST_NAME_REGEX", "USER_NAME_REGEX",
                "FULL_NAME_REGEX" }) {
            oldNamePatterns.put(name, ReflectionTestUtils
                    .getField(org.openelisglobal.validation.constraintvalidator.NameValidator.class, name));
            ReflectionTestUtils.setField(org.openelisglobal.validation.constraintvalidator.NameValidator.class, name,
                    "^[A-Za-z]+$");
        }
        oldAccessionFactory = ReflectionTestUtils.getField(AccessionNumberUtil.class,
                "accessionNumberValidatorFactory");
        var accessionFactory = mock(AccessionNumberValidatorFactory.class);
        var numberValidator = new SiteYearAccessionValidator();
        when(accessionFactory.getValidator(any())).thenReturn(numberValidator);
        when(accessionFactory.getGenerator(any())).thenReturn(numberValidator);
        ReflectionTestUtils.setField(AccessionNumberUtil.class, "accessionNumberValidatorFactory", accessionFactory);
        beans.put(AccessionNumberValidatorFactory.class, accessionFactory);
        var statuses = mock(IStatusService.class);
        when(statuses.getStatusID(any(OrderStatus.class))).thenReturn("1");
        when(statuses.getStatusID(any(SampleStatus.class))).thenReturn("1");
        beans.put(IStatusService.class, statuses);
        var patientUpdate = mock(PatientManagementUpdate.class);
        when(patientUpdate.getPatientUpdateStatus()).thenReturn(PatientUpdateStatus.NO_ACTION);
        beans.put(PatientManagementUpdate.class, patientUpdate);
        var controller = new SampleBatchEntryRestController();
        validator = mock(SamplePatientEntryFormValidator.class);
        persistence = mock(SamplePatientEntryService.class);
        ReflectionTestUtils.setField(controller, "entryFormValidator", validator);
        ReflectionTestUtils.setField(controller, "samplePatientEntryService", persistence);
        beanValidator = new LocalValidatorFactoryBean();
        beanValidator.setMessageInterpolator(
                new org.hibernate.validator.messageinterpolation.ParameterMessageInterpolator());
        beanValidator.afterPropertiesSet();
        mvc = MockMvcBuilders.standaloneSetup(controller).setValidator(beanValidator)
                .setMessageConverters(new AppConfig().jacksonMessageConverter())
                .addInterceptors(new HandlerInterceptor() {
                    @Override
                    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
                        ReflectionTestUtils.setField(controller, "request", request);
                        return true;
                    }
                }).build();
        session = new MockHttpSession();
        var actor = new UserSessionData();
        actor.setSytemUserId(1);
        session.setAttribute(IActionConstants.USER_SESSION_DATA, actor);
    }

    @After
    public void restore() {
        if (beanValidator != null)
            beanValidator.close();
        oldNamePatterns.forEach((name, value) -> ReflectionTestUtils
                .setField(org.openelisglobal.validation.constraintvalidator.NameValidator.class, name, value));
        ReflectionTestUtils.setField(AccessionNumberUtil.class, "accessionNumberValidatorFactory", oldAccessionFactory);
        ReflectionTestUtils.setField(MessageUtil.class, "instance", oldMessages);
        ReflectionTestUtils.setField(org.openelisglobal.common.services.DisplayListService.class, "instance",
                oldDisplayList);
        ReflectionTestUtils.setField(FormFields.class, "instance", oldFields);
        ReflectionTestUtils.setField(SpringContext.class, "context", oldContext);
        ReflectionTestUtils.setField(SpringContext.class, "factory", oldFactory);
    }

    private String number() {
        return "DEV01" + DateUtil.getTwoDigitYear() + "0000000000001";
    }

    private String body(String accession, boolean includeSample) throws Exception {
        String date = DateUtil.getCurrentDateAsText();
        String xml = includeSample
                ? "<samples><sample sampleID='2' tests='1' panels='' date='" + date
                        + "' time='00:00' testSectionMap='' testSampleTypeMap='' /></samples>"
                : "<samples/>";
        Map<String, Object> body = Map.of("currentDate", date, "method", "Pre-Printed", "sampleXML", xml,
                "patientProperties",
                Map.of("patientPK", "9200107", "patientUpdateStatus", "NO_ACTION", "firstName", "John", "lastName",
                        "Smith", "nationalId", "SYNTHETIC-BATCH-ONLY", "gender", "F", "birthDateForDisplay",
                        "1979/01/03"),
                "sampleOrderItems", Map.of("labNo", accession, "receivedDateForDisplay", date, "receivedTime", "00:00",
                        "providerFirstName", "Optimus", "providerLastName", "Prime"));
        return new AppConfig().jacksonMessageConverter().getObjectMapper().writeValueAsString(body);
    }

    private void noSave() {
        verifyZeroInteractions(persistence);
    }

    @Test
    public void originalInvalidPreprintedNumberReturnsStructured400WithoutPersistence() throws Exception {
        mvc.perform(post("/rest/SamplePatientEntryBatch").session(session).contentType(MediaType.APPLICATION_JSON)
                .content(body("123456", true))).andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.error").isString())
                .andExpect(jsonPath("$.fieldErrors[?(@.field == 'sampleOrderItems.labNo')]").isNotEmpty());
        noSave();
    }

    @Test
    public void requesterFieldFailureUsesTheExistingCompleteErrorEnvelope() throws Exception {
        doAnswer(call -> {
            ((Errors) call.getArguments()[1]).rejectValue("sampleOrderItems.referringSiteDepartmentId",
                    "requester.department.invalid", "Department must belong to the selected site");
            return null;
        }).when(validator).validate(any(), any());
        mvc.perform(post("/rest/SamplePatientEntryBatch").session(session).contentType(MediaType.APPLICATION_JSON)
                .content(body(number(), true))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[0].field").value("sampleOrderItems.referringSiteDepartmentId"))
                .andExpect(jsonPath("$.fieldErrors[0].defaultMessage")
                        .value("Department must belong to the selected site"));
        noSave();
    }

    @Test
    public void globalValidationFailureIsNotLostInAFormEcho() throws Exception {
        doAnswer(call -> {
            ((Errors) call.getArguments()[1]).reject("batch.invalid", "Invalid batch sample selection");
            return null;
        }).when(validator).validate(any(), any());
        mvc.perform(post("/rest/SamplePatientEntryBatch").session(session).contentType(MediaType.APPLICATION_JSON)
                .content(body(number(), true))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.globalErrors[0]").value("Invalid batch sample selection"));
        noSave();
    }

    @Test
    public void realSampleValidationRejectsAnEmptyBatchBeforePersistence() throws Exception {
        mvc.perform(post("/rest/SamplePatientEntryBatch").session(session).contentType(MediaType.APPLICATION_JSON)
                .content(body(number(), false))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[?(@.field == 'sampleOrderItems')]").isNotEmpty());
        noSave();
    }

    @Test
    public void persistenceFailureReturns500AndNeverClaimsValidationRejection() throws Exception {
        doThrow(new LIMSRuntimeException("Private synthetic persistence failure")).when(persistence).persistData(any(),
                any(), any(), any(), any());
        mvc.perform(post("/rest/SamplePatientEntryBatch").session(session).contentType(MediaType.APPLICATION_JSON)
                .content(body(number(), true))).andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").isString()).andExpect(jsonPath("$.sampleOrderItems").doesNotExist());
        verify(persistence, times(1)).persistData(any(), any(), any(), any(), any());
    }

    @Test
    public void successfulBatchKeepsTheOriginalFormContractAndExactlyOneSaveCall() throws Exception {
        mvc.perform(post("/rest/SamplePatientEntryBatch").session(session).contentType(MediaType.APPLICATION_JSON)
                .content(body(number(), true))).andExpect(status().isOk())
                .andExpect(jsonPath("$.sampleOrderItems.labNo").value(number()))
                .andExpect(jsonPath("$.patientProperties.patientPK").value("9200107"))
                .andExpect(jsonPath("$.error").doesNotExist());
        verify(persistence, times(1)).persistData(any(), any(), any(), any(), any());
    }
}
