package org.openelisglobal.sampleitem.service;

import static org.junit.Assert.*;
import static org.mockito.AdditionalAnswers.delegatesTo;
import static org.mockito.Mockito.*;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.audittrail.dao.AuditTrailService;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.sample.service.SampleEditAuthorizationService;
import org.openelisglobal.sampleitem.controller.SampleManagementRestController;
import org.openelisglobal.sampleitem.form.CancelTestForm;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.util.ReflectionTestUtils;

/** Real cancellation, audit and competing commits use the disposable BaseTestConfig PostgreSQL only. */
public class SampleManagementCancellationPersistenceTest extends BaseWebContextSensitiveTest {
    @Autowired private SampleManagementService service;
    @Autowired private AnalysisService analyses;
    @Autowired private IStatusService statuses;
    @Autowired private SampleEditAuthorizationService authorization;
    @Autowired private SampleManagementRestController controller;
    private Object serviceTarget;
    private Object analysisTarget;
    private Object previousAudit;
    private MockHttpServletRequest request;

    @Before
    public void prepareCancellationFixture() throws Exception {
        executeDataSetWithStateManagement("testdata/sample-management-status-contract.xml");
        request = authenticatedRequest();
        serviceTarget = AopTestUtils.getTargetObject(service);
        analysisTarget = AopTestUtils.getTargetObject(analyses);
        previousAudit = ReflectionTestUtils.getField(analysisTarget, "auditTrailService");
        AuditTrailService realAudit = webApplicationContext.getBean("auditTrailServiceImpl", AuditTrailService.class);
        assertFalse("Audit assertions must use the real implementation", mockingDetails(realAudit).isMock());
        ReflectionTestUtils.setField(analysisTarget, "auditTrailService", realAudit);
        assertEquals("The current actor must be writable before exercising cancellation", true,
                authorization.canWrite(request, "1"));
        assertEquals(AnalysisStatus.NotStarted, statuses.getAnalysisStatusForID(analysisState()));
        assertEquals(SampleStatus.Entered, statuses.getSampleStatusForID(tubeState()));
    }

    @After
    public void restoreBeans() {
        if (analysisTarget != null) ReflectionTestUtils.setField(analysisTarget, "auditTrailService", previousAudit);
        if (serviceTarget != null) {
            ReflectionTestUtils.setField(serviceTarget, "analysisService", analyses);
            ReflectionTestUtils.setField(serviceTarget, "statusService", statuses);
        }
    }

    @Test
    public void notStartedCancellationCommitsAuthoritativeStateAndExactOldStatusAudit() {
        long histories = historyCount();
        String originalStatus = analysisState();
        var response = service.cancelTest(form(), "1", request);
        assertEquals(statuses.getStatusID(AnalysisStatus.Canceled), analysisState());
        assertEquals(statuses.getStatusID(SampleStatus.Entered), tubeState());
        assertEquals("1", response.getAnalysisId());
        assertEquals("1", response.getSampleItemId());
        assertEquals("Canceled", response.getTest().getStatusCode());
        assertFalse(response.getTest().isCanCancelByStatus());
        assertEquals(histories + 1, historyCount());
        var audit = jdbcTemplate.queryForMap("""
                select h.sys_user_id,h.activity,h.changes from clinlims.history h
                join clinlims.reference_tables r on r.id=h.reference_table
                where h.reference_id=1 and upper(r.name)='ANALYSIS' order by h.id desc limit 1
                """);
        assertEquals("1", audit.get("sys_user_id").toString());
        assertEquals("U", audit.get("activity"));
        String changes = new String((byte[]) audit.get("changes"), StandardCharsets.UTF_8);
        assertTrue("Audit must include the real prior status", changes.contains("<statusId>" + originalStatus + "</statusId>"));
        var row = service.searchByAccessionNumber("24-00001", true).getSampleItems().get(0).getOrderedTests().get(0);
        assertEquals("Canceled", row.getStatusCode());
        assertFalse(row.isCanCancelByStatus());
    }

    @Test
    public void existingTechnicalAcceptanceRuleStillCommitsWithAudit() {
        String technical = statuses.getStatusID(AnalysisStatus.TechnicalAcceptance);
        assertEquals(AnalysisStatus.TechnicalAcceptance, statuses.getAnalysisStatusForID(technical));
        jdbcTemplate.update("update clinlims.analysis set status_id=? where id=1", Integer.parseInt(technical));
        long histories = historyCount();
        service.cancelTest(form(), "1", request);
        assertEquals(statuses.getStatusID(AnalysisStatus.Canceled), analysisState());
        assertEquals(histories + 1, historyCount());
    }

    @Test
    public void allRejectedCancelledDisposedUnknownAndWrongCategoryStatesLeavePersistenceAndAuditUntouched() {
        String entered = tubeState();
        String initial = analysisState();
        for (String tubeStatus : List.of(statuses.getStatusID(SampleStatus.SampleRejected),
                statuses.getStatusID(SampleStatus.Canceled), statuses.getStatusID(SampleStatus.Disposed), "30", "32")) {
            jdbcTemplate.update("update clinlims.sample_item set status_id=? where id=1", Integer.parseInt(tubeStatus));
            long histories = historyCount();
            var dto = service.searchByAccessionNumber("24-00001", true).getSampleItems().get(0);
            if ("30".equals(tubeStatus) || "32".equals(tubeStatus)) assertEquals("UNKNOWN", dto.getStatusCode());
            assertFalse(dto.getOrderedTests().get(0).isCanCancelByStatus());
            assertThrows(SampleManagementConflictException.class, () -> service.cancelTest(form(), "1", request));
            assertEquals(initial, analysisState());
            assertEquals(tubeStatus, tubeState());
            assertEquals(histories, historyCount());
        }
        jdbcTemplate.update("update clinlims.sample_item set status_id=? where id=1", Integer.parseInt(entered));
        for (AnalysisStatus state : AnalysisStatus.values()) {
            if (state == AnalysisStatus.NotStarted || state == AnalysisStatus.TechnicalAcceptance) continue;
            String status = statuses.getStatusID(state);
            jdbcTemplate.update("update clinlims.analysis set status_id=? where id=1", Integer.parseInt(status));
            long histories = historyCount();
            assertThrows(SampleManagementConflictException.class, () -> service.cancelTest(form(), "1", request));
            assertEquals(status, analysisState());
            assertEquals(histories, historyCount());
        }
        for (String status : List.of("30", "31")) {
            jdbcTemplate.update("update clinlims.analysis set status_id=? where id=1", Integer.parseInt(status));
            long histories = historyCount();
            var row = service.searchByAccessionNumber("24-00001", true).getSampleItems().get(0).getOrderedTests().get(0);
            assertEquals("UNKNOWN", row.getStatusCode());
            assertEquals(status, row.getStatus());
            assertFalse(row.isCanCancelByStatus());
            assertThrows(SampleManagementConflictException.class, () -> service.cancelTest(form(), "1", request));
            assertEquals(status, analysisState());
            assertEquals(histories, historyCount());
        }
    }

    @Test
    public void mismatchedTubeAndRevokedActorCannotWriteAfterCapabilityWasRead() {
        String initial = analysisState();
        long histories = historyCount();
        assertThrows(IllegalArgumentException.class,
                () -> service.cancelTest(new CancelTestForm("1", "2"), "1", request));
        assertTrue(controller.searchSamplesByAccessionNumber("24-00001", true, request).getBody().isCanCancelTests());
        jdbcTemplate.update("update clinlims.system_user set is_active='N' where id=1");
        assertFalse(controller.searchSamplesByAccessionNumber("24-00001", true, request).getBody().isCanCancelTests());
        assertThrows(AccessDeniedException.class, () -> controller.cancelTest(form(), request));
        assertThrows(AccessDeniedException.class, () -> service.cancelTest(form(), "1", request));
        assertEquals(initial, analysisState());
        assertEquals(histories, historyCount());
    }

    @Test
    public void missingCancelledConfigurationCannotWriteOrAudit() {
        IStatusService incomplete = mock(IStatusService.class, delegatesTo(statuses));
        doReturn("-1").when(incomplete).getStatusID(AnalysisStatus.Canceled);
        ReflectionTestUtils.setField(serviceTarget, "statusService", incomplete);
        String initial = analysisState();
        long histories = historyCount();
        assertThrows(SampleManagementConflictException.class, () -> service.cancelTest(form(), "1", request));
        assertEquals(initial, analysisState());
        assertEquals(histories, historyCount());
    }

    @Test
    public void competingAnalysisCommitCannotBeOverwrittenAndCancellationAuditRollsBack() throws Exception {
        compete("analysis", statuses.getStatusID(AnalysisStatus.Finalized));
    }

    @Test
    public void competingTubeCommitRollsBackCancellationAndItsAudit() throws Exception {
        compete("sample_item", statuses.getStatusID(SampleStatus.Disposed));
    }

    private void compete(String table, String rivalStatus) throws Exception {
        String initialAnalysis = analysisState();
        String initialTube = tubeState();
        long histories = historyCount();
        CountDownLatch loaded = new CountDownLatch(1), release = new CountDownLatch(1);
        AnalysisService delayed = mock(AnalysisService.class, delegatesTo(analyses));
        doAnswer(call -> {
            Analysis read = analyses.getAnalysisById("1");
            assertNotNull(read);
            assertNotNull(read.getSampleItem().getLastupdated());
            loaded.countDown();
            if (!release.await(30, TimeUnit.SECONDS)) throw new IllegalStateException("Competing commit was not released");
            return read;
        }).when(delayed).getAnalysisById("1");
        ReflectionTestUtils.setField(serviceTarget, "analysisService", delayed);
        SecurityContext security = SecurityContextHolder.getContext();
        var executor = Executors.newSingleThreadExecutor();
        try {
            var attempt = executor.submit(() -> {
                SecurityContextHolder.setContext(security);
                try {
                    service.cancelTest(form(), "1", request);
                    return (Throwable) null;
                } catch (Throwable conflict) {
                    return conflict;
                } finally {
                    SecurityContextHolder.clearContext();
                }
            });
            assertTrue("Cancellation must load a real version before the rival commits", loaded.await(30, TimeUnit.SECONDS));
            jdbcTemplate.update("update clinlims." + table + " set status_id=?,lastupdated=lastupdated+interval '1 second' where id=1",
                    Integer.parseInt(rivalStatus));
            release.countDown();
            Throwable failure = attempt.get(30, TimeUnit.SECONDS);
            assertNotNull("An optimistic conflict must prevent a success response", failure);
            assertTrue(failure instanceof Exception);
            var error = controller.handleGeneralException((Exception) failure);
            assertEquals("An ORM-wrapped optimistic failure must still be a stable 409", 409, error.getStatusCode().value());
            assertEquals("SAMPLE_MANAGEMENT_CONFLICT", error.getBody().getCode());
            assertEquals("analysis".equals(table) ? rivalStatus : initialAnalysis, analysisState());
            assertEquals("sample_item".equals(table) ? rivalStatus : initialTube, tubeState());
            assertEquals(histories, historyCount());
        } finally {
            release.countDown();
            executor.shutdownNow();
            assertTrue(executor.awaitTermination(30, TimeUnit.SECONDS));
            ReflectionTestUtils.setField(serviceTarget, "analysisService", analyses);
        }
    }

    private MockHttpServletRequest authenticatedRequest() {
        var principal = User.withUsername("admin").password("test-only").roles("ADMIN").build();
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
        SecurityContextHolder.setContext(context);
        var result = new MockHttpServletRequest();
        UserSessionData actor = new UserSessionData();
        actor.setSytemUserId(1);
        actor.setLoginName("admin");
        result.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, actor);
        result.getSession().setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);
        return result;
    }

    private CancelTestForm form() { return new CancelTestForm("1", "1"); }
    private String analysisState() { return jdbcTemplate.queryForObject("select status_id::text from clinlims.analysis where id=1", String.class); }
    private String tubeState() { return jdbcTemplate.queryForObject("select status_id::text from clinlims.sample_item where id=1", String.class); }
    private long historyCount() { return jdbcTemplate.queryForObject("""
            select count(*) from clinlims.history h join clinlims.reference_tables r on r.id=h.reference_table
            where h.reference_id=1 and upper(r.name)='ANALYSIS'
            """, Long.class); }
}
