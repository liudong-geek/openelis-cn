package org.openelisglobal.barcode.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.util.*;
import org.junit.*;
import org.openelisglobal.audittrail.dao.AuditTrailService;
import org.openelisglobal.barcode.controller.BarcodeLabelGenerationRestController;
import org.openelisglobal.barcode.dao.BarcodeLabelGenerationDAO;
import org.openelisglobal.barcode.dto.BarcodeLabelGenerateRequest;
import org.openelisglobal.barcode.labeltype.Label;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.login.dao.UserModuleService;
import org.openelisglobal.login.service.LoginUserService;
import org.openelisglobal.login.valueholder.LoginUser;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.person.valueholder.Person;
import org.openelisglobal.referencetables.service.ReferenceTablesService;
import org.openelisglobal.referencetables.valueholder.ReferenceTables;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.systemusermodule.service.PermissionModuleService;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** Actual MVC, permission and transactional generation; only SIM resources, no SQL or printing. */
public class BarcodeLabelGenerationTransactionTest {
    private static final String BODY = "{\"orderId\":\"12\",\"labNumber\":\"SIM-LABEL-12\",\"labels\":[{\"type\":\"order\",\"sampleItemId\":null,\"quantity\":1}]}";
    private final List<String> persisted = new ArrayList<>();
    private final BarcodeLabelGenerationDAO dao = mock(BarcodeLabelGenerationDAO.class);
    private final BarcodeLabelGenerationRenderer renderer = mock(BarcodeLabelGenerationRenderer.class);
    private final BarcodeLabelInfoService counts = mock(BarcodeLabelInfoService.class);
    private final AuditTrailService audit = mock(AuditTrailService.class);
    private boolean allowed = true;
    private Runnable afterRender = () -> {}, afterFlush = () -> {};
    private Object oldFactory;
    private MockHttpSession session;
    private MockMvc mvc;
    private BarcodeLabelGenerationService service;
    private BarcodeLabelGenerationServiceImpl target;
    private BarcodeLabelGenerationPermissionService permissions;
    private final org.openelisglobal.role.valueholder.Role printRole = new org.openelisglobal.role.valueholder.Role();
    private MemoryTransactions transactions;

    @Before public void setup() {
        oldFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        var factory = mock(AutowireCapableBeanFactory.class);
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        var configuration = mock(DefaultConfigurationProperties.class);
        when(factory.getBean(DefaultConfigurationProperties.class)).thenReturn(configuration);
        when(configuration.getPropertyValue("permissions.agent")).thenReturn("ROLE");
        var modules = mock(PermissionModuleService.class);
        var roles = mock(UserRoleService.class);
        when(roles.getRoleIdsForUser("7")).thenReturn(List.of("3"));
        when(modules.getAllPermittedPagesFromAgentId(3)).thenAnswer(call -> allowed ? Set.of("PrintBarcode") : Set.of());
        permissions = spy(new BarcodeLabelGenerationPermissionService(mock(UserModuleService.class), roles, modules));
        var roleDefinitions = mock(org.openelisglobal.role.service.RoleService.class);
        printRole.setId("3"); printRole.setName("printer"); printRole.setActive(true);
        when(roleDefinitions.getMatch("id", "3")).thenReturn(Optional.of(printRole));
        ReflectionTestUtils.setField(permissions, "roleDefinitions", roleDefinitions);
        var users = mock(SystemUserService.class);
        var localUsers = mock(LoginUserService.class);
        var operator = new SystemUser(); operator.setId("7"); operator.setLoginName("SIM-printer"); operator.setIsActive("Y");
        when(users.getMatch("loginName", "SIM-printer")).thenReturn(Optional.of(operator));
        var local = new LoginUser(); local.setLoginName("SIM-printer"); local.setSystemUserId(7);
        local.setAccountLocked("N"); local.setAccountDisabled("N"); local.setPasswordExpiredDayNo(90);
        when(localUsers.getMatch("loginName", "SIM-printer")).thenReturn(Optional.of(local));
        ReflectionTestUtils.setField(permissions, "systemUsers", users);
        ReflectionTestUtils.setField(permissions, "loginUsers", localUsers);
        var principal = User.withUsername("SIM-printer").password("unused").authorities("ROLE_PRINT_ONLY").build();
        var auth = new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
        SecurityContextHolder.getContext().setAuthentication(auth);
        session = new MockHttpSession();
        var legacy = new UserSessionData(); legacy.setSytemUserId(7); legacy.setLoginName("SIM-printer");
        session.setAttribute(IActionConstants.USER_SESSION_DATA, legacy);
        session.setAttribute("SPRING_SECURITY_CONTEXT", SecurityContextHolder.getContext());

        var referenceTables = mock(ReferenceTablesService.class);
        var auditConfiguration = new ReferenceTables(); auditConfiguration.setKeepHistory("Y");
        when(referenceTables.getReferenceTableByName("BARCODE_LABEL_INFO")).thenReturn(auditConfiguration);
        var sample = new Sample(); sample.setId("12"); sample.setAccessionNumber("SIM-LABEL-12");
        ReflectionTestUtils.setField(sample, "receivedTimestamp", new Timestamp(1000));
        var patient = new Patient(); patient.setId("9"); var person = new Person(); person.setId("8"); patient.setPerson(person);
        when(dao.lockOrder("12")).thenReturn(sample);
        when(dao.lockSampleItems("12")).thenReturn(List.of());
        when(dao.findClinicalPatients("12")).thenReturn(List.of(patient));
        when(dao.findCounters("SIM-LABEL-12")).thenReturn(List.of());
        var label = mock(Label.class); when(label.getCode()).thenReturn("SIM-LABEL-12"); when(label.getMaxNumLabels()).thenReturn(10);
        when(renderer.maximumRequestQuantity()).thenReturn(100);
        when(renderer.createOrderLabel(patient, sample)).thenReturn(label);
        when(renderer.render(anyList())).thenAnswer(call -> { afterRender.run(); return "%PDF-SIM".getBytes(java.nio.charset.StandardCharsets.UTF_8); });
        doAnswer(call -> { persisted.add("counter:7"); return null; }).when(counts).save(any());
        doAnswer(call -> { persisted.add("audit:7"); return null; }).when(audit).saveNewHistory(any(), eq("7"), eq("BARCODE_LABEL_INFO"));
        doAnswer(call -> { afterFlush.run(); return null; }).when(dao).flush();
        target = new BarcodeLabelGenerationServiceImpl(dao, renderer, counts, audit, referenceTables);
        ReflectionTestUtils.setField(target, "permissions", permissions);
        transactions = new MemoryTransactions(); transactions.setRollbackOnCommitFailure(true);
        var proxy = new ProxyFactory(target);
        proxy.addAdvice(new TransactionInterceptor(transactions, new AnnotationTransactionAttributeSource()));
        service = (BarcodeLabelGenerationService) proxy.getProxy();
        mvc = MockMvcBuilders.standaloneSetup(new BarcodeLabelGenerationRestController(permissions, service))
                .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper())).build();
    }

    @After public void cleanup() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", oldFactory);
        SecurityContextHolder.clearContext(); RequestContextHolder.resetRequestAttributes();
    }

    private MvcResult post() throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/rest/barcode/labels/generate").session(session).contentType(MediaType.APPLICATION_JSON).content(BODY)).andReturn();
    }
    private void rejects(int status) throws Exception {
        var response = post().getResponse();
        assertEquals(status, response.getStatus());
        assertFalse(new ObjectMapper().readTree(response.getContentAsByteArray()).has("pdfBase64"));
        assertTrue(persisted.isEmpty());
    }
    @Test public void actualRouteCommitsForPrintOnlyRole() throws Exception {
        var response = post().getResponse(); assertEquals(200, response.getStatus());
        assertEquals(1, new ObjectMapper().readTree(response.getContentAsByteArray()).get("totalGenerated").asInt());
        assertEquals(List.of("counter:7", "audit:7"), persisted); assertEquals(1, transactions.commits);
    }
    @Test public void legacyIdentityAloneNeverReadsOrder() throws Exception {
        SecurityContextHolder.clearContext(); rejects(401); verify(dao, never()).lockOrder(anyString());
    }
    @Test public void differentLegacyUserNeverReadsOrder() throws Exception {
        ((UserSessionData) session.getAttribute(IActionConstants.USER_SESSION_DATA)).setSytemUserId(8);
        rejects(401); verify(dao, never()).lockOrder(anyString());
    }
    @Test public void revokedDuringRenderingNeverPersistsCounts() throws Exception {
        afterRender = () -> allowed = false; rejects(403); assertEquals(1, transactions.rollbacks);
    }
    @Test public void revokedAfterCountAndAuditRollsBackBoth() throws Exception {
        afterFlush = () -> allowed = false; rejects(403); verify(counts).save(any()); verify(audit).saveNewHistory(any(), eq("7"), anyString());
        assertEquals(1, transactions.rollbacks);
    }
    @Test public void sessionInvalidatedDuringRenderingRollsBack() throws Exception {
        afterRender = () -> session.invalidate(); rejects(401); assertEquals(1, transactions.rollbacks);
    }
    @Test public void auditFailureRollsBackCountAndNeverReturnsPdf() throws Exception {
        doThrow(new IllegalStateException("SIM-audit-failure")).when(audit).saveNewHistory(any(), anyString(), anyString());
        rejects(500); verify(counts).save(any()); assertEquals(1, transactions.rollbacks);
    }
    @Test public void commitFailureNeverReturnsPdf() throws Exception {
        transactions.failCommit = true; rejects(500); assertEquals(1, transactions.rollbacks);
    }
    @Test public void lateOuterRevocationRollsBackGeneration() throws Exception {
        var http = new MockHttpServletRequest(); http.setSession(session);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(http));
        try {
            new TransactionTemplate(transactions).execute(status -> {
                try { service.generate(BarcodeLabelGenerateRequest.fromJson(new ObjectMapper().readTree(BODY)), permissions.requirePrintPermission(http)); }
                catch (java.io.IOException error) { throw new IllegalStateException(error); }
                assertFalse(persisted.isEmpty()); allowed = false; return null;
            });
            fail("Expected late permission denial");
        } catch (org.openelisglobal.barcode.exception.BarcodeLabelGenerationException expected) {
            assertEquals(403, expected.getStatus());
        }
        assertTrue(persisted.isEmpty()); assertEquals(1, transactions.rollbacks);
    }
    @Test public void nonProxiedGenerationFailsBeforeReadingOrder() throws Exception {
        var http = new MockHttpServletRequest(); http.setSession(session);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(http));
        try { target.generate(BarcodeLabelGenerateRequest.fromJson(new ObjectMapper().readTree(BODY)), permissions.requirePrintPermission(http)); fail("No transaction"); }
        catch (org.openelisglobal.barcode.exception.BarcodeLabelGenerationException expected) { assertEquals(401, expected.getStatus()); }
        verify(dao, never()).lockOrder(anyString());
    }

    @Test public void sameAccountDifferentSessionBetweenControllerAndTransactionIsRejected() throws Exception {
        doAnswer(call -> {
            var bound = call.callRealMethod();
            var other = new MockHttpServletRequest();
            other.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, session.getAttribute(IActionConstants.USER_SESSION_DATA));
            other.getSession().setAttribute("SPRING_SECURITY_CONTEXT", session.getAttribute("SPRING_SECURITY_CONTEXT"));
            RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(other));
            return bound;
        }).when(permissions).requirePrintPermission(any());
        rejects(401); verify(dao, never()).lockOrder(anyString());
    }

    @Test public void sameSessionRequestWrapperDoesNotLosePrintPermission() throws Exception {
        doAnswer(call -> {
            var bound = call.callRealMethod();
            var wrapper = new jakarta.servlet.http.HttpServletRequestWrapper(call.getArgument(0));
            RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(wrapper));
            return bound;
        }).when(permissions).requirePrintPermission(any());
        assertEquals(200, post().getResponse().getStatus()); assertEquals(1, transactions.commits);
    }

    @Test public void authenticationReplacementBeforeTransactionNeverReadsOrder() throws Exception {
        doAnswer(call -> {
            var bound = call.callRealMethod();
            var current = SecurityContextHolder.getContext().getAuthentication();
            SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(current.getPrincipal(), null, current.getAuthorities()));
            return bound;
        }).when(permissions).requirePrintPermission(any());
        rejects(401); verify(dao, never()).lockOrder(anyString());
    }

    @Test public void labUnitChangesAfterWritingRollsBack() throws Exception {
        afterFlush = () -> ((UserSessionData) session.getAttribute(IActionConstants.USER_SESSION_DATA)).setLoginLabUnit(99);
        rejects(401); assertEquals(1, transactions.rollbacks); verify(counts).save(any());
    }

    @Test public void inactiveRoleNeverReadsOrder() throws Exception {
        printRole.setActive(false); rejects(403); verify(dao, never()).lockOrder(anyString());
    }

    @Test public void localRoleDisabledAfterAuditRollsBackBothWrites() throws Exception {
        afterFlush = () -> printRole.setActive(false);
        rejects(403); verify(counts).save(any()); verify(audit).saveNewHistory(any(), eq("7"), anyString());
        assertEquals(1, transactions.rollbacks);
    }

    private class MemoryTransactions extends AbstractPlatformTransactionManager {
        private Tx active; int commits, rollbacks; boolean failCommit;
        private class Tx { boolean running; List<String> before; }
        @Override protected Object doGetTransaction() { return active == null ? new Tx() : active; }
        @Override protected boolean isExistingTransaction(Object tx) { return ((Tx) tx).running; }
        @Override protected void doBegin(Object value, TransactionDefinition definition) {
            active = (Tx) value; active.running = true; active.before = new ArrayList<>(persisted);
        }
        @Override protected void doCommit(DefaultTransactionStatus status) {
            if (failCommit) throw new IllegalStateException("SIM-commit-failure"); commits++;
        }
        @Override protected void doRollback(DefaultTransactionStatus status) {
            persisted.clear(); persisted.addAll(((Tx) status.getTransaction()).before); rollbacks++;
        }
        @Override protected void doCleanupAfterCompletion(Object tx) { ((Tx) tx).running = false; active = null; }
    }
}
