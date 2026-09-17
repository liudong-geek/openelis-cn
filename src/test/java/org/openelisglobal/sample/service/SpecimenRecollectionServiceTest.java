package org.openelisglobal.sample.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.*;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.audittrail.dao.AuditTrailService;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.login.service.LoginUserService;
import org.openelisglobal.login.valueholder.LoginUser;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.referencetables.valueholder.ReferenceTables;
import org.openelisglobal.sample.controller.rest.SpecimenRecollectionRestController;
import org.openelisglobal.sample.dao.SpecimenReceiptDAO;
import org.openelisglobal.sample.dao.SpecimenRecollectionDAO;
import org.openelisglobal.sample.form.SpecimenIntakeEvidence;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision;
import org.openelisglobal.sample.valueholder.SpecimenRecollection;
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
import org.springframework.web.context.request.RequestContextHolder;

public class SpecimenRecollectionServiceTest {
    private static final Instant NOW = Instant.parse("2026-09-17T01:00:00Z");
    private final ObjectMapper json = new ObjectMapper();
    private final SpecimenReceiptDAO graph = mock(SpecimenReceiptDAO.class);
    private final SpecimenRecollectionDAO dao = mock(SpecimenRecollectionDAO.class);
    private final UserService permissions = mock(UserService.class);
    private final AuditTrailService audit = mock(AuditTrailService.class);
    private final DefaultConfigurationProperties configuration = mock(DefaultConfigurationProperties.class);
    private final List<SampleTypeRequest> requests = new ArrayList<>();
    private final List<SpecimenRecollection> records = new ArrayList<>();
    private final List<String> audits = new ArrayList<>();
    private final Set<Object> managed = Collections.newSetFromMap(new IdentityHashMap<>());
    private final MemoryTransactions transactions = new MemoryTransactions();
    private final Sample sample = new Sample();
    private final SampleItem item = new SampleItem();
    private final SampleTypeRequest source = new SampleTypeRequest();
    private final TypeOfSample type = new TypeOfSample();
    private final org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
    private final Analysis analysis = new Analysis();
    private final List<ReferenceTables> references = new ArrayList<>();
    private SpecimenIntakeDecision decision;
    private MockHttpSession session;
    private MockMvc mvc;
    private SpecimenRecollectionService service;
    private boolean allowed = true;
    private boolean failAudit;

    @Before
    public void setup() {
        OrderEntryActorGuard actors = actorGuard();
        sample.setId("701");
        sample.setAccessionNumber("SIM-701");
        sample.setDomain("H");
        sample.setLastupdated(ts("2026-09-17T00:00:00Z"));
        ReflectionTestUtils.setField(sample, "receivedTimestamp", ts("2026-09-17T00:10:00Z"));
        type.setId("11");
        type.setLastupdated(ts("2026-09-17T00:00:00Z"));
        test.setId("31");
        test.setLastupdated(ts("2026-09-17T00:00:00Z"));
        item.setId("1001");
        item.setSample(sample);
        item.setTypeOfSample(type);
        item.setSortOrder("1");
        item.setRejected(true);
        item.setRejectReasonId("51");
        item.setCollectionDate(ts("2026-09-17T00:20:00Z"));
        item.setReceivedDate(ts("2026-09-17T00:30:00Z"));
        item.setLastupdated(ts("2026-09-17T00:45:00Z"));
        source.setId(901);
        source.setSample(sample);
        source.setTypeOfSample(type);
        source.setSortOrder(1);
        source.setRequestedQuantity(1.0);
        source.setRequestedTests("31");
        source.setRequestedPanels("");
        source.setStatus(SampleTypeRequest.Status.COLLECTED);
        source.setSampleItem(item);
        source.setCreatedDate(ts("2026-09-17T00:00:00Z"));
        source.setLastupdated(ts("2026-09-17T00:40:00Z"));
        requests.add(source);
        analysis.setId("1101");
        analysis.setSampleItem(item);
        analysis.setTest(test);
        analysis.setLastupdated(ts("2026-09-17T00:40:00Z"));
        var evidence = new SpecimenIntakeEvidence(1, sample.getLastupdated().toInstant().toString(),
                source.getLastupdated().toInstant().toString(), "2026-09-17T00:40:00Z", "11",
                item.getCollectionDate().toInstant().toString(), item.getReceivedDate().toInstant().toString(),
                List.of(new SpecimenIntakeEvidence.Analysis("1101", "31", "2026-09-17T00:40:00Z")));
        var reason = new SpecimenIntakeDecision.Reason("DICTIONARY:resultRejectionReasons", "51",
                "2026-09-17T00:35:00Z", "标本凝固");
        decision = SpecimenIntakeDecision.record("11111111-2222-4333-8444-555555555555", "701", "SIM-701", "801", "901",
                "1001", SpecimenIntakeDecision.Decision.REJECTED, reason, evidence, "7",
                Clock.fixed(Instant.parse("2026-09-17T00:45:00Z"), ZoneOffset.UTC));
        decision.setId("2001");
        decision.setLastupdated(ts("2026-09-17T00:45:00Z"));
        for (String name : List.of("sample_type_request", "specimen_recollection")) {
            var row = new ReferenceTables();
            row.setId(String.valueOf(61 + references.size()));
            row.setTableName(name);
            row.setKeepHistory("Y");
            row.setIsHl7Encoded("N");
            row.setLastupdated(ts("2026-09-17T00:00:00Z"));
            references.add(row);
        }
        managed.addAll(List.of(sample, item, source, analysis, decision));
        managed.addAll(references);
        when(configuration.getPropertyValue("domain.human")).thenReturn("H");
        when(graph.lockOrder("701")).thenReturn(sample);
        when(graph.lockRequests("701")).thenAnswer(value -> new ArrayList<>(requests));
        when(graph.lockItems("701")).thenReturn(List.of(item));
        when(graph.lockAnalyses("701")).thenReturn(List.of(analysis));
        when(graph.clinicalPatientIds("701")).thenReturn(List.of("801"));
        when(dao.lockDecision(decision.getOperationId())).thenReturn(decision);
        when(dao.lockAuditReferences()).thenReturn(references);
        when(dao.auditReferences()).thenReturn(references);
        when(permissions.getAllDisplayUserTestsByLabUnit("7", Constants.ROLE_RECEPTION))
                .thenAnswer(value -> allowed ? List.of(new IdValuePair("31", "SIM test")) : List.of());
        when(dao.lockClaims(anyString(), anyString()))
                .thenAnswer(value -> records.stream().filter(row -> row.getOperationId().equals(value.getArgument(0))
                        || row.getSourceSampleItemId().equals(value.getArgument(1))).toList());
        when(dao.findOperation(anyString())).thenAnswer(value -> records.stream()
                .filter(row -> row.getOperationId().equals(value.getArgument(0))).findFirst().orElse(null));
        when(dao.findForSources(anyList())).thenAnswer(value -> records.stream()
                .filter(row -> ((List<?>) value.getArgument(0)).contains(row.getSourceSampleItemId())).toList());
        when(dao.insertRequest(any())).thenAnswer(value -> {
            var row = (SampleTypeRequest) value.getArgument(0);
            row.setId(902 + records.size());
            requests.add(row);
            managed.add(row);
            return row;
        });
        when(dao.insert(any())).thenAnswer(value -> {
            var row = (SpecimenRecollection) value.getArgument(0);
            row.setId(String.valueOf(3001 + records.size()));
            records.add(row);
            managed.add(row);
            return row;
        });
        doAnswer(value -> {
            for (Object row : (List<?>) value.getArgument(0))
                if (!managed.contains(row))
                    fail("detached SIM row");
            return null;
        }).when(dao).requireManaged(anyList());
        doAnswer(value -> {
            if (failAudit)
                throw new IllegalStateException("SIM audit failure");
            audits.add(value.getArgument(2) + ":" + value.getArgument(1));
            return null;
        }).when(audit).saveNewHistory(any(), anyString(), anyString());

        var target = new SpecimenRecollectionService(graph, dao, actors, permissions, audit, configuration,
                Clock.fixed(NOW, ZoneOffset.UTC));
        var proxy = new ProxyFactory(target);
        proxy.setProxyTargetClass(true);
        proxy.addAdvice(new TransactionInterceptor(transactions, new AnnotationTransactionAttributeSource()));
        service = (SpecimenRecollectionService) proxy.getProxy();
        mvc = MockMvcBuilders.standaloneSetup(new SpecimenRecollectionRestController(service))
                .setMessageConverters(new MappingJackson2HttpMessageConverter(json)).build();
    }

    @After
    public void cleanup() {
        SecurityContextHolder.clearContext();
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    public void createsOneUncollectedRequestWithoutChangingRejectedTube() throws Exception {
        JsonNode result = send(command(), 200);
        assertFalse(result.path("replayed").asBoolean());
        assertEquals("902", result.path("request").path("id").asText());
        assertEquals("REQUESTED", result.path("request").path("status").asText());
        assertTrue(result.path("request").path("sampleItemId").isNull());
        assertEquals(2, requests.size());
        assertSame(source, requests.get(0));
        assertSame(item, source.getSampleItem());
        assertTrue(item.isRejected());
        assertEquals(List.of("sample_type_request:7", "specimen_recollection:7"), audits);
    }

    @Test
    public void exactRetryReturnsFrozenReceiptWithoutAnotherRequestOrAudit() throws Exception {
        ObjectNode input = command();
        JsonNode first = send(input, 200);
        JsonNode replay = send(input, 200);
        assertTrue(replay.path("replayed").asBoolean());
        assertEquals(first.path("request"), replay.path("request"));
        assertEquals(2, requests.size());
        assertEquals(1, records.size());
        assertEquals(2, audits.size());
    }

    @Test
    public void anotherOperationCannotCreateASecondReplacementForTheSameTube() throws Exception {
        send(command(), 200);
        send(command().put("operationId", "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"), 409);
        assertEquals(2, requests.size());
        assertEquals(1, records.size());
    }

    @Test
    public void staleEvidenceAndNonRejectedDecisionAreBlockedBeforeWrite() throws Exception {
        send(command().put("expectedEvidenceDigest", "b".repeat(64)), 409);
        decision = SpecimenIntakeDecision.record(decision.getOperationId(), "701", "SIM-701", "801", "901", "1001",
                SpecimenIntakeDecision.Decision.ACCEPTED, null, decision.evidence(), "7",
                Clock.fixed(Instant.parse("2026-09-17T00:45:00Z"), ZoneOffset.UTC));
        decision.setId("2001");
        when(dao.lockDecision(anyString())).thenReturn(decision);
        send(command(), 409);
        assertEquals(1, requests.size());
        assertTrue(records.isEmpty());
    }

    @Test
    public void permissionAndAuditConfigurationFailClosed() throws Exception {
        allowed = false;
        send(command(), 403);
        allowed = true;
        references.remove(0);
        send(command(), 409);
        assertEquals(1, requests.size());
        assertTrue(records.isEmpty());
    }

    @Test
    public void auditFailureRollsBackBothNewRows() throws Exception {
        failAudit = true;
        send(command(), 500);
        assertEquals(1, requests.size());
        assertTrue(records.isEmpty());
        assertTrue(audits.isEmpty());
    }

    @Test
    public void sourceLookupReadsTheSameReceiptAndDoesNotCreate() throws Exception {
        send(command(), 200);
        var response = mvc.perform(get("/rest/specimen-recollections/current").session(session).param("sampleId", "701")
                .param("sourceSampleItemId", "1001")).andReturn().getResponse();
        assertEquals(response.getContentAsString(), 200, response.getStatus());
        assertTrue(json.readTree(response.getContentAsString()).path("replayed").asBoolean());
        assertEquals(2, requests.size());
    }

    @Test
    public void malformedAndOversizedBodiesAreRejectedWithoutWrite() throws Exception {
        var malformed = mvc.perform(post("/rest/specimen-recollections").session(session)
                .contentType(MediaType.APPLICATION_JSON).content("{bad")).andReturn().getResponse();
        assertEquals(400, malformed.getStatus());
        var oversized = mvc.perform(post("/rest/specimen-recollections").session(session)
                .contentType(MediaType.APPLICATION_JSON).content("x".repeat(65537))).andReturn().getResponse();
        assertEquals(413, oversized.getStatus());
        assertEquals(1, requests.size());
    }

    private ObjectNode command() {
        return json.createObjectNode().put("version", 1).put("operationId", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")
                .put("sampleId", "701").put("labNo", "SIM-701").put("patientId", "801").put("sourceRequestId", "901")
                .put("sourceSampleItemId", "1001").put("sourceDecisionOperationId", decision.getOperationId())
                .put("expectedEvidenceDigest", decision.getEvidenceDigest());
    }

    private JsonNode send(ObjectNode body, int status) throws Exception {
        var response = mvc.perform(post("/rest/specimen-recollections").session(session)
                .contentType(MediaType.APPLICATION_JSON).content(body.toString())).andReturn().getResponse();
        assertEquals(response.getContentAsString(), status, response.getStatus());
        assertEquals("no-store", response.getHeader("Cache-Control"));
        return json.readTree(response.getContentAsString());
    }

    private OrderEntryActorGuard actorGuard() {
        var actor = new OrderEntryActorGuard();
        var accounts = mock(SystemUserService.class);
        var logins = mock(LoginUserService.class);
        var roles = mock(UserRoleService.class);
        ReflectionTestUtils.setField(actor, "systemUserService", accounts);
        ReflectionTestUtils.setField(actor, "loginUserService", logins);
        ReflectionTestUtils.setField(actor, "userRoleService", roles);
        var operator = new SystemUser();
        operator.setId("7");
        operator.setLoginName("SIM-recollection");
        operator.setIsActive("Y");
        var login = new LoginUser();
        login.setSystemUserId(7);
        login.setLoginName("SIM-recollection");
        login.setAccountLocked("N");
        login.setAccountDisabled("N");
        login.setPasswordExpiredDayNo(90);
        when(accounts.getMatch("loginName", "SIM-recollection")).thenReturn(Optional.of(operator));
        when(logins.getMatch("loginName", "SIM-recollection")).thenReturn(Optional.of(login));
        when(roles.userInRole("7", Constants.ROLE_RECEPTION)).thenReturn(true);
        var principal = User.withUsername("SIM-recollection").password("unused").authorities("ROLE_RECEPTION").build();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
        session = new MockHttpSession();
        var legacy = new UserSessionData();
        legacy.setSytemUserId(7);
        legacy.setLoginName("SIM-recollection");
        session.setAttribute(IActionConstants.USER_SESSION_DATA, legacy);
        session.setAttribute("SPRING_SECURITY_CONTEXT", SecurityContextHolder.getContext());
        return actor;
    }

    private static Timestamp ts(String value) {
        return Timestamp.from(Instant.parse(value));
    }

    private final class MemoryTransactions extends AbstractPlatformTransactionManager {
        private boolean active;
        private List<SampleTypeRequest> beforeRequests;
        private List<SpecimenRecollection> beforeRecords;
        private List<String> beforeAudits;

        @Override
        protected Object doGetTransaction() {
            return this;
        }

        @Override
        protected boolean isExistingTransaction(Object transaction) {
            return active;
        }

        @Override
        protected void doBegin(Object transaction, TransactionDefinition definition) {
            active = true;
            beforeRequests = new ArrayList<>(requests);
            beforeRecords = new ArrayList<>(records);
            beforeAudits = new ArrayList<>(audits);
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            requests.clear();
            requests.addAll(beforeRequests);
            records.clear();
            records.addAll(beforeRecords);
            audits.clear();
            audits.addAll(beforeAudits);
        }

        @Override
        protected void doSetRollbackOnly(DefaultTransactionStatus status) {
        }

        @Override
        protected void doCleanupAfterCompletion(Object transaction) {
            active = false;
        }
    }
}
