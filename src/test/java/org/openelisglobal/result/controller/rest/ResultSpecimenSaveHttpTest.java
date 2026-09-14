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

    private static class SimTransactionManager extends AbstractPlatformTransactionManager {
        int commits;
        int rollbacks;

        protected Object doGetTransaction() {
            return new Object();
        }

        protected void doBegin(Object transaction, TransactionDefinition definition) {
        }

        protected void doCommit(DefaultTransactionStatus status) {
            commits++;
        }

        protected void doRollback(DefaultTransactionStatus status) {
            rollbacks++;
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
        ReflectionTestUtils.setField(FormFields.class, "instance", mock(FormFields.class));
        Map<Class<?>, Object> beans = new HashMap<>();
        DefaultConfigurationProperties config = mock(DefaultConfigurationProperties.class);
        when(config.getPropertyValue(Property.DEFAULT_LANG_LOCALE)).thenReturn("en");
        when(config.getPropertyValue(Property.DEFAULT_DATE_LOCALE)).thenReturn("en");
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
        when(analyses.get("101")).thenReturn(analysis);
        dao = mock(OrdinaryResultSaveStateDAO.class);
        when(dao.findState("101")).thenAnswer(call -> new OrdinaryResultSaveStateDAO.State("101",
                analysis.getStatusId(), analysis.getReleasedDate(), analysis.getPrintedDate()));
        org.openelisglobal.result.service.ResultIntakeAdmissionTest.allow(dao, "201", "101");
        when(dao.lockSpecimen("201")).thenReturn(tube);
        when(dao.lockAnalysis("101")).thenReturn(analysis);
        when(dao.findSpecimenState("101")).thenReturn(new SpecimenState("101", "401", "201", "301", "10", true, false));
        LogbookPersistServiceImpl target = new LogbookPersistServiceImpl();
        ReflectionTestUtils.setField(target, "specimenWriteGuard", new ResultSpecimenWriteGuard(dao, statuses));
        ReflectionTestUtils.setField(target, "noteService", notes);
        tx = new SimTransactionManager();
        ProxyFactory proxy = new ProxyFactory(target);
        proxy.addAdvice(new TransactionInterceptor(tx, new AnnotationTransactionAttributeSource()));
        controller = new ResultEntryRestController();
        ReflectionTestUtils.setField(controller, "analysisService", analyses);
        ReflectionTestUtils.setField(controller, "logbookPersistService",
                (LogbookResultsPersistService) proxy.getProxy());
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
        SecurityContextHolder.setContext(oldSecurity);
        ReflectionTestUtils.setField(SpringContext.class, "factory", oldFactory);
        ReflectionTestUtils.setField(FormFields.class, "instance", oldForms);
    }

    @Test
    public void realSaveUrlReturnsSpecimenConflictAndNoPostCommitEffects() throws Exception {
        mvc.perform(post("/rest/results-entry/analysis/101/result").session(session)
                .contentType(MediaType.APPLICATION_JSON).content(
                        "{\"testResult\":{\"analysisId\":\"101\",\"testId\":\"401\",\"sampleItemId\":\"201\",\"accessionNumber\":\"SIM-RESULT-301\",\"testDate\":\"\",\"resultValue\":\"\",\"isModified\":true}}"))
                .andExpect(status().isConflict())
                .andExpect(content().string("{\"error\":\"error.results.specimenNotEligible\"}"));
        verify(dao).findSpecimenState("101");
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
