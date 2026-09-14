package org.openelisglobal.result.controller.rest;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformService;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.note.service.NoteService;
import org.openelisglobal.result.action.util.ResultsValidation;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.SpecimenState;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.result.exception.ResultSaveValidationException;
import org.openelisglobal.result.service.LogbookPersistServiceImpl;
import org.openelisglobal.result.service.LogbookResultsPersistService;
import org.openelisglobal.result.service.ResultSpecimenWriteGuard;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.testalertrule.service.TestAlertEvaluationService;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.authorization.method.AuthorizationManagerBeforeMethodInterceptor;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.validation.BeanPropertyBindingResult;

/** Real save URL/controller/guard/Spring advice; SIM resources, no database. */
public class ResultSpecimenSaveHttpTest {
    private Object oldFactory;
    private Object oldForms;
    private Object oldMessages;
    private MockMvc mvc;
    private MockHttpSession session;
    private OrdinaryResultSaveStateDAO dao;
    private AnalysisService analyses;
    private FhirTransformService fhir;
    private TestAlertEvaluationService alerts;
    private NoteService notes;
    private Analysis analysis;
    private ResultEntryRestController controller;
    private SimTransactionManager tx;
    private SecurityContext oldSecurity;
    private Map<Class<?>, Object> beans;
    private org.openelisglobal.result.service.ResultService results;
    private org.openelisglobal.systemuser.service.UserService users;
    private LogbookResultsPersistService service;
    private final Map<String, Object> savedStatics = new HashMap<>();
    private final Map<String, StoredResult> durable = new HashMap<>();
    private final Map<String, StoredResult> staged = new HashMap<>();
    private String flushedStatus;
    private String durableStatus;
    private long durableVersion;
    private boolean rejectCommit;

    private record StoredResult(String id, String analysisId, String value) {
    }

    @Test
    public void reviewedSourceIsCheckedBeforeTheFirstAnalysisSetter() throws Exception {
        when(dao.findSpecimenState("101"))
                .thenReturn(new SpecimenState("101", "401", "201", "301", "10", false, false));
        when(dao.findState("101"))
                .thenReturn(new OrdinaryResultSaveStateDAO.State("101", "90", null, null));
        Analysis watched = spy(analysis);
        when(analyses.get("101")).thenReturn(watched);
        when(dao.lockAnalysis("101")).thenReturn(watched);
        savePayload(numericPayload("5", "1000", "")).andExpect(status().isConflict());
        verify(watched, never()).setStatusId(any());
        verify(watched, never()).setSysUserId(any());
        verify(watched, never()).setCompletedDate(any(java.sql.Timestamp.class));
        verify(analyses, never()).get("101");
        verifyZeroInteractions(fhir, alerts, notes);
    }

    private class SimTransactionManager extends AbstractPlatformTransactionManager {
        int commits;
        int rollbacks;
        private SimResource current;

        private class SimResource implements org.springframework.transaction.support.SmartTransactionObject {
            boolean active;
            boolean rollbackOnly;

            public boolean isRollbackOnly() {
                return rollbackOnly;
            }

            public void flush() {
            }
        }

        protected Object doGetTransaction() {
            return current == null ? new SimResource() : current;
        }

        protected boolean isExistingTransaction(Object transaction) {
            return ((SimResource) transaction).active;
        }

        protected void doBegin(Object transaction, TransactionDefinition definition) {
            current = (SimResource) transaction;
            current.active = true;
            staged.clear();
            staged.putAll(durable);
            flushedStatus = durableStatus;
        }

        protected void doCommit(DefaultTransactionStatus status) {
            if (rejectCommit)
                throw new org.springframework.transaction.TransactionSystemException("SIM commit failed");
            durable.clear();
            durable.putAll(staged);
            durableStatus = analysis.getStatusId();
            durableVersion = analysis.getLastupdated() == null ? 0 : analysis.getLastupdated().getTime();
            commits++;
        }

        protected void doRollback(DefaultTransactionStatus status) {
            rollbacks++;
            staged.clear();
            analysis.setStatusId(durableStatus);
            analysis.setLastupdated(new java.sql.Timestamp(durableVersion));
        }

        protected void doSetRollbackOnly(DefaultTransactionStatus status) {
            ((SimResource) status.getTransaction()).rollbackOnly = true;
        }

        protected void doCleanupAfterCompletion(Object transaction) {
            current.active = false;
            current = null;
        }
    }

    @Before
    public void setup() {
        oldSecurity = SecurityContextHolder.getContext();
        SecurityContext authorized = SecurityContextHolder.createEmptyContext();
        authorized.setAuthentication(new UsernamePasswordAuthenticationToken("SIM-results-user", "N/A",
                List.of(new SimpleGrantedAuthority("ROLE_RESULTS"))));
        SecurityContextHolder.setContext(authorized);
        oldFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        oldForms = ReflectionTestUtils.getField(FormFields.class, "instance");
        oldMessages = ReflectionTestUtils.getField(org.openelisglobal.internationalization.MessageUtil.class,
                "instance");
        var messages = new org.springframework.context.support.StaticMessageSource();
        messages.setUseCodeAsDefaultMessage(true);
        org.openelisglobal.internationalization.MessageUtil.setMessageSource(messages);
        ReflectionTestUtils.setField(FormFields.class, "instance", mock(FormFields.class));
        beans = new HashMap<>();
        DefaultConfigurationProperties config = mock(DefaultConfigurationProperties.class);
        when(config.getPropertyValue(Property.DEFAULT_LANG_LOCALE)).thenReturn("en");
        when(config.getPropertyValue(Property.DEFAULT_DATE_LOCALE)).thenReturn("en");
        when(config.getPropertyValue(Property.StatusRules)).thenReturn("SIM");
        when(config.getPropertyValueUpperCase(Property.StatusRules)).thenReturn("SIM");
        beans.put(DefaultConfigurationProperties.class, config);
        IStatusService statuses = mock(IStatusService.class);
        org.openelisglobal.result.action.util.ResultReviewTransitionTest.configure(statuses);
        when(statuses.getStatusID(SampleStatus.Entered)).thenReturn("10");
        beans.put(IStatusService.class, statuses);
        analyses = mock(AnalysisService.class);
        beans.put(AnalysisService.class, analyses);
        notes = mock(NoteService.class);
        beans.put(NoteService.class, notes);
        ResultsValidation validation = mock(ResultsValidation.class);
        when(validation.validateModifiedItems(anyList()))
                .thenReturn(new BeanPropertyBindingResult(new Object(), "SIM-result"));
        beans.put(ResultsValidation.class, validation);
        AutowireCapableBeanFactory factory = mock(AutowireCapableBeanFactory.class, call -> {
            if ("getBean".equals(call.getMethod().getName()) && call.getArguments().length == 1
                    && call.getArgument(0) instanceof Class<?> type) {
                return beans.computeIfAbsent(type, key -> mock(key));
            }
            return org.mockito.Answers.RETURNS_DEFAULTS.answer(call);
        });
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        Sample sample = new Sample();
        sample.setId("301");
        sample.setAccessionNumber("SIM-RESULT-301");
        SampleItem tube = new SampleItem();
        tube.setId("201");
        tube.setSample(sample);
        tube.setStatusId("10");
        org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
        test.setId("401");
        analysis = new Analysis();
        analysis.setId("101");
        analysis.setStatusId("1");
        analysis.setTest(test);
        analysis.setSampleItem(tube);
        analysis.setLastupdated(new java.sql.Timestamp(1000));
        analysis.setRevision("1");
        durableStatus = flushedStatus = "1";
        durableVersion = 1000;
        when(analyses.get("101")).thenReturn(analysis);
        dao = mock(OrdinaryResultSaveStateDAO.class);
        when(dao.findState("101")).thenAnswer(call -> new OrdinaryResultSaveStateDAO.State("101", flushedStatus,
                analysis.getReleasedDate(), analysis.getPrintedDate()));
        doAnswer(call -> {
            flushedStatus = analysis.getStatusId();
            return null;
        }).when(dao).flush();
        org.openelisglobal.result.service.ResultIntakeAdmissionTest.allow(dao, "201", "101");
        when(dao.lockSpecimen("201")).thenReturn(tube);
        when(dao.lockAnalysis("101")).thenReturn(analysis);
        when(dao.findSpecimenState("101")).thenReturn(new SpecimenState("101", "401", "201", "301", "10", true, false));
        LogbookPersistServiceImpl target = new LogbookPersistServiceImpl() {
            // Reflex/calculation execution is outside this explicitly SIM single-row
            // fixture.
            @Override
            protected List<Analysis> setTestReflexes(org.openelisglobal.result.action.util.ResultsUpdateDataSet data,
                    String user) {
                return List.of();
            }
        };
        ReflectionTestUtils.setField(target, "specimenWriteGuard", new ResultSpecimenWriteGuard(dao, statuses));
        ReflectionTestUtils.setField(target, "noteService", notes);
        users = mock(org.openelisglobal.systemuser.service.UserService.class);
        // Use the application role constant; the fixture never grants another unit.
        when(users.filterAnalysesByLabUnitRoles(eq("701"), anyList(),
                eq(org.openelisglobal.common.constants.Constants.ROLE_RESULTS)))
                .thenAnswer(call -> call.getArgument(1));
        ReflectionTestUtils.setField(target, "userService", users);
        ReflectionTestUtils.setField(target, "historyDAO", mock(org.openelisglobal.audittrail.dao.HistoryDAO.class));
        ReflectionTestUtils.setField(target, "systemUserService",
                mock(org.openelisglobal.systemuser.service.SystemUserService.class));
        ReflectionTestUtils.setField(target, "analysisService", analyses);
        results = mock(org.openelisglobal.result.service.ResultService.class);
        beans.put(org.openelisglobal.result.service.ResultService.class, results);
        ReflectionTestUtils.setField(target, "resultService", results);
        var samples = mock(org.openelisglobal.sample.service.SampleService.class);
        beans.put(org.openelisglobal.sample.service.SampleService.class, samples);
        sample.setStatusId("801");
        when(statuses.getStatusID(org.openelisglobal.common.services.StatusService.OrderStatus.Started))
                .thenReturn("801");
        when(samples.getSampleByAccessionNumber("SIM-RESULT-301")).thenReturn(sample);
        when(samples.get("301")).thenReturn(sample);
        var patient = new org.openelisglobal.patient.valueholder.Patient();
        patient.setId("901");
        when(samples.getPatient(sample)).thenReturn(patient);
        ReflectionTestUtils.setField(target, "sampleService", samples);
        var definitions = mock(org.openelisglobal.testresult.service.TestResultService.class);
        beans.put(org.openelisglobal.testresult.service.TestResultService.class, definitions);
        var definition = new org.openelisglobal.testresult.valueholder.TestResult();
        definition.setId("601");
        definition.setTest(test);
        definition.setTestResultType("N");
        definition.setIsActive(true);
        when(definitions.getActiveTestResultsByTest("401")).thenReturn(List.of(definition));
        for (String name : List.of("resultService", "testResultService", "resultSigService", "referralResultService")) {
            savedStatics.put(name,
                    ReflectionTestUtils.getField(org.openelisglobal.common.services.ResultSaveService.class, name));
        }
        ReflectionTestUtils.setField(org.openelisglobal.common.services.ResultSaveService.class, "resultService",
                results);
        ReflectionTestUtils.setField(org.openelisglobal.common.services.ResultSaveService.class, "testResultService",
                definitions);
        doAnswer(call -> {
            org.openelisglobal.result.valueholder.Result result = call.getArgument(0);
            StoredResult saved = staged.get(result.getId());
            if (saved != null) {
                result.setAnalysis(analysis);
                result.setValue(saved.value());
                result.setTestResult(definition);
                result.setResultType("N");
            }
            return null;
        }).when(results).getData(any(org.openelisglobal.result.valueholder.Result.class));
        when(results.insert(any())).thenAnswer(call -> {
            var result = (org.openelisglobal.result.valueholder.Result) call.getArgument(0);
            assertTrue(org.springframework.transaction.support.TransactionSynchronizationManager
                    .isActualTransactionActive());
            assertEquals("9", analysis.getStatusId());
            staged.put("501", new StoredResult("501", result.getAnalysis().getId(), result.getValue()));
            return "501";
        });
        when(results.update(any())).thenAnswer(call -> {
            var result = (org.openelisglobal.result.valueholder.Result) call.getArgument(0);
            staged.put(result.getId(),
                    new StoredResult(result.getId(), result.getAnalysis().getId(), result.getValue()));
            return result;
        });
        when(analyses.update(any())).thenAnswer(call -> {
            analysis.setLastupdated(new java.sql.Timestamp(durableVersion + 1000));
            return analysis;
        });
        tx = new SimTransactionManager();
        ProxyFactory proxy = new ProxyFactory(target);
        proxy.addAdvice(new TransactionInterceptor(tx, new AnnotationTransactionAttributeSource()));
        controller = new ResultEntryRestController();
        service = (LogbookResultsPersistService) proxy.getProxy();
        ReflectionTestUtils.setField(controller, "logbookPersistService", service);
        fhir = mock(FhirTransformService.class);
        alerts = mock(TestAlertEvaluationService.class);
        ReflectionTestUtils.setField(controller, "fhirTransformService", fhir);
        ReflectionTestUtils.setField(controller, "testAlertEvaluationService", alerts);
        ProxyFactory secured = new ProxyFactory(controller);
        secured.setProxyTargetClass(true);
        secured.addAdvisor(AuthorizationManagerBeforeMethodInterceptor.preAuthorize());
        mvc = MockMvcBuilders.standaloneSetup(secured.getProxy()).build();
        UserSessionData user = new UserSessionData();
        user.setSytemUserId(701);
        session = new MockHttpSession();
        session.setAttribute(IActionConstants.USER_SESSION_DATA, user);
    }

    @After
    public void restore() {
        savedStatics.forEach((key, value) -> ReflectionTestUtils
                .setField(org.openelisglobal.common.services.ResultSaveService.class, key, value));
        SecurityContextHolder.setContext(oldSecurity);
        ReflectionTestUtils.setField(SpringContext.class, "factory", oldFactory);
        ReflectionTestUtils.setField(FormFields.class, "instance", oldForms);
        ReflectionTestUtils.setField(org.openelisglobal.internationalization.MessageUtil.class, "instance",
                oldMessages);
    }

    @Test
    public void realSaveUrlReturnsSpecimenConflictAndNoPostCommitEffects() throws Exception {
        mvc.perform(post("/rest/results-entry/analysis/101/result").session(session)
                .contentType(MediaType.APPLICATION_JSON).content(
                        "{\"testResult\":{\"analysisId\":\"101\",\"testId\":\"401\",\"sampleItemId\":\"201\",\"accessionNumber\":\"SIM-RESULT-301\",\"testDate\":\"\",\"resultValue\":\"\",\"isModified\":true}}"))
                .andExpect(status().isConflict())
                .andExpect(content().string("{\"error\":\"error.results.specimenNotEligible\"}"));
        verify(dao, atLeastOnce()).findSpecimenState("101");
        assertEquals(1, tx.rollbacks);
        assertEquals(0, tx.commits);
        verifyZeroInteractions(fhir, alerts, notes);
    }

    @Test
    public void fixedErrorContractDoesNotReflectUnknownExceptionText() {
        var response = controller
                .resultSaveValidationFailure(new ResultSaveValidationException("SIM-private-patient-message"));
        assertEquals(409, response.getStatusCode().value());
        assertEquals(Map.of("error", "error.save.msg"), response.getBody());
    }

    private void allowNumericEntry() {
        when(dao.findSpecimenState("101"))
                .thenReturn(new SpecimenState("101", "401", "201", "301", "10", false, false));
        var validation = new ResultsValidation();
        ReflectionTestUtils.setField(validation, "analysisService", analyses);
        ReflectionTestUtils.setField(validation, "resultService", results);
        beans.put(ResultsValidation.class, validation);
    }

    private String numericPayload(String value, String token, String resultId) {
        return "{\"testResult\":{\"analysisId\":\"101\",\"testId\":\"401\",\"sampleItemId\":\"201\","
                + "\"accessionNumber\":\"SIM-RESULT-301\",\"sequenceAccessionNumber\":\"SIM-RESULT-301\","
                + "\"testDate\":\"01/01/2025 10:00\",\"resultType\":\"N\",\"resultValue\":\"" + value
                + "\",\"shadowResultValue\":\"8\",\"analysisLastupdated\":\"" + token + "\",\"resultId\":\"" + resultId
                + "\",\"isModified\":true}}";
    }

    private org.springframework.test.web.servlet.ResultActions savePayload(String payload) throws Exception {
        return mvc.perform(post("/rest/results-entry/analysis/101/result").session(session)
                .contentType(MediaType.APPLICATION_JSON).content(payload));
    }

    @Test
    public void malformedMultiselectHttpSaveCannotAdvanceOrReturnFalseSuccess() throws Exception {
        allowNumericEntry();
        var definitions = (org.openelisglobal.testresult.service.TestResultService) beans
                .get(org.openelisglobal.testresult.service.TestResultService.class);
        var choice = definitions.getActiveTestResultsByTest("401").get(0);
        choice.setValue("10");
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        for (String type : List.of("M", "C")) {
            choice.setTestResultType(type);
            for (String invalid : List.of("not-json", "[]", "null", "{\"x\":\"10\"}", "{\"2147483648\":\"10\"}",
                    "{\"0\":[\"10\"]}", "{\"0\":null}", "{\"0\":\"10,\"}", "{\"0\":\"999\"}")) {
                var body = (com.fasterxml.jackson.databind.node.ObjectNode) mapper
                        .readTree(numericPayload("5", "1000", ""));
                var item = (com.fasterxml.jackson.databind.node.ObjectNode) body.get("testResult");
                item.put("resultType", type);
                item.put("multiSelectResultValues", invalid);
                savePayload(mapper.writeValueAsString(body)).andExpect(status().isConflict())
                        .andExpect(jsonPath("$.error").value("error.results.componentMismatch"));
                assertEquals("1", analysis.getStatusId());
                assertEquals(1000, analysis.getLastupdated().getTime());
            }
        }
        assertEquals(0, tx.commits);
        assertTrue(durable.isEmpty());
        verify(results, never()).insert(any());
        verify(results, never()).update(any());
        verify(analyses, never()).update(any());
        verifyZeroInteractions(fhir, alerts);
    }

    @Test
    public void emptyMultiselectCannotClearExistingResultsOrCreatePendingReview() throws Exception {
        allowNumericEntry();
        var definitions = (org.openelisglobal.testresult.service.TestResultService) beans
                .get(org.openelisglobal.testresult.service.TestResultService.class);
        var choice = definitions.getActiveTestResultsByTest("401").get(0);
        choice.setValue("10");
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        for (String type : List.of("M", "C")) {
            choice.setTestResultType(type);
            for (boolean existing : List.of(false, true)) {
                durable.clear();
                if (existing)
                    durable.put("501", new StoredResult("501", "101", "10"));
                for (String empty : List.of("{}", "{ }", "", " ", "OMIT")) {
                    var body = (com.fasterxml.jackson.databind.node.ObjectNode) mapper
                            .readTree(numericPayload("5", "1000", ""));
                    var item = (com.fasterxml.jackson.databind.node.ObjectNode) body.get("testResult");
                    item.put("resultType", type);
                    if (!empty.equals("OMIT"))
                        item.put("multiSelectResultValues", empty);
                    savePayload(mapper.writeValueAsString(body)).andExpect(status().isBadRequest());
                    assertEquals(existing ? Map.of("501", new StoredResult("501", "101", "10")) : Map.of(), durable);
                    assertEquals("1", analysis.getStatusId());
                    assertEquals(1000, analysis.getLastupdated().getTime());
                }
            }
        }
        verify(results, never()).insert(any());
        verify(results, never()).update(any());
        verify(results, never()).getResultsByAnalysis(any());
        verify(analyses, never()).update(any());
        verifyZeroInteractions(fhir, alerts);
    }

    @Test
    public void actualMultiselectHttpSavePersistsASelectedResult() throws Exception {
        saveSelection("M");
    }

    @Test
    public void actualCascadingHttpSavePersistsASelectedResult() throws Exception {
        saveSelection("C");
    }

    private void saveSelection(String type) throws Exception {
        allowNumericEntry();
        var definitions = (org.openelisglobal.testresult.service.TestResultService) beans
                .get(org.openelisglobal.testresult.service.TestResultService.class);
        var choice = definitions.getActiveTestResultsByTest("401").get(0);
        choice.setValue("10");
        choice.setTestResultType(type);
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        var body = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(numericPayload("", "1000", ""));
        var item = (com.fasterxml.jackson.databind.node.ObjectNode) body.get("testResult");
        item.put("resultType", type);
        item.put("multiSelectResultValues", "{\"0\":\"10\"}");
        savePayload(mapper.writeValueAsString(body)).andExpect(status().isOk())
                .andExpect(jsonPath("$.analysisStatusId").value("9"));
        assertEquals(Map.of("501", new StoredResult("501", "101", "10")), durable);
        assertEquals("10", independentRead().getValue());
        assertEquals("9", durableStatus);
        assertEquals(1, tx.commits);
    }

    @Test
    public void actualNonemptyHttpSaveCommitsBeforeEffectsAndReadsBackIndependentValue() throws Exception {
        allowNumericEntry();
        doAnswer(call -> {
            assertEquals(1, tx.commits);
            assertFalse(org.springframework.transaction.support.TransactionSynchronizationManager
                    .isActualTransactionActive());
            assertEquals("5", durable.get("501").value());
            return null;
        }).when(fhir).transformPersistResultsEntryFhirObjects(any());
        savePayload(numericPayload("5", "1000", "")).andExpect(status().isOk())
                .andExpect(jsonPath("$.analysisStatusId").value("9"))
                .andExpect(jsonPath("$.analysisLastupdated").value("2000"));
        assertEquals(new StoredResult("501", "101", "5"), durable.get("501"));
        assertEquals("9", durableStatus);
        assertEquals(2000, durableVersion);
        verify(fhir).transformPersistResultsEntryFhirObjects(any());
        verify(alerts).evaluateAndDispatch(any(), eq("701"));
        verify(analyses, never()).get("101");
        // Change the prepared graph after commit; the committed read must not alias it.
        analysis.setStatusId("SIM-not-the-store");
        assertEquals("5", independentRead().getValue());
        assertEquals("9", independentRead().getAnalysis().getStatusId());
    }

    private org.openelisglobal.result.valueholder.Result independentRead() throws Exception {
        var constructor = org.openelisglobal.result.service.ResultServiceImpl.class.getDeclaredConstructor();
        constructor.setAccessible(true);
        var reader = constructor.newInstance();
        var readDao = mock(org.openelisglobal.result.dao.ResultDAO.class);
        when(readDao.getResultById("501")).thenAnswer(call -> {
            StoredResult stored = durable.get("501");
            if (stored == null)
                return null;
            var result = new org.openelisglobal.result.valueholder.Result();
            result.setId(stored.id());
            result.setValue(stored.value());
            Analysis reloaded = new Analysis();
            reloaded.setId(stored.analysisId());
            reloaded.setStatusId(durableStatus);
            reloaded.setLastupdated(new java.sql.Timestamp(durableVersion));
            result.setAnalysis(reloaded);
            return result;
        });
        Object previousDao = ReflectionTestUtils.getField(reader, "baseObjectDAO");
        try {
            ReflectionTestUtils.setField(reader, "baseObjectDAO", readDao);
            return reader.getResultById("501");
        } finally {
            ReflectionTestUtils.setField(reader, "baseObjectDAO", previousDao);
        }
    }

    @Test
    public void zeroIsSavedThenSameResultCanBeReopenedAndEditedWithoutDuplicate() throws Exception {
        allowNumericEntry();
        savePayload(numericPayload("0", "1000", "")).andExpect(status().isOk());
        assertEquals("0", independentRead().getValue());
        savePayload(numericPayload("5", "2000", "501")).andExpect(status().isOk())
                .andExpect(jsonPath("$.analysisLastupdated").value("3000"));
        assertEquals("5", independentRead().getValue());
        assertEquals(1, durable.size());
        assertEquals(2, tx.commits);
    }

    @Test
    public void invalidOrMissingVersionNeverEntersResultPreparation() throws Exception {
        allowNumericEntry();
        for (String token : List.of("", "garbled", "999", "999999999999999999999999", "01000")) {
            savePayload(numericPayload("5", token, "")).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.error").value("error.results.staleSave"));
            assertTrue(durable.isEmpty());
            assertEquals("1", analysis.getStatusId());
        }
        verifyZeroInteractions(results, fhir, alerts, notes);
    }

    @Test
    public void clientCannotChangeNumericTypeOrTargetTestToBypassValidation() throws Exception {
        allowNumericEntry();
        savePayload(numericPayload("not-a-number", "1000", "").replace("\"resultType\":\"N\"", "\"resultType\":\"A\""))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("error.results.resultDefinitionMissing"));
        savePayload(numericPayload("5", "1000", "").replace("\"testId\":\"401\"", "\"testId\":\"402\""))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error").value("error.results.testMismatch"));
        assertTrue(durable.isEmpty());
        assertEquals("1", analysis.getStatusId());
        verifyZeroInteractions(fhir, alerts, notes);
    }

    @Test
    public void malformedNumericValueReturnsValidationFailureWithoutAnyResultWrite() throws Exception {
        allowNumericEntry();
        for (String value : List.of("NaN", "Infinity", "1e999", "bad")) {
            savePayload(numericPayload(value, "1000", "")).andExpect(status().isBadRequest());
            assertTrue(durable.isEmpty());
            assertEquals("1", analysis.getStatusId());
        }
        verify(results, never()).insert(any());
        verify(results, never()).update(any());
        verifyZeroInteractions(fhir, alerts, notes);
    }

    @Test
    public void missingResultAndWrongSpecimenCannotBeRebound() throws Exception {
        allowNumericEntry();
        savePayload(numericPayload("5", "1000", "999")).andExpect(status().isConflict());
        savePayload(numericPayload("5", "1000", "").replace("\"sampleItemId\":\"201\"", "\"sampleItemId\":\"202\""))
                .andExpect(status().isConflict());
        assertTrue(durable.isEmpty());
        assertEquals("1", analysis.getStatusId());
        verifyZeroInteractions(fhir, alerts, notes);
    }

    @Test
    public void labUnitPermissionIsCheckedBeforeStateDisclosureOrMutation() {
        allowNumericEntry();
        when(users.filterAnalysesByLabUnitRoles(anyString(), anyList(), anyString())).thenReturn(List.of());
        Exception failure = assertThrows(Exception.class, () -> savePayload(numericPayload("5", "1000", "")));
        assertTrue(rootCause(failure) instanceof org.springframework.security.access.AccessDeniedException);
        verify(dao, never()).findState(anyString());
        verifyZeroInteractions(results, fhir, alerts, notes);
    }

    @Test
    public void permissionRevokedAtCommitRollsBackAndDoesNotDispatchEffects() {
        allowNumericEntry();
        int[] checks = { 0 };
        when(users.filterAnalysesByLabUnitRoles(anyString(), anyList(), anyString())).thenAnswer(call -> {
            return ++checks[0] >= 4 ? List.of() : call.getArgument(1);
        });
        Exception failure = assertThrows(Exception.class, () -> savePayload(numericPayload("5", "1000", "")));
        assertTrue(rootCause(failure) instanceof org.springframework.security.access.AccessDeniedException);
        assertEquals(0, tx.commits);
        assertEquals(1, tx.rollbacks);
        assertTrue(durable.isEmpty());
        verifyZeroInteractions(fhir, alerts);
    }

    @Test
    public void ordinarySaveRefusesToJoinAnOuterTransactionBeforeAnyTargetRead() {
        var template = new org.springframework.transaction.support.TransactionTemplate(tx);
        template.setIsolationLevel(TransactionDefinition.ISOLATION_SERIALIZABLE);
        var request = new org.springframework.mock.web.MockHttpServletRequest();
        request.setSession(session);
        var item = new org.openelisglobal.test.beanItems.TestResultItem();
        item.setAnalysisId("101");
        assertThrows(ResultSaveValidationException.class,
                () -> template.execute(status -> service.saveSingleResult(item, request)));
        verifyZeroInteractions(dao, results, fhir, alerts, notes);
        assertEquals(0, tx.commits);
        assertEquals(1, tx.rollbacks);
    }

    private static Throwable rootCause(Throwable failure) {
        while (failure.getCause() != null)
            failure = failure.getCause();
        return failure;
    }

    @Test
    public void changedSessionActorDuringPreparationCannotCommitAnotherUsersAudit() {
        allowNumericEntry();
        doAnswer(call -> {
            var other = new UserSessionData();
            other.setSytemUserId(702);
            session.setAttribute(IActionConstants.USER_SESSION_DATA, other);
            analysis.setLastupdated(new java.sql.Timestamp(2000));
            return analysis;
        }).when(analyses).update(any());
        Exception failure = assertThrows(Exception.class, () -> savePayload(numericPayload("5", "1000", "")));
        assertTrue(rootCause(failure) instanceof org.springframework.security.access.AccessDeniedException);
        assertTrue(durable.isEmpty());
        assertEquals(0, tx.commits);
        assertEquals(1, tx.rollbacks);
        verifyZeroInteractions(fhir, alerts);
    }

    @Test
    public void lateLegalStatusChangeCannotReturnAnObsoleteSuccessfulReceipt() throws Exception {
        allowNumericEntry();
        int[] checks = { 0 };
        when(users.filterAnalysesByLabUnitRoles(anyString(), anyList(), anyString())).thenAnswer(call -> {
            if (++checks[0] == 1)
                org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                        new org.springframework.transaction.support.TransactionSynchronization() {
                            public void beforeCommit(boolean readOnly) {
                                analysis.setStatusId("1");
                                analysis.setLastupdated(new java.sql.Timestamp(3000));
                            }
                        });
            return call.getArgument(1);
        });
        savePayload(numericPayload("5", "1000", "")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("error.results.staleSave"));
        assertTrue(durable.isEmpty());
        assertEquals(0, tx.commits);
        assertEquals(1, tx.rollbacks);
        verifyZeroInteractions(fhir, alerts);
    }

    @Test
    public void nonemptyHttpSaveCannotWriteAnotherAnalysisEvenOnTheSameTube() throws Exception {
        allowNumericEntry();
        Analysis other = new Analysis();
        other.setId("102");
        other.setSampleItem(analysis.getSampleItem());
        other.setTest(analysis.getTest());
        doAnswer(call -> {
            var target = (org.openelisglobal.result.valueholder.Result) call.getArgument(0);
            target.setAnalysis(other);
            target.setValue("8");
            target.setResultType("N");
            return null;
        }).when(results).getData(any(org.openelisglobal.result.valueholder.Result.class));
        savePayload(numericPayload("5", "1000", "501")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("error.results.resultMismatch"));
        assertTrue(durable.isEmpty());
        assertEquals("1", analysis.getStatusId());
        assertEquals(1, tx.rollbacks);
        verify(results, never()).insert(any());
        verify(results, never()).update(any());
        verifyZeroInteractions(fhir, alerts, notes);
    }

    @Test
    public void realSaveUrlCannotOverwriteReviewedResultUsingPendingPreparedState() throws Exception {
        when(dao.findSpecimenState("101"))
                .thenReturn(new SpecimenState("101", "401", "201", "301", "10", false, false));
        when(dao.findState("101"))
                .thenReturn(new OrdinaryResultSaveStateDAO.State("101", "90", null, null));
        mvc.perform(post("/rest/results-entry/analysis/101/result").session(session)
                .contentType(MediaType.APPLICATION_JSON).content(
                        "{\"testResult\":{\"analysisId\":\"101\",\"testId\":\"401\",\"sampleItemId\":\"201\",\"accessionNumber\":\"SIM-RESULT-301\",\"testDate\":\"\",\"resultValue\":\"\",\"isModified\":true}}"))
                .andExpect(status().isConflict())
                .andExpect(content().string("{\"error\":\"error.results.reviewedResultLocked\"}"));
        assertEquals(1, tx.rollbacks);
        assertEquals(0, tx.commits);
        verifyZeroInteractions(fhir, alerts, notes);
    }

    @Test public void realSaveUrlExplainsMissingFirstDecisionWithoutWriting() throws Exception {
        when(dao.findSpecimenState("101")).thenReturn(new SpecimenState("101","401","201","301","10",false,false));
        var s=org.openelisglobal.result.service.ResultIntakeAdmissionTest.accepted("201","101");
        when(dao.findIntakeState("201")).thenReturn(new OrdinaryResultSaveStateDAO.IntakeState(s.tube(),s.patients(),s.requests(),s.tests(),List.of()));
        mvc.perform(post("/rest/results-entry/analysis/101/result").session(session)
            .contentType(MediaType.APPLICATION_JSON).content("{\"testResult\":{\"analysisId\":\"101\",\"testId\":\"401\",\"sampleItemId\":\"201\",\"accessionNumber\":\"SIM-RESULT-301\",\"testDate\":\"\",\"resultValue\":\"\",\"isModified\":true}}"))
            .andExpect(status().isConflict()).andExpect(content().string("{\"error\":\"error.results.specimenIntakeMissing\"}"));
        assertEquals(1,tx.rollbacks);assertEquals(0,tx.commits);verifyZeroInteractions(fhir,alerts,notes);
    }

    @Test
    public void fixedErrorContractAcceptsOnlyTheKnownBusinessCodes() {
        for (String code : List.of("error.results.specimenNotEligible", "error.results.resultMismatch",
                "error.results.resultDefinitionMissing", "error.results.specimenIntakeMissing",
                "error.results.specimenIntakeChanged", "error.results.testIntakeChanged",
                "error.results.specimenRejected", "error.results.analysisEntryUnavailable",
                "error.results.reviewedResultLocked", "error.results.statusConfigurationInvalid")) {
            assertEquals(Map.of("error", code),
                    controller.resultSaveValidationFailure(new ResultSaveValidationException(code)).getBody());
        }
        assertEquals(Map.of("error", "error.save.msg"),
                controller.resultSaveValidationFailure(new ResultSaveValidationException(null)).getBody());
    }

    @Test
    public void absentAuthenticationStopsTheSaveBeforeAnyBusinessRead() {
        SecurityContextHolder.clearContext();
        Exception thrown = assertThrows(Exception.class,
                () -> mvc.perform(post("/rest/results-entry/analysis/101/result").session(session)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"testResult\":{\"analysisId\":\"101\"}}")));
        Throwable root = thrown;
        while (root.getCause() != null)
            root = root.getCause();
        assertTrue(
                root instanceof org.springframework.security.authentication.AuthenticationCredentialsNotFoundException);
        verifyZeroInteractions(analyses, dao, fhir, alerts, notes);
    }

    @Test
    public void missingResultsRoleStopsTheSaveBeforeAnyBusinessRead() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("SIM-other-role",
                "N/A", List.of(new SimpleGrantedAuthority("ROLE_VIEW"))));
        Exception thrown = assertThrows(Exception.class,
                () -> mvc.perform(post("/rest/results-entry/analysis/101/result").session(session)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"testResult\":{\"analysisId\":\"101\"}}")));
        Throwable root = thrown;
        while (root.getCause() != null)
            root = root.getCause();
        assertTrue(root instanceof org.springframework.security.access.AccessDeniedException);
        verifyZeroInteractions(analyses, dao, fhir, alerts, notes);
    }
}
