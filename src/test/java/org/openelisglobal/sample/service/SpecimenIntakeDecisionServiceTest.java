package org.openelisglobal.sample.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.junit.*;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.audittrail.dao.AuditTrailService;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.dictionary.valueholder.Dictionary;
import org.openelisglobal.dictionarycategory.valueholder.DictionaryCategory;
import org.openelisglobal.login.service.LoginUserService;
import org.openelisglobal.login.valueholder.LoginUser;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.referencetables.valueholder.ReferenceTables;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.*;
import org.openelisglobal.result.service.ResultSpecimenAvailabilityService;
import org.openelisglobal.result.service.SpecimenResultAdmissionReader;
import org.openelisglobal.sample.controller.rest.SpecimenIntakeDecisionRestController;
import org.openelisglobal.sample.dao.SpecimenIntakeDecisionDAO;
import org.openelisglobal.sample.dao.SpecimenIntakeDecisionWriteDAO;
import org.openelisglobal.sample.dao.SpecimenReceiptDAO;
import org.openelisglobal.sample.form.SpecimenIntakeEvidence;
import org.openelisglobal.sample.service.EntryCurrentStateReader.AnalysisView;
import org.openelisglobal.sample.service.EntryCurrentStateReader.SpecimenView;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision;
import org.openelisglobal.sampleitem.service.SampleItemService;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.statusofsample.valueholder.StatusOfSample;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.BeanUtils;
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
import org.springframework.transaction.support.*;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Real MVC, actor and Spring commit callbacks; only explicitly SIM memory
 * resources. No JDBC claim.
 */
public class SpecimenIntakeDecisionServiceTest {
    private static final String VERSION = "2026-09-01T01:01:00.123456Z";
    private final ObjectMapper json = new ObjectMapper();
    private final SpecimenReceiptDAO graph = mock(SpecimenReceiptDAO.class);
    private final SpecimenIntakeDecisionWriteDAO dao = mock(SpecimenIntakeDecisionWriteDAO.class);
    private final SampleItemService items = mock(SampleItemService.class);
    private final UserService permissions = mock(UserService.class);
    private final AuditTrailService audit = mock(AuditTrailService.class);
    private final DefaultConfigurationProperties configuration = mock(DefaultConfigurationProperties.class);
    private final Sample sample = new Sample();
    private final TypeOfSample type = new TypeOfSample();
    private final org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
    private final Dictionary reason = new Dictionary();
    private final DictionaryCategory category = new DictionaryCategory();
    private final StatusOfSample rejected = new StatusOfSample();
    private final List<ReferenceTables> references = new ArrayList<>();
    private final List<SampleTypeRequest> requests = new ArrayList<>();
    private final List<Analysis> analyses = new ArrayList<>();
    private final Map<String, SampleItem> tubes = new LinkedHashMap<>();
    private final Map<String, SpecimenIntakeDecision> records = new LinkedHashMap<>();
    private final List<String> audits = new ArrayList<>();
    private final Set<Object> managed = Collections.newSetFromMap(new IdentityHashMap<>());
    private final MemoryTransactions transactions = new MemoryTransactions();
    private MockHttpSession session;
    private SystemUser operator;
    private MockMvc mvc;
    private SpecimenIntakeDecisionService service, target;
    private boolean allowed = true;
    private Runnable afterInsert = () -> {
    }, afterAudit = () -> {
    }, afterUpdate = () -> {
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
        operator.setLoginName("SIM-intake");
        operator.setIsActive("Y");
        var local = new LoginUser();
        local.setSystemUserId(7);
        local.setLoginName("SIM-intake");
        local.setAccountLocked("N");
        local.setAccountDisabled("N");
        local.setPasswordExpiredDayNo(90);
        when(accounts.getMatch("loginName", "SIM-intake")).thenReturn(Optional.of(operator));
        when(logins.getMatch("loginName", "SIM-intake")).thenReturn(Optional.of(local));
        when(roles.userInRole("7", Constants.ROLE_RECEPTION)).thenReturn(true);
        var principal = User.withUsername("SIM-intake").password("unused").authorities("ROLE_RECEPTION").build();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
        session = new MockHttpSession();
        var legacy = new UserSessionData();
        legacy.setSytemUserId(7);
        legacy.setLoginName("SIM-intake");
        session.setAttribute(IActionConstants.USER_SESSION_DATA, legacy);
        session.setAttribute("SPRING_SECURITY_CONTEXT", SecurityContextHolder.getContext());
        sample.setId("701");
        sample.setAccessionNumber("SIM-INTAKE-701");
        sample.setDomain("H");
        sample.setStatusId("1");
        sample.setLastupdated(ts(VERSION));
        ReflectionTestUtils.setField(sample, "receivedTimestamp", ts("2026-09-01T00:00:00Z"));
        type.setId("11");
        type.setIsActive(true);
        type.setLastupdated(ts(VERSION));
        test.setId("31");
        test.setIsActive("Y");
        test.setLastupdated(ts(VERSION));
        category.setId("41");
        category.setCategoryName("resultRejectionReasons");
        category.setLastupdated(ts(VERSION));
        reason.setId("51");
        reason.setDictEntry("模拟：标本凝固");
        reason.setIsActive("Y");
        reason.setDictionaryCategory(category);
        reason.setLastupdated(ts(VERSION));
        rejected.setId("4");
        rejected.setStatusType("SAMPLE");
        rejected.setStatusOfSampleName("Sample Rejected");
        rejected.setLastupdated(ts(VERSION));
        for (String table : List.of("sample_item", "specimen_intake_decision")) {
            var ref = new ReferenceTables();
            ref.setId("6" + (references.size() + 1));
            ref.setTableName(table);
            ref.setKeepHistory("Y");
            ref.setIsHl7Encoded("N");
            ref.setLastupdated(ts(VERSION));
            references.add(ref);
        }
        for (int i = 0; i < 2; i++) {
            var tube = new SampleItem();
            tube.setId("100" + (i + 1));
            tube.setSample(sample);
            tube.setTypeOfSample(type);
            tube.setStatusId("2");
            tube.setSortOrder("" + (i + 1));
            tube.setCollector("SIM-collector");
            tube.setQuantity(0.5);
            tube.setCollectionDate(ts("2026-09-01T00:30:00.123456Z"));
            tube.setReceivedDate(ts("2026-09-01T01:00:00Z"));
            tube.setLastupdated(ts(VERSION));
            tubes.put(tube.getId(), tube);
            var planned = new SampleTypeRequest();
            planned.setId(901 + i);
            planned.setSample(sample);
            planned.setSampleItem(tube);
            planned.setTypeOfSample(type);
            planned.setStatus(SampleTypeRequest.Status.COLLECTED);
            planned.setRequestedTests("31");
            planned.setLastupdated(ts(VERSION));
            requests.add(planned);
            var analysis = new Analysis();
            analysis.setId("110" + (i + 1));
            analysis.setSampleItem(tube);
            analysis.setTest(test);
            analysis.setStatusId("3");
            analysis.setLastupdated(ts(VERSION));
            analyses.add(analysis);
        }
        managed.addAll(List.of(sample, type, test, category, reason, rejected));
        managed.addAll(references);
        managed.addAll(tubes.values());
        managed.addAll(requests);
        managed.addAll(analyses);
        when(configuration.getPropertyValue("domain.human")).thenReturn("H");
        when(graph.lockOrder("701")).thenReturn(sample);
        when(graph.clinicalPatientIds("701")).thenReturn(List.of("801"));
        when(graph.lockRequests("701")).thenReturn(requests);
        when(graph.lockItems("701")).thenAnswer(c -> new ArrayList<>(tubes.values()));
        when(graph.lockAnalyses("701")).thenReturn(analyses);
        when(graph.currentMembership("701")).thenAnswer(
                c -> new SpecimenReceiptDAO.Membership(requests.stream().map(SampleTypeRequest::getId).toList(),
                        new ArrayList<>(tubes.keySet()), analyses.stream().map(Analysis::getId).toList()));
        when(graph.statusName("1", "ORDER")).thenReturn("Test Entered");
        when(graph.statusName("2", "SAMPLE")).thenReturn("SampleEntered");
        when(graph.statusName("3", "ANALYSIS")).thenReturn("Not Tested");
        when(graph.statusName("4", "SAMPLE")).thenReturn("Sample Rejected");
        when(permissions.getAllDisplayUserTestsByLabUnit("7", Constants.ROLE_RECEPTION))
                .thenAnswer(c -> allowed ? List.of(new IdValuePair("31", "SIM-test")) : List.of());
        when(dao.lockType("11")).thenReturn(type);
        when(dao.lockTests(anyList())).thenReturn(List.of(test));
        when(dao.lockReason("51")).thenReturn(reason);
        when(dao.lockReasonCategory("41")).thenReturn(category);
        when(dao.lockRejectedStatuses()).thenReturn(List.of(rejected));
        when(dao.lockAuditReferences()).thenReturn(references);
        when(dao.auditReferences()).thenReturn(references);
        when(dao.currentItem(anyString())).thenAnswer(c -> tubes.get(c.getArgument(0)));
        when(dao.lockClaims(anyString(), anyString())).thenAnswer(c -> records.values().stream().filter(
                row -> row.getOperationId().equals(c.getArgument(0)) || row.getSampleItemId().equals(c.getArgument(1)))
                .toList());
        doAnswer(c -> {
            for (Object value : (List<?>) c.getArgument(0)) {
                if (!managed.contains(value)) {
                    throw new IllegalStateException("SIM detached");
                }
            }
            return null;
        }).when(dao).requireManaged(anyList());
        when(dao.insert(any())).thenAnswer(c -> {
            SpecimenIntakeDecision row = c.getArgument(0);
            assertNull(row.getId());
            row.validateRecord();
            row.setId("200" + (records.size() + 1));
            records.put(row.getSampleItemId(), row);
            managed.add(row);
            afterInsert.run();
            return row;
        });
        doAnswer(c -> {
            audits.add("decision:" + ((SpecimenIntakeDecision) c.getArgument(0)).getSampleItemId() + ":"
                    + c.getArgument(1));
            afterAudit.run();
            return null;
        }).when(audit).saveNewHistory(any(), anyString(), eq("specimen_intake_decision"));
        when(items.update(any())).thenAnswer(c -> {
            SampleItem update = c.getArgument(0);
            SampleItem old = tubes.get(update.getId());
            assertNotSame(old, update);
            assertFalse(old.isRejected());
            assertNull(old.getRejectReasonId());
            assertEquals("2", old.getStatusId());
            assertEquals(old.getLastupdated(), update.getLastupdated());
            assertEquals("7", update.getSysUserId());
            assertEquals(old.getReceivedDate(), update.getReceivedDate());
            assertEquals(old.getCollectionDate(), update.getCollectionDate());
            update.setLastupdated(ts("2026-09-01T02:00:00.123456Z"));
            tubes.put(update.getId(), update);
            managed.remove(old);
            managed.add(update);
            audits.add("tube:" + update.getId() + ":7");
            afterUpdate.run();
            return update;
        });
        doAnswer(c -> {
            afterFlush.run();
            return null;
        }).when(graph).flush();
        target = new SpecimenIntakeDecisionService(graph, dao, actor, items, permissions, audit, configuration);
        var proxy = new ProxyFactory(target);
        proxy.setProxyTargetClass(true);
        transactions.setRollbackOnCommitFailure(true);
        proxy.addAdvice(new TransactionInterceptor(transactions, new AnnotationTransactionAttributeSource()));
        service = (SpecimenIntakeDecisionService) proxy.getProxy();
        mvc = MockMvcBuilders.standaloneSetup(new SpecimenIntakeDecisionRestController(service))
                .setMessageConverters(new MappingJackson2HttpMessageConverter(json)).build();
    }

    @After
    public void cleanup() {
        SecurityContextHolder.clearContext();
        RequestContextHolder.resetRequestAttributes();
    }

    private static Timestamp ts(String s) {
        return Timestamp.from(Instant.parse(s));
    }

    private static SampleItem copy(SampleItem item) {
        var result = new SampleItem();
        BeanUtils.copyProperties(item, result);
        return result;
    }

    private ObjectNode body(boolean refuse, int index) {
        var tube = tubes.get("100" + (index + 1));
        var analysis = analyses.get(index);
        var planned = requests.get(index);
        var evidence = new SpecimenIntakeEvidence(1, SpecimenIntakeEvidence.wallClockTime(sample.getLastupdated()),
                SpecimenIntakeEvidence.wallClockTime(planned.getLastupdated()),
                SpecimenIntakeEvidence.wallClockTime(tube.getLastupdated()), type.getId(),
                SpecimenIntakeEvidence.instantTime(tube.getCollectionDate()),
                SpecimenIntakeEvidence.instantTime(tube.getReceivedDate()),
                List.of(new SpecimenIntakeEvidence.Analysis(analysis.getId(), test.getId(),
                        SpecimenIntakeEvidence.wallClockTime(analysis.getLastupdated()))));
        var result = json.createObjectNode().put("version", 1)
                .put("operationId", "00000000-0000-4000-8000-00000000000" + (index + 1)).put("sampleId", "701")
                .put("labNo", "SIM-INTAKE-701").put("patientId", "801").put("requestId", "" + (901 + index))
                .put("sampleItemId", tube.getId()).put("decision", refuse ? "REJECTED" : "ACCEPTED")
                .put("expectedEvidenceDigest", SpecimenIntakeEvidence.digest(evidence.encode()));
        if (refuse) {
            result.putObject("reason").put("namespace", "DICTIONARY:resultRejectionReasons").put("id", "51")
                    .put("version", VERSION).put("label", "模拟：标本凝固");
        } else {
            result.putNull("reason");
        }
        return result;
    }

    private JsonNode send(ObjectNode body, int status) throws Exception {
        return send(body.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8), MediaType.APPLICATION_JSON,
                status);
    }

    private JsonNode send(byte[] bytes, MediaType media, int status) throws Exception {
        var response = mvc
                .perform(post("/rest/specimen-intake-decisions").session(session).contentType(media).content(bytes))
                .andReturn().getResponse();
        assertEquals(response.getContentAsString(), status, response.getStatus());
        assertEquals("no-store", response.getHeader("Cache-Control"));
        return json.readTree(response.getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }

    private void nothingWritten() {
        assertTrue(records.isEmpty());
        assertTrue(audits.isEmpty());
        assertFalse(tubes.get("1001").isRejected());
    }

    @Test
    public void acceptsOneTubeWithoutChangingOtherTubeOrOpeningResultGate() throws Exception {
        var original = tubes.get("1001");
        var response = send(body(false, 0), 200);
        assertEquals("ACCEPTED", response.path("recordedDecision").asText());
        assertFalse(response.path("currentAcceptanceVerified").asBoolean());
        assertEquals("7", response.path("decidedBy").asText());
        assertFalse(response.path("replayed").asBoolean());
        assertSame(original, tubes.get("1001"));
        assertEquals(1, records.size());
        assertEquals(List.of("decision:1001:7"), audits);
        verify(items, never()).update(any());
        assertEquals("3", analyses.get(0).getStatusId());
    }

    @Test
    public void refusalWritesFrozenReasonAndOriginalRefusalStateWithTwoAudits() throws Exception {
        var old = tubes.get("1001");
        var response = send(body(true, 0), 200);
        assertEquals("REJECTED", response.path("recordedDecision").asText());
        assertFalse(response.path("currentAcceptanceVerified").asBoolean());
        assertEquals("DICTIONARY:resultRejectionReasons", response.path("reason").path("namespace").asText());
        assertEquals("模拟：标本凝固", records.get("1001").reason().label());
        assertFalse(old.isRejected());
        assertNull(old.getRejectReasonId());
        assertEquals("2", old.getStatusId());
        assertTrue(tubes.get("1001").isRejected());
        assertEquals("4", tubes.get("1001").getStatusId());
        assertEquals("51", tubes.get("1001").getRejectReasonId());
        assertFalse(tubes.get("1002").isRejected());
        assertEquals(List.of("decision:1001:7", "tube:1001:7"), audits);
    }

    @Test
    public void exactRetryReturnsOriginalReceiptWithoutAuditOrWrite() throws Exception {
        var input = body(true, 0);
        var first = send(input, 200);
        var retry = send(input, 200);
        assertTrue(retry.path("replayed").asBoolean());
        assertEquals(first.path("decidedAt"), retry.path("decidedAt"));
        assertEquals(1, records.size());
        assertEquals(2, audits.size());
        verify(dao, times(1)).insert(any());
        verify(items, times(1)).update(any());
    }

    @Test
    public void normalResultProgressDoesNotEraseFirstReceipt() throws Exception {
        var input = body(false, 0);
        send(input, 200);
        analyses.get(0).setStatusId("99");
        analyses.get(0).setLastupdated(ts("2026-09-01T03:00:00Z"));
        assertTrue(send(input, 200).path("replayed").asBoolean());
        assertEquals(1, audits.size());
    }

    @Test
    public void laterRequestedTestChangeReturnsConflictWithoutOverwritingHistory() throws Exception {
        var input = body(false, 0);
        send(input, 200);
        requests.get(0).setRequestedTests("32");
        send(input, 409);
        assertEquals(1, records.size());
        assertEquals(1, audits.size());
    }

    @Test
    public void cancelledRequestCannotReplayWriteButKeepsOriginalHistory() throws Exception {
        var input = body(false, 0);
        send(input, 200);
        requests.get(0).setStatus(SampleTypeRequest.Status.CANCELLED);
        send(input, 409);
        assertEquals(1, records.size());
        assertEquals(1, audits.size());
        assertEquals("ACCEPTED", records.get("1001").getDecision().name());
    }

    @Test
    public void sameOperationCannotExposeHistoryThroughReassignedPatient() throws Exception {
        var input = body(true, 0);
        send(input, 200);
        when(graph.clinicalPatientIds("701")).thenReturn(List.of("802"));
        var error = send(input.put("patientId", "802"), 409);
        assertFalse(error.has("reason"));
        assertFalse(error.has("decidedBy"));
        assertEquals("801", records.get("1001").getPatientId());
        assertEquals(2, audits.size());
    }

    @Test
    public void sameOperationCannotExposeHistoryAfterTypeReplacement() throws Exception {
        var input = body(true, 0);
        send(input, 200);
        type.setId("12");
        var error = send(input, 409);
        assertFalse(error.has("reason"));
        assertEquals("11", records.get("1001").evidence().typeOfSampleId());
        assertEquals(2, audits.size());
    }

    @Test
    public void refusalOnAnotherTubeDoesNotBlockThisTube() throws Exception {
        send(body(true, 0), 200);
        send(body(false, 1), 200);
        assertEquals(2, records.size());
        assertEquals(3, audits.size());
    }

    @Test
    public void absenceOfStorageAndConsentDoesNotInventCompletedAcceptance() throws Exception {
        assertFalse(sample.getStorageSkipped());
        var result = send(body(true, 0), 200);
        assertFalse(result.path("currentAcceptanceVerified").asBoolean());
    }

    @Test
    public void anotherOperationCannotOverwriteExistingFirstDecision() throws Exception {
        var input = body(false, 0);
        send(input, 200);
        input.put("operationId", "00000000-0000-4000-8000-000000000009");
        send(input, 409);
        assertEquals(1, records.size());
        assertEquals(1, audits.size());
    }

    @Test
    public void operationIdCannotBeReusedForAnotherTube() throws Exception {
        var first = body(false, 0);
        send(first, 200);
        var second = body(false, 1).put("operationId", first.path("operationId").asText());
        send(second, 409);
        assertEquals(1, records.size());
        assertEquals(1, audits.size());
    }

    @Test
    public void replayCannotChangeReasonOrDecision() throws Exception {
        var input = body(true, 0);
        send(input, 200);
        ((ObjectNode) input.get("reason")).put("label", "伪造原因");
        send(input, 409);
        assertEquals("模拟：标本凝固", records.get("1001").reason().label());
        assertEquals(2, audits.size());
    }

    @Test
    public void staleEvidenceRejectsBeforeAnyWrite() throws Exception {
        var input = body(true, 0);
        tubes.get("1001").setLastupdated(ts("2026-09-01T04:00:00Z"));
        send(input, 409);
        nothingWritten();
    }

    @Test
    public void wrongPatientRejectsBeforeAnyWrite() throws Exception {
        send(body(true, 0).put("patientId", "802"), 409);
        nothingWritten();
    }

    @Test
    public void crossedRequestAndTubeRejectsBeforeAnyWrite() throws Exception {
        send(body(true, 0).put("requestId", "902"), 409);
        nothingWritten();
    }

    @Test
    public void alreadyRejectedTubeIsNotAccepted() throws Exception {
        var input = body(false, 0);
        tubes.get("1001").setRejected(true);
        send(input, 409);
        assertTrue(records.isEmpty());
    }

    @Test
    public void voidedTubeIsNotAccepted() throws Exception {
        var input = body(false, 0);
        tubes.get("1001").setVoided(true);
        send(input, 409);
        assertTrue(records.isEmpty());
    }

    @Test
    public void missingReceiptCannotBeAccepted() throws Exception {
        var input = body(false, 0);
        tubes.get("1001").setReceivedDate(null);
        send(input, 409);
        nothingWritten();
    }

    @Test
    public void analysisAlreadyStartedCannotBeFirstAccepted() throws Exception {
        var input = body(false, 0);
        analyses.get(0).setStatusId("99");
        send(input, 409);
        nothingWritten();
    }

    @Test
    public void inactiveTypeCannotBeFirstAccepted() throws Exception {
        type.setIsActive(false);
        send(body(false, 0), 409);
        nothingWritten();
    }

    @Test
    public void inactiveTestCannotBeFirstAccepted() throws Exception {
        test.setIsActive("N");
        send(body(false, 0), 409);
        nothingWritten();
    }

    @Test
    public void anotherTestWithSameIdIsNotAuthority() throws Exception {
        var other = new org.openelisglobal.test.valueholder.Test();
        other.setId("31");
        other.setIsActive("Y");
        other.setLastupdated(ts(VERSION));
        when(dao.lockTests(anyList())).thenReturn(List.of(other));
        send(body(false, 0), 409);
        nothingWritten();
    }

    @Test public void missingReasonIsNotUsable() throws Exception { when(dao.lockReason("51")).thenReturn(null); send(body(true, 0), 409); nothingWritten(); }

    @Test
    public void disabledReasonIsNotUsable() throws Exception {
        reason.setIsActive("N");
        assertEquals("SPECIMEN_DECISION_REASON_UNAVAILABLE", send(body(true, 0), 409).path("code").asText());
        nothingWritten();
    }

    @Test
    public void wrongReasonCategoryIsNotUsable() throws Exception {
        category.setCategoryName("SIM-unrelated");
        send(body(true, 0), 409);
        nothingWritten();
    }

    @Test
    public void changedReasonLabelRequiresReselection() throws Exception {
        reason.setDictEntry("模拟：原因已变更");
        send(body(true, 0), 409);
        nothingWritten();
    }

    @Test
    public void changedReasonVersionRequiresReselection() throws Exception {
        reason.setLastupdated(ts("2026-09-01T04:00:00Z"));
        send(body(true, 0), 409);
        nothingWritten();
    }

    @Test
    public void unqualifiedQaEventCannotBeSubmittedAsReason() throws Exception {
        var input = body(true, 0);
        ((ObjectNode) input.get("reason")).put("namespace", "QA_EVENT");
        send(input, 400);
        nothingWritten();
    }

    @Test
    public void missingAuditRegistrationBlocksBeforeInsert() throws Exception {
        references.remove(0);
        send(body(true, 0), 409);
        nothingWritten();
        verify(dao, never()).insert(any());
    }

    @Test
    public void duplicateAuditRegistrationBlocksBeforeInsert() throws Exception {
        references.get(1).setTableName("sample_item");
        send(body(true, 0), 409);
        nothingWritten();
    }

    @Test
    public void disabledAuditRegistrationBlocksBeforeInsert() throws Exception {
        references.get(0).setKeepHistory("N");
        send(body(true, 0), 409);
        nothingWritten();
    }

    @Test public void duplicateRejectionStatusBlocksBeforeInsert() throws Exception { when(dao.lockRejectedStatuses()).thenReturn(List.of(rejected, rejected)); send(body(true, 0), 409); nothingWritten(); }

    @Test
    public void missingPermissionReturnsNoPatientData() throws Exception {
        allowed = false;
        var error = send(body(true, 0), 403);
        assertFalse(error.has("patientId"));
        nothingWritten();
    }

    @Test
    public void forgedActorFieldIsRejected() throws Exception {
        send(body(true, 0).put("actorId", "8"), 400);
        nothingWritten();
    }

    @Test
    public void numericIdIsNotCoerced() throws Exception {
        send(body(true, 0).put("sampleId", 701), 400);
        nothingWritten();
    }

    @Test
    public void duplicateJsonFieldIsRejected() throws Exception {
        var text = body(true, 0).toString().replace("\"version\":1", "\"version\":1,\"version\":1");
        send(text.getBytes(java.nio.charset.StandardCharsets.UTF_8), MediaType.APPLICATION_JSON, 400);
        nothingWritten();
    }

    @Test
    public void trailingJsonAndMalformedUtf8AreRejected() throws Exception {
        send((body(true, 0) + " {}").getBytes(java.nio.charset.StandardCharsets.UTF_8), MediaType.APPLICATION_JSON,
                400);
        send(new byte[] { (byte) 0xc3, 0x28 }, MediaType.APPLICATION_JSON, 400);
        nothingWritten();
    }

    @Test
    public void payloadLimitAndCharsetAreEnforced() throws Exception {
        send(new byte[65537], MediaType.APPLICATION_JSON, 413);
        send(body(true, 0).toString().getBytes(java.nio.charset.StandardCharsets.UTF_8),
                MediaType.parseMediaType("application/json;charset=ISO-8859-1"), 400);
        nothingWritten();
    }

    @Test
    public void uniquenessFailureDoesNotTouchOriginalTube() throws Exception {
        doThrow(new IllegalStateException("SIM unique conflict")).when(dao).insert(any());
        var error = send(body(true, 0), 500);
        assertEquals("SPECIMEN_DECISION_UNKNOWN", error.path("code").asText());
        nothingWritten();
        verify(items, never()).update(any());
    }

    @Test
    public void auditFailureRollsBackNewRecord() throws Exception {
        afterAudit = () -> {
            throw new IllegalStateException("SIM audit failure");
        };
        send(body(true, 0), 500);
        nothingWritten();
    }

    @Test
    public void tubeUpdateFailureRollsBackFactAndBothAudits() throws Exception {
        afterUpdate = () -> {
            throw new IllegalStateException("SIM tube failure");
        };
        send(body(true, 0), 500);
        nothingWritten();
    }

    @Test
    public void latePatientMoveRollsBackEverything() throws Exception {
        afterFlush = () -> when(graph.clinicalPatientIds("701")).thenReturn(List.of("802"));
        send(body(true, 0), 409);
        nothingWritten();
    }

    @Test
    public void lateTypeChangeRollsBackEverything() throws Exception {
        afterAudit = () -> type.setIsActive(false);
        send(body(true, 0), 409);
        nothingWritten();
    }

    @Test
    public void lateReasonDeactivationRollsBackEverything() throws Exception {
        afterFlush = () -> reason.setIsActive("N");
        send(body(true, 0), 409);
        nothingWritten();
    }

    @Test
    public void lateReferenceChangeRollsBackEverything() throws Exception {
        afterFlush = () -> references.get(0).setKeepHistory("N");
        send(body(true, 0), 409);
        nothingWritten();
    }

    @Test
    public void lateTargetVersionChangeRollsBackEverything() throws Exception {
        afterUpdate = () -> tubes.get("1001").setReceivedDate(ts("2026-09-01T06:00:00Z"));
        send(body(true, 0), 409);
        nothingWritten();
    }

    @Test
    public void lateCollectionConditionsChangeRollsBackEverything() throws Exception {
        afterUpdate = () -> tubes.get("1001").setCollectionConditions("SIM changed after audit");
        send(body(true, 0), 409);
        nothingWritten();
    }

    @Test
    public void futureReceiptIsKnownConflictBeforeAnyWrite() throws Exception {
        tubes.get("1001").setReceivedDate(ts("2099-09-01T01:00:00Z"));
        send(body(false, 0), 409);
        nothingWritten();
        verify(dao, never()).insert(any());
    }

    @Test
    public void futureObservedVersionIsKnownConflictBeforeAnyWrite() throws Exception {
        tubes.get("1001").setLastupdated(ts("2099-09-01T01:00:00Z"));
        send(body(true, 0), 409);
        nothingWritten();
        verify(dao, never()).insert(any());
    }

    @Test
    public void futureReasonVersionIsKnownConflictBeforeAnyWrite() throws Exception {
        reason.setLastupdated(ts("2099-09-01T01:00:00Z"));
        var input = body(true, 0);
        ((ObjectNode) input.get("reason")).put("version", "2099-09-01T01:00:00Z");
        send(input, 409);
        nothingWritten();
        verify(dao, never()).insert(any());
    }

    @Test
    public void lateDetachOfOriginalIsNotSilentlyWritten() throws Exception {
        afterInsert = () -> managed.remove(tubes.get("1001"));
        send(body(true, 0), 500);
        nothingWritten();
        verify(items, never()).update(any());
    }

    @Test
    public void lateActorRevocationRollsBackEverything() throws Exception {
        afterFlush = () -> operator.setIsActive("N");
        send(body(true, 0), 403);
        nothingWritten();
    }

    @Test
    public void latePermissionRevocationRollsBackEverything() throws Exception {
        afterFlush = () -> allowed = false;
        send(body(true, 0), 403);
        nothingWritten();
    }

    @Test
    public void addedMembershipAfterWriteRollsBackEverything() throws Exception {
        afterFlush = () -> when(graph.currentMembership("701")).thenReturn(new SpecimenReceiptDAO.Membership(
                List.of(901, 902, 903), List.of("1001", "1002"), List.of("1101", "1102")));
        send(body(true, 0), 409);
        nothingWritten();
    }

    @Test
    public void rollbackOfSecondOperationPreservesFirstCommittedHistory() throws Exception {
        send(body(false, 0), 200);
        afterAudit = () -> {
            throw new IllegalStateException("SIM second audit");
        };
        send(body(true, 1), 500);
        assertEquals(Set.of("1001"), records.keySet());
        assertEquals(List.of("decision:1001:7"), audits);
        assertFalse(tubes.get("1002").isRejected());
    }

    @Test
    public void commitFailureHasUnknownResponseAndNoFabricatedSuccess() throws Exception {
        transactions.failCommit = true;
        var error = send(body(true, 0), 500);
        assertFalse(error.path("success").asBoolean());
        nothingWritten();
    }

    @Test
    public void directCallWithoutTransactionIsRejected() {
        try {
            target.decide(body(true, 0), new MockHttpServletRequest());
            fail();
        } catch (org.openelisglobal.sample.exception.EntrySubmissionException e) {
            assertEquals(409, e.getStatus());
        }
        nothingWritten();
    }

    @Test
    public void weakerOuterTransactionIsRejected() {
        var outer = new TransactionTemplate(transactions);
        outer.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        try {
            outer.execute(s -> service.decide(body(true, 0), new MockHttpServletRequest()));
            fail();
        } catch (org.openelisglobal.sample.exception.EntrySubmissionException e) {
            assertEquals(409, e.getStatus());
        }
        nothingWritten();
    }

    @Test
    public void outerCommitRechecksChangesAfterInnerServiceReturned() {
        var request = new MockHttpServletRequest();
        request.setSession(session);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        var outer = new TransactionTemplate(transactions);
        outer.setIsolationLevel(TransactionDefinition.ISOLATION_SERIALIZABLE);
        try {
            outer.execute(s -> {
                service.decide(body(true, 0), request);
                tubes.get("1001").setStatusId("99");
                return null;
            });
            fail();
        } catch (org.openelisglobal.sample.exception.EntrySubmissionException expected) {
            assertEquals(409, expected.getStatus());
        }
        nothingWritten();
    }

    @Test
    public void outerCommitRejectsTamperedAcceptedTubeInsteadOfNormalizingItAway() {
        var request = new MockHttpServletRequest();
        request.setSession(session);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        var outer = new TransactionTemplate(transactions);
        outer.setIsolationLevel(TransactionDefinition.ISOLATION_SERIALIZABLE);
        try {
            outer.execute(s -> {
                service.decide(body(false, 0), request);
                tubes.get("1001").setStatusId("99");
                return null;
            });
            fail();
        } catch (org.openelisglobal.sample.exception.EntrySubmissionException expected) {
            assertEquals(409, expected.getStatus());
        }
        nothingWritten();
    }

    @Test
    public void outerCommitRejectsChangedExternalTubeCode() {
        var request = new MockHttpServletRequest();
        request.setSession(session);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        var outer = new TransactionTemplate(transactions);
        outer.setIsolationLevel(TransactionDefinition.ISOLATION_SERIALIZABLE);
        try {
            outer.execute(s -> {
                service.decide(body(true, 0), request);
                tubes.get("1001").setExternalId("SIM-another-tube");
                return null;
            });
            fail();
        } catch (org.openelisglobal.sample.exception.EntrySubmissionException expected) {
            assertEquals(409, expected.getStatus());
        }
        nothingWritten();
    }

    /**
     * Reads the actual records committed by the real writer above; no fabricated
     * acceptance receipt.
     */
    private List<SpecimenIntakeDecisionReader.Tube> currentAdmissions(boolean resultPermission) {
        var section = new TestSection();
        section.setId("61");
        analyses.forEach(a -> {
            a.setTestSection(section);
            a.setSampleItem(tubes.get(a.getSampleItem().getId()));
        });
        var states = mock(OrdinaryResultSaveStateDAO.class);
        var statuses = mock(IStatusService.class);
        for (AnalysisStatus status : AnalysisStatus.values()) {
            when(statuses.getStatusID(status))
                    .thenReturn(status == AnalysisStatus.NotStarted ? "3" : Integer.toString(100 + status.ordinal()));
        }
        when(statuses.getStatusID(SampleStatus.Entered)).thenReturn("2");
        when(statuses.getStatusID(SampleStatus.SampleRejected)).thenReturn("4");
        when(statuses.getStatusID(SampleStatus.Canceled)).thenReturn("6");
        when(statuses.getStatusID(SampleStatus.Disposed)).thenReturn("8");
        when(states.findSpecimenState(anyString())).thenAnswer(c -> {
            var a = analyses.stream().filter(v -> v.getId().equals(c.getArgument(0))).findFirst().orElseThrow();
            var t = a.getSampleItem();
            return new SpecimenState(a.getId(), a.getTest().getId(), t.getId(), sample.getId(), t.getStatusId(),
                    t.isRejected(), t.isVoided());
        });
        when(states.findState(anyString())).thenAnswer(c -> {
            var a = analyses.stream().filter(v -> v.getId().equals(c.getArgument(0))).findFirst().orElseThrow();
            return new State(a.getId(), a.getStatusId(), a.getReleasedDate(), a.getPrintedDate());
        });
        when(states.findIntakeState(anyString())).thenAnswer(c -> {
            var t = tubes.get(c.getArgument(0));
            var r = requests.stream().filter(v -> v.getSampleItem().getId().equals(t.getId())).findFirst()
                    .orElseThrow();
            var tube = new IntakeTube(t.getId(), sample.getId(), sample.getAccessionNumber(), "2026-09-01T00:00:00Z",
                    type.getId(), type.getIsActive(), SpecimenIntakeEvidence.instantTime(t.getCollectionDate()),
                    SpecimenIntakeEvidence.instantTime(t.getReceivedDate()),
                    SpecimenIntakeEvidence.wallClockTime(t.getLastupdated()), null, t.getRejectReasonId(), "H", "H");
            var request = new IntakeRequest(r.getId().toString(), sample.getId(), t.getId(), type.getId(),
                    r.getStatus(), r.getRequestedTests(), SpecimenIntakeEvidence.wallClockTime(r.getLastupdated()));
            return new IntakeState(tube, List.of("801"), List.of(request),
                    analyses.stream().filter(a -> a.getSampleItem().getId().equals(t.getId()))
                            .map(a -> new IntakeTest(a.getId(), a.getTest().getId(), a.getTest().getIsActive()))
                            .toList(),
                    records.containsKey(t.getId()) ? List.of(records.get(t.getId())) : List.of());
        });
        var resultsUsers = mock(UserService.class);
        when(resultsUsers.filterAnalysesByLabUnitRoles("7", analyses, Constants.ROLE_RESULTS))
                .thenReturn(resultPermission ? analyses : List.of());
        when(resultsUsers.getAllDisplayUserTestsByLabUnit("7", Constants.ROLE_RESULTS))
                .thenReturn(List.of(new IdValuePair("31", "SIM test")));
        var decisionDao = mock(SpecimenIntakeDecisionDAO.class);
        when(decisionDao.findForTubes(anyList())).thenReturn(new ArrayList<>(records.values()));
        var reader = new SpecimenIntakeDecisionReader(decisionDao, new SpecimenResultAdmissionReader(
                new ResultSpecimenAvailabilityService(states, statuses), resultsUsers));
        List<SpecimenView> views = tubes.values().stream().map(t -> {
            var r = requests.stream().filter(v -> v.getSampleItem().getId().equals(t.getId())).findFirst()
                    .orElseThrow();
            return new SpecimenView(t.getId(), r.getId().toString(), t.getSortOrder(), type.getId(), t.getQuantity(),
                    null, t.getStatusId(), t.isVoided(), t.isRejected(),
                    SpecimenIntakeEvidence.instantTime(t.getCollectionDate()),
                    SpecimenIntakeEvidence.instantTime(t.getReceivedDate()), t.getCollector(),
                    SpecimenIntakeEvidence.wallClockTime(t.getLastupdated()),
                    analyses.stream().filter(a -> a.getSampleItem().getId().equals(t.getId()))
                            .map(a -> new AnalysisView(a.getId(), a.getTest().getId(), a.getStatusId(),
                                    SpecimenIntakeEvidence.wallClockTime(a.getLastupdated())))
                            .toList());
        }).toList();
        var read = new TransactionTemplate(transactions);
        read.setReadOnly(true);
        read.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        return read.execute(
                status -> reader.read(sample.getId(), sample.getAccessionNumber(), "801", views, "7", analyses));
    }

    @Test
    public void committedPerTubeAcceptanceIsReadThroughCurrentResultGateWithoutBorrowingOtherTube() throws Exception {
        send(body(false, 0), 200);
        var current = currentAdmissions(true);
        assertEquals("ACCEPTED", current.get(0).recordedDecision());
        assertFalse(current.get(0).currentAcceptanceVerified());
        assertEquals("READY", current.get(0).resultEntryAdmission().state());
        assertEquals("1101", current.get(0).resultEntryAdmission().analyses().get(0).analysisId());
        assertEquals("NOT_RECORDED", current.get(1).state());
        assertEquals("BLOCKED", current.get(1).resultEntryAdmission().state());
        assertEquals("error.results.specimenIntakeMissing",
                current.get(1).resultEntryAdmission().analyses().get(0).blockedReason());
        assertEquals(1, records.size());
        assertEquals(List.of("decision:1001:7"), audits);
    }

    @Test
    public void committedRejectionIsVisibleAndCannotEnterResultsWhileAnotherTubeIsAccepted() throws Exception {
        send(body(true, 0), 200);
        send(body(false, 1), 200);
        var current = currentAdmissions(true);
        assertEquals("REJECTED", current.get(0).recordedDecision());
        assertEquals("BLOCKED", current.get(0).resultEntryAdmission().state());
        assertEquals("error.results.specimenRejected",
                current.get(0).resultEntryAdmission().analyses().get(0).blockedReason());
        assertEquals("READY", current.get(1).resultEntryAdmission().state());
        assertEquals(2, records.size());
    }

    @Test
    public void laterEvidenceChangeKeepsAcceptedHistoryButBlocksCurrentResultEntry() throws Exception {
        send(body(false, 0), 200);
        var digest = records.get("1001").getEvidenceDigest();
        tubes.get("1001").setReceivedDate(ts("2026-09-01T02:00:00Z"));
        tubes.get("1001").setLastupdated(ts("2026-09-01T02:00:00Z"));
        var current = currentAdmissions(true).get(0);
        assertEquals("ACCEPTED", current.recordedDecision());
        assertEquals(digest, current.evidenceDigest());
        assertEquals("BLOCKED", current.resultEntryAdmission().state());
        assertEquals("error.results.specimenIntakeChanged",
                current.resultEntryAdmission().analyses().get(0).blockedReason());
    }

    @Test
    public void intakeOperatorWithoutActualResultsRoleSeesHistoryButCannotEnter() throws Exception {
        send(body(false, 0), 200);
        var current = currentAdmissions(false).get(0);
        assertEquals("ACCEPTED", current.recordedDecision());
        assertEquals("BLOCKED", current.resultEntryAdmission().state());
        assertEquals(SpecimenResultAdmissionReader.PERMISSION,
                current.resultEntryAdmission().analyses().get(0).blockedReason());
    }

    private class MemoryTransactions extends AbstractPlatformTransactionManager {
        private boolean active, failCommit;
        private Map<String, SpecimenIntakeDecision> beforeRecords;
        private Map<String, SampleItem> beforeTubes;
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
            beforeRecords = new LinkedHashMap<>(records);
            beforeAudits = new ArrayList<>(audits);
            beforeTubes = new LinkedHashMap<>();
            tubes.forEach((id, tube) -> beforeTubes.put(id, copy(tube)));
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
            if (failCommit) {
                throw new IllegalStateException("SIM commit failure");
            }
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            records.clear();
            records.putAll(beforeRecords);
            audits.clear();
            audits.addAll(beforeAudits);
            tubes.clear();
            tubes.putAll(beforeTubes);
            managed.addAll(tubes.values());
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
