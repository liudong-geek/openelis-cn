package org.openelisglobal.sample.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.util.*;
import org.junit.*;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.login.service.LoginUserService;
import org.openelisglobal.login.valueholder.LoginUser;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.referencetables.service.ReferenceTablesService;
import org.openelisglobal.referencetables.valueholder.ReferenceTables;
import org.openelisglobal.sample.controller.rest.SpecimenReceiptRestController;
import org.openelisglobal.sample.dao.SpecimenReceiptDAO;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.service.SampleItemService;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Real MVC/actor/Spring transaction; explicitly SIM in-memory resources, not
 * database evidence.
 */
public class SpecimenReceiptServiceTest {
    private static final String COLLECTED = "2026-09-01T01:00:00.123456Z", RECEIVED = "2026-09-01T02:00:00.123Z";
    private final ObjectMapper json = new ObjectMapper();
    private final SpecimenReceiptDAO dao = mock(SpecimenReceiptDAO.class);
    private final SampleItemService items = mock(SampleItemService.class);
    private final UserService permissions = mock(UserService.class);
    private final ReferenceTablesService references = mock(ReferenceTablesService.class);
    private final DefaultConfigurationProperties configuration = mock(DefaultConfigurationProperties.class);
    private final List<SampleItem> originals = new ArrayList<>();
    private final List<SampleTypeRequest> requests = new ArrayList<>();
    private final List<Analysis> analyses = new ArrayList<>();
    private final Map<String, SampleItem> persisted = new LinkedHashMap<>();
    private final List<String> audits = new ArrayList<>();
    private final ReferenceTables table = new ReferenceTables();
    private final MemoryTransactions transactions = new MemoryTransactions();
    private Sample sample;
    private SystemUser operator;
    private MockHttpSession session;
    private MockMvc mvc;
    private SpecimenReceiptService service, target;
    private boolean allowed = true;
    private Runnable afterUpdate = () -> {
    }, afterFlush = () -> {
    };

    @Before
    public void setup() {
        var actor = new OrderEntryActorGuard();
        var accounts = mock(SystemUserService.class);
        var logins = mock(LoginUserService.class);
        var roles = mock(UserRoleService.class);
        ReflectionTestUtils.setField(actor, "systemUserService", accounts);
        ReflectionTestUtils.setField(actor, "loginUserService", logins);
        ReflectionTestUtils.setField(actor, "userRoleService", roles);
        operator = new SystemUser();
        operator.setId("7");
        operator.setLoginName("SIM-receiver");
        operator.setIsActive("Y");
        var local = new LoginUser();
        local.setSystemUserId(7);
        local.setLoginName("SIM-receiver");
        local.setAccountLocked("N");
        local.setAccountDisabled("N");
        local.setPasswordExpiredDayNo(90);
        when(accounts.getMatch("loginName", "SIM-receiver")).thenReturn(Optional.of(operator));
        when(logins.getMatch("loginName", "SIM-receiver")).thenReturn(Optional.of(local));
        when(roles.userInRole("7", Constants.ROLE_RECEPTION)).thenReturn(true);
        var principal = User.withUsername("SIM-receiver").password("unused").authorities("ROLE_RECEPTION").build();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
        session = new MockHttpSession();
        var legacy = new UserSessionData();
        legacy.setSytemUserId(7);
        legacy.setLoginName("SIM-receiver");
        session.setAttribute(IActionConstants.USER_SESSION_DATA, legacy);
        session.setAttribute("SPRING_SECURITY_CONTEXT", SecurityContextHolder.getContext());
        sample = new Sample();
        sample.setId("701");
        sample.setAccessionNumber("SIM-RECEIPT-701");
        sample.setDomain("H");
        sample.setStatusId("1");
        ReflectionTestUtils.setField(sample, "receivedTimestamp",
                Timestamp.from(java.time.Instant.parse("2026-09-01T00:00:00Z")));
        when(configuration.getPropertyValue("domain.human")).thenReturn("H");
        when(dao.lockOrder("701")).thenReturn(sample);
        when(dao.clinicalPatientIds("701")).thenReturn(List.of("801"));
        when(dao.statusName("1", "ORDER")).thenReturn("Test Entered");
        when(dao.statusName("2", "SAMPLE")).thenReturn("SampleEntered");
        when(dao.statusName("3", "ANALYSIS")).thenReturn("Not Tested");
        var type = new TypeOfSample();
        type.setId("11");
        type.setIsActive(true);
        var test = new org.openelisglobal.test.valueholder.Test();
        test.setId("31");
        test.setIsActive("Y");
        when(permissions.getAllDisplayUserTestsByLabUnit("7", Constants.ROLE_RECEPTION))
                .thenAnswer(call -> allowed ? List.of(new org.openelisglobal.common.util.IdValuePair("31", "SIM-test"))
                        : List.of());
        for (int index = 0; index < 2; index++) {
            var item = new SampleItem();
            item.setId("100" + (index + 1));
            item.setSample(sample);
            item.setTypeOfSample(type);
            item.setStatusId("2");
            item.setSortOrder(String.valueOf(index + 1));
            item.setCollector("SIM-collector");
            item.setCollectionDate(Timestamp.from(java.time.Instant.parse(COLLECTED)));
            item.setQuantity(0.5);
            item.setLastupdated(Timestamp.from(java.time.Instant.parse("2026-09-01T01:01:00.123456Z")));
            originals.add(item);
            var planned = new SampleTypeRequest();
            planned.setId(901 + index);
            planned.setSample(sample);
            planned.setSampleItem(item);
            planned.setTypeOfSample(type);
            planned.setStatus(SampleTypeRequest.Status.COLLECTED);
            planned.setRequestedTests("31");
            requests.add(planned);
            var analysis = new Analysis();
            analysis.setId("110" + (index + 1));
            analysis.setSampleItem(item);
            analysis.setTest(test);
            analysis.setStatusId("3");
            analyses.add(analysis);
        }
        when(dao.lockRequests("701")).thenReturn(requests);
        when(dao.lockItems("701")).thenReturn(originals);
        when(dao.lockAnalyses("701")).thenReturn(analyses);
        table.setKeepHistory("Y");
        when(references.getReferenceTableByName("SAMPLE_ITEM")).thenReturn(table);
        when(items.update(any())).thenAnswer(call -> {
            SampleItem changed = call.getArgument(0);
            SampleItem original = originals.stream().filter(row -> row.getId().equals(changed.getId())).findFirst()
                    .orElseThrow();
            assertNotSame(original, changed);
            assertNull(original.getReceivedDate());
            assertEquals(original.getLastupdated(), changed.getLastupdated());
            assertEquals(original.getCollectionDate(), changed.getCollectionDate());
            assertEquals(original.getCollector(), changed.getCollector());
            assertEquals(original.getQuantity(), changed.getQuantity());
            assertEquals(original.getSortOrder(), changed.getSortOrder());
            assertSame(original.getSample(), changed.getSample());
            assertSame(original.getTypeOfSample(), changed.getTypeOfSample());
            assertEquals("7", changed.getSysUserId());
            persisted.put(changed.getId(), changed);
            audits.add(changed.getId() + ":7");
            afterUpdate.run();
            return changed;
        });
        doAnswer(call -> {
            afterFlush.run();
            return null;
        }).when(dao).flush();
        target = new SpecimenReceiptService(dao, actor, items, permissions, references, configuration);
        var proxy = new ProxyFactory(target);
        proxy.setProxyTargetClass(true);
        transactions.setRollbackOnCommitFailure(true);
        proxy.addAdvice(new TransactionInterceptor(transactions, new AnnotationTransactionAttributeSource()));
        service = (SpecimenReceiptService) proxy.getProxy();
        mvc = MockMvcBuilders.standaloneSetup(new SpecimenReceiptRestController(service))
                .setMessageConverters(new MappingJackson2HttpMessageConverter(json)).build();
    }

    @After
    public void cleanup() {
        SecurityContextHolder.clearContext();
        RequestContextHolder.resetRequestAttributes();
    }

    private ObjectNode body(int count) {
        var body = json.createObjectNode().put("sampleId", "701").put("labNo", "SIM-RECEIPT-701").put("patientId",
                "801");
        var tubes = body.putArray("tubes");
        for (int index = 0; index < count; index++) {
            tubes.addObject().put("requestId", "" + (901 + index)).put("sampleItemId", "100" + (index + 1))
                    .put("collectionDate", COLLECTED).put("receivedDate", RECEIVED);
        }
        return body;
    }

    private org.springframework.mock.web.MockHttpServletResponse post(String body) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .post("/rest/specimen-receipts").session(session).contentType(MediaType.APPLICATION_JSON).content(body))
                .andReturn().getResponse();
    }

    private void rejects(ObjectNode body, int status) throws Exception {
        var response = post(body.toString());
        assertEquals(response.getContentAsString(), status, response.getStatus());
        assertTrue(response.getHeader("Cache-Control").contains("no-store"));
        assertFalse(json.readTree(response.getContentAsByteArray()).get("success").asBoolean());
        assertTrue(persisted.isEmpty());
        assertTrue(audits.isEmpty());
    }

    @Test
    public void receivesOnlyExplicitTubeAndReturnsCanonicalIdentity() throws Exception {
        requests.get(1).setStatus(SampleTypeRequest.Status.REQUESTED);
        requests.get(1).setSampleItem(null);
        var response = post(body(1).toString());
        assertEquals(200, response.getStatus());
        var output = json.readTree(response.getContentAsByteArray());
        assertEquals("701", output.get("sampleId").asText());
        assertEquals("801", output.get("patientId").asText());
        assertEquals("901", output.at("/tubes/0/requestId").asText());
        assertEquals("1001", output.at("/tubes/0/sampleItemId").asText());
        assertEquals(RECEIVED, output.at("/tubes/0/receivedDate").asText());
        assertEquals(Set.of("1001"), persisted.keySet());
        assertEquals(List.of("1001:7"), audits);
        assertEquals(1, transactions.commits);
        assertNull(originals.get(1).getReceivedDate());
        assertEquals("1", sample.getStatusId());
        assertEquals("3", analyses.get(0).getStatusId());
    }

    @Test
    public void samePersistedReceiptIsZeroWriteReplay() throws Exception {
        originals.get(0).setReceivedDate(Timestamp.from(java.time.Instant.parse(RECEIVED)));
        var response = post(body(1).toString());
        assertEquals(200, response.getStatus());
        assertTrue(json.readTree(response.getContentAsByteArray()).at("/tubes/0/replayed").asBoolean());
        verify(items, never()).update(any());
    }

    @Test
    public void existingReceiptCannotBeOverwritten() throws Exception {
        originals.get(0).setReceivedDate(Timestamp.from(java.time.Instant.parse("2026-09-01T03:00:00Z")));
        rejects(body(1), 409);
    }

    @Test
    public void missingVersionIsNotSynthesizedForAuditUpdate() throws Exception {
        originals.get(0).setLastupdated(null);
        rejects(body(1), 409);
        verify(items, never()).update(any());
    }

    @Test
    public void secondTubeMissingVersionPreventsFirstWrite() throws Exception {
        originals.get(1).setLastupdated(null);
        rejects(body(2), 409);
        verify(items, never()).update(any());
    }

    @Test
    public void inactiveTypePreventsNewReceipt() throws Exception {
        originals.get(0).getTypeOfSample().setIsActive(false);
        rejects(body(1), 409);
    }

    @Test
    public void inactiveTestPreventsNewReceipt() throws Exception {
        analyses.get(0).getTest().setIsActive("N");
        rejects(body(1), 409);
    }

    @Test
    public void futureReceiptCannotWrite() throws Exception {
        var input = body(1);
        ((ObjectNode) input.at("/tubes/0")).put("receivedDate", "2099-09-01T02:00:00Z");
        rejects(input, 409);
    }

    @Test
    public void wrongLabCannotWrite() throws Exception {
        rejects(body(1).put("labNo", "SIM-OTHER"), 409);
    }

    @Test
    public void wrongPatientCannotWrite() throws Exception {
        rejects(body(1).put("patientId", "999"), 409);
    }

    @Test public void ambiguousPatientCannotWrite() throws Exception { when(dao.clinicalPatientIds("701")).thenReturn(List.of("801", "802")); rejects(body(1), 409); }

    @Test
    public void environmentalOrderCannotWrite() throws Exception {
        sample.setDomain("E");
        rejects(body(1), 409);
    }

    @Test public void finishedOrderCannotWrite() throws Exception { when(dao.statusName("1", "ORDER")).thenReturn("Testing finished"); rejects(body(1), 409); }

    @Test
    public void unregisteredOrderCannotWrite() throws Exception {
        ReflectionTestUtils.setField(sample, "receivedTimestamp", null);
        rejects(body(1), 409);
    }

    @Test
    public void crossedRequestItemCannotWrite() throws Exception {
        var input = body(1);
        ((ObjectNode) input.at("/tubes/0")).put("requestId", "902");
        rejects(input, 409);
    }

    @Test
    public void canceledRequestCannotWrite() throws Exception {
        requests.get(0).setStatus(SampleTypeRequest.Status.CANCELLED);
        rejects(body(1), 409);
    }

    @Test
    public void noPhysicalCollectionCannotWrite() throws Exception {
        originals.get(0).setCollectionDate(null);
        rejects(body(1), 409);
    }

    @Test
    public void staleCollectionCannotWrite() throws Exception {
        originals.get(0).setCollectionDate(Timestamp.from(java.time.Instant.parse("2026-09-01T01:01:00Z")));
        rejects(body(1), 409);
    }

    @Test
    public void voidedTubeCannotWrite() throws Exception {
        originals.get(0).setVoided(true);
        rejects(body(1), 409);
    }

    @Test
    public void rejectedTubeCannotWrite() throws Exception {
        originals.get(0).setRejected(true);
        rejects(body(1), 409);
    }

    @Test
    public void aliquotCannotBeGuessedAsOriginal() throws Exception {
        originals.get(0).setParentSampleItem(originals.get(1));
        rejects(body(1), 409);
    }

    @Test public void unrecognizedStateCannotWrite() throws Exception { when(dao.statusName("2", "SAMPLE")).thenReturn(null); rejects(body(1), 409); }

    @Test
    public void missingActualAnalysisCannotWrite() throws Exception {
        analyses.clear();
        rejects(body(1), 409);
    }

    @Test public void testedTubeRequiresSeparateCorrection() throws Exception { when(dao.statusName("3", "ANALYSIS")).thenReturn("Finalized"); rejects(body(1), 409); }

    @Test
    public void missingPlannedAnalysisCannotWrite() throws Exception {
        requests.get(0).setRequestedTests("31,32");
        rejects(body(1), 409);
    }

    @Test
    public void wrongSampleOnPhysicalTubeCannotWrite() throws Exception {
        originals.get(0).setSample(new Sample());
        rejects(body(1), 409);
    }

    @Test
    public void noCurrentPermissionCannotWrite() throws Exception {
        allowed = false;
        rejects(body(1), 403);
        verify(items, never()).update(any());
    }

    @Test
    public void missingAuditConfigurationCannotWrite() throws Exception {
        table.setKeepHistory("N");
        rejects(body(1), 409);
        verify(items, never()).update(any());
    }

    @Test
    public void allTubeValidationPrecedesFirstWrite() throws Exception {
        originals.get(1).setRejected(true);
        rejects(body(2), 409);
        verify(items, never()).update(any());
    }

    @Test
    public void secondUpdateFailureRollsBackFirstAndAudit() throws Exception {
        afterUpdate = () -> {
            if (persisted.size() == 2) {
                throw new IllegalStateException("SIM-second-write");
            }
        };
        rejects(body(2), 500);
        verify(items, times(2)).update(any());
        assertEquals(1, transactions.rollbacks);
    }

    @Test
    public void auditFailureRollsBackReceipt() throws Exception {
        afterUpdate = () -> {
            throw new IllegalStateException("SIM-audit-failure");
        };
        rejects(body(1), 500);
        assertEquals(1, transactions.rollbacks);
    }

    @Test
    public void lateRevocationRollsBackReceipt() throws Exception {
        afterFlush = () -> allowed = false;
        rejects(body(1), 403);
        verify(items).update(any());
    }

    @Test
    public void accountDisabledAfterWriteRollsBack() throws Exception {
        afterUpdate = () -> operator.setIsActive("N");
        rejects(body(1), 403);
    }

    @Test
    public void commitFailureNeverReturnsSuccess() throws Exception {
        transactions.failCommit = true;
        rejects(body(1), 500);
        assertEquals(1, transactions.rollbacks);
    }

    @Test
    public void outerTransactionRevocationRollsBack() throws Exception {
        var http = new MockHttpServletRequest();
        http.setSession(session);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(http));
        try {
            new TransactionTemplate(transactions).execute(status -> {
                service.receive(body(1), http);
                allowed = false;
                return null;
            });
            fail("revocation");
        } catch (org.springframework.security.access.AccessDeniedException expected) {
            assertTrue(persisted.isEmpty());
            assertTrue(audits.isEmpty());
        }
    }

    @Test
    public void inactiveSessionNeverReadsOrder() throws Exception {
        session.invalidate();
        rejects(body(1), 403);
        verify(dao, never()).lockOrder(anyString());
    }

    @Test
    public void anonymousNeverReadsOrder() throws Exception {
        SecurityContextHolder.clearContext();
        rejects(body(1), 403);
        verify(dao, never()).lockOrder(anyString());
    }

    @Test
    public void dirtyContextStopsBeforeIdentityQueriesOrOrderLock() throws Exception {
        doThrow(new IllegalStateException("SIM-dirty-context")).when(dao).requireCleanContext();
        rejects(body(1), 500);
        verify(dao, never()).lockOrder(anyString());
        verify(items, never()).update(any());
    }

    @Test
    public void nonProxiedWriteIsRefused() {
        try {
            target.receive(body(1), new MockHttpServletRequest());
            fail("transaction required");
        } catch (org.openelisglobal.sample.exception.EntrySubmissionException expected) {
            verifyZeroInteractions(dao);
        }
    }

    @Test
    public void jsonFailuresCannotLeakBody() throws Exception {
        var response = post("{SIM-patient-secret");
        assertEquals(400, response.getStatus());
        assertFalse(response.getContentAsString().contains("SIM-patient-secret"));
    }

    @Test
    public void duplicateTopLevelIdentityIsRejectedBeforeAnyWrite() throws Exception {
        assertEquals(400,
                post(body(1).toString().replace("\"sampleId\":\"701\"", "\"sampleId\":\"999\",\"sampleId\":\"701\""))
                        .getStatus());
        verifyZeroInteractions(dao, items);
    }

    @Test
    public void duplicateReceiptTimeIsRejectedBeforeAnyWrite() throws Exception {
        assertEquals(400, post(body(1).toString().replace("\"receivedDate\":",
                "\"receivedDate\":\"2099-01-01T00:00:00Z\",\"receivedDate\":")).getStatus());
        verifyZeroInteractions(dao, items);
    }

    @Test
    public void trailingDocumentIsRejectedBeforeAnyWrite() throws Exception {
        assertEquals(400, post(body(1).toString() + "{}").getStatus());
        verifyZeroInteractions(dao, items);
    }

    @Test
    public void bodyLimitIsEnforcedBeforeParsing() throws Exception {
        assertEquals(413, post(" ".repeat(65537)).getStatus());
        verifyZeroInteractions(dao, items);
    }

    private class MemoryTransactions extends AbstractPlatformTransactionManager {
        private boolean active, failCommit;
        private int commits, rollbacks;

        @Override
        protected Object doGetTransaction() {
            return this;
        }

        @Override
        protected boolean isExistingTransaction(Object value) {
            return active;
        }

        @Override
        protected void doBegin(Object value, TransactionDefinition definition) {
            active = true;
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
            if (failCommit) {
                throw new IllegalStateException("SIM-commit-failure");
            }
            commits++;
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            persisted.clear();
            audits.clear();
            rollbacks++;
        }

        @Override
        protected void doCleanupAfterCompletion(Object value) {
            active = false;
        }
    }
}
