package org.openelisglobal.resultvalidation.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.sql.Timestamp;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;
import org.junit.Before;
import org.junit.After;
import org.openelisglobal.common.formfields.FormFields;
import org.springframework.test.util.ReflectionTestUtils;
import org.junit.Test;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.paging.PagingProperties;
import org.openelisglobal.resultvalidation.bean.AnalysisItem;
import org.openelisglobal.resultvalidation.form.ResultValidationForm;
import org.openelisglobal.resultvalidation.util.ResultsValidationUtility;
import org.openelisglobal.qc.dto.QCReleaseBlocker;
import org.openelisglobal.qc.service.QCReleaseGateService;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.test.valueholder.TestSection;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.web.server.ResponseStatusException;

public class ReviewQueryContextServiceTest {
    private Object oldForms;
    private AnalysisService analyses;
    private UserService users;
    private ReviewQueryContextService service;
    private MockHttpSession session;
    private MutableClock clock;
    private boolean authorized;
    private boolean masked;
    private QCReleaseGateService qcReleaseGate;

    @Before public void setup() {
        oldForms = ReflectionTestUtils.getField(FormFields.class, "instance");
        ReflectionTestUtils.setField(FormFields.class, "instance", mock(FormFields.class));
        analyses = mock(AnalysisService.class);
        users = mock(UserService.class);
        PagingProperties paging = mock(PagingProperties.class);
        when(paging.getValidationPageSize()).thenReturn(1);
        clock = new MutableClock();
        qcReleaseGate = mock(QCReleaseGateService.class);
        service = new ReviewQueryContextService(analyses, users, paging, mock(ResultsValidationUtility.class),
                qcReleaseGate, clock, () -> masked);
        session = new MockHttpSession();
        authorized = true;
        when(users.filterAnalysesByLabUnitRoles(anyString(), anyList(), anyString())).thenAnswer(call -> {
            List<Analysis> requested = call.getArgument(1);
            return requested.stream().filter(a -> authorized && a.getTestSection() != null
                    && "10".equals(a.getTestSection().getId())).collect(Collectors.toList());
        });
    }

    @After public void restore() {
        ReflectionTestUtils.setField(FormFields.class, "instance", oldForms);
    }

    @Test public void queriesAndLegacyCacheRemainIndependent() {
        Object legacy = List.of("SIM legacy");
        session.setAttribute(IActionConstants.RESULTS_SESSION_CACHE, legacy);
        ResultValidationForm a = create("SIM-A", row("1", "SIM-A"), row("2", "SIM-A2"));
        ResultValidationForm b = create("SIM-B", row("3", "SIM-B"));
        service.page(session, "7", a, a.getQueryId(), "2");
        assertEquals("2", a.getResultList().get(0).getAnalysisId());
        service.page(session, "7", b, b.getQueryId(), "1");
        assertEquals("3", b.getResultList().get(0).getAnalysisId());
        assertNotEquals(a.getQueryId(), b.getQueryId());
        assertSame(legacy, session.getAttribute(IActionConstants.RESULTS_SESSION_CACHE));
    }

    @Test public void publicDtosCannotMutateStoredSnapshot() {
        ResultValidationForm form = create("SIM-A", row("1", "SIM-A"));
        form.getResultList().get(0).setResult("FAKE");
        form.getResultList().get(0).setIsAccepted(true);
        service.page(session, "7", form, form.getQueryId(), "1");
        assertEquals("3.33", form.getResultList().get(0).getResult());
        assertFalse(form.getResultList().get(0).getIsAccepted());
    }

    @Test public void queryProjectsServerOwnedQcReleaseBlockers() {
        AnalysisItem source = row("1", "SIM-A");
        analyses.get("1").setAnalyzerId("31");
        when(qcReleaseGate.blockersFor(analyses.get("1"))).thenReturn(List.of(new QCReleaseBlocker("v-1", "1_3S",
                "REJECTION", "31", "101", Timestamp.valueOf("2026-09-17 08:00:00"), "ACKNOWLEDGED")));
        ResultValidationForm form = create("SIM-A", source);
        AnalysisItem displayed = form.getResultList().get(0);
        assertEquals("31", displayed.getAnalyzerId());
        assertTrue(displayed.isQcReleaseBlocked());
        assertEquals("v-1", displayed.getQcBlockingViolations().get(0).violationId());

        displayed.setQcBlockingViolations(List.of());
        displayed.setIsAccepted(true);
        AnalysisItem saved = service.consumeForSave(session, "7", form).get(0);
        assertTrue(saved.isQcReleaseBlocked());
        assertEquals("v-1", saved.getQcBlockingViolations().get(0).violationId());
    }

    @Test public void missingForeignActorCriteriaAndInvalidPagesFailClosed() {
        ResultValidationForm form = create("SIM-A", row("1", "SIM-A"));
        reject(409, () -> service.page(session, "7", form, null, "1"));
        reject(409, () -> service.page(session, "8", form, form.getQueryId(), "1"));
        reject(403, () -> service.page(session, null, form, form.getQueryId(), "1"));
        for (String page : new String[] { null, "", "0", "2", "bad", "-1" }) {
            reject(409, () -> service.page(session, "7", form, form.getQueryId(), page));
        }
        form.setAccessionNumber("SIM-B");
        reject(409, () -> service.page(session, "7", form, form.getQueryId(), "1"));
        reject(409, () -> service.consumeForSave(session, "7", form));
        form.setAccessionNumber("SIM-A");
        form.setDoRange(true);
        reject(409, () -> service.page(session, "7", form, form.getQueryId(), "1"));
    }

    @Test public void disclosureConfigurationChangeInvalidatesOldSnapshots() {
        ResultValidationForm form = create("SIM-A", row("1", "SIM-A"));
        masked = true;
        reject(409, () -> service.page(session, "7", form, form.getQueryId(), "1"));
        reject(409, () -> service.consumeForSave(session, "7", form));
    }

    @Test public void expiredContextCannotPageOrSave() {
        ResultValidationForm form = create("SIM-A", row("1", "SIM-A"));
        clock.time += ReviewQueryContextService.LIFETIME_MILLIS;
        reject(409, () -> service.page(session, "7", form, form.getQueryId(), "1"));
        reject(409, () -> service.consumeForSave(session, "7", form));
    }

    @Test public void oldestContextIsEvictedAtBound() {
        ResultValidationForm first = create("SIM-A", row("1", "SIM-A"));
        ResultValidationForm latest = null;
        for (int i = 0; i < ReviewQueryContextService.MAX_CONTEXTS; i++) {
            latest = create("SIM-" + i, row("1", "SIM-" + i));
        }
        reject(409, () -> service.page(session, "7", first, first.getQueryId(), "1"));
        service.page(session, "7", latest, latest.getQueryId(), "1");
    }

    @Test public void freshActualSectionAndPermissionAreRequiredForPageAndSave() {
        ResultValidationForm form = create("SIM-A", row("1", "SIM-A"));
        analyses.get("1").getTestSection().setId("20");
        reject(403, () -> service.page(session, "7", form, form.getQueryId(), "1"));
        reject(403, () -> service.consumeForSave(session, "7", form));
        analyses.get("1").getTestSection().setId("10");
        authorized = false;
        reject(403, () -> service.page(session, "7", form, form.getQueryId(), "1"));
        reject(403, () -> service.consumeForSave(session, "7", form));
    }

    @Test public void initialVisibilityUsesActualSection() {
        AnalysisItem allowed = row("1", "SIM-A");
        AnalysisItem denied = row("2", "SIM-B");
        analyses.get("2").getTestSection().setId("20");
        ResultValidationForm form = create("SIM", allowed, denied);
        assertEquals(1, form.getResultList().size());
        assertEquals("1", form.getResultList().get(0).getAnalysisId());
        assertEquals("1", form.getPaging().getTotalPages());
    }

    @Test public void statusOrVersionChangeRequiresNewQuery() {
        ResultValidationForm form = create("SIM-A", row("1", "SIM-A"));
        analyses.get("1").setLastupdated(new Timestamp(2000));
        reject(409, () -> service.page(session, "7", form, form.getQueryId(), "1"));
        reject(409, () -> service.consumeForSave(session, "7", form));
        analyses.get("1").setLastupdated(new Timestamp(1000));
        analyses.get("1").setStatusId("FINAL");
        reject(409, () -> service.consumeForSave(session, "7", form));
    }

    @Test public void entirePageMustMatchBeforeEditsAreMerged() {
        ResultValidationForm form = create("SIM-A", row("1", "SIM-A"), row("2", "SIM-A"));
        List<AnalysisItem> correct = new ArrayList<>(form.getResultList());
        form.setResultList(List.of(correct.get(0)));
        reject(409, () -> service.consumeForSave(session, "7", form));
        form.setResultList(List.of(correct.get(1), correct.get(0)));
        reject(409, () -> service.consumeForSave(session, "7", form));
        form.setResultList(correct);
        correct.get(1).setTestResultComponentId("999");
        correct.get(0).setIsAccepted(true);
        reject(409, () -> service.consumeForSave(session, "7", form));
        service.page(session, "7", form, form.getQueryId(), "1");
        assertFalse(form.getResultList().get(0).getIsAccepted());
    }

    @Test public void saveOnlyMergesDecisionsAndNotesAndUsesRawStoredValue() {
        AnalysisItem stored = row("1", "SIM-A");
        stored.setResultMembers(List.of(new AnalysisItem.ResultMember("101", "3.33333", "N", "11", null, null)));
        ResultValidationForm form = create("SIM-A", stored);
        AnalysisItem posted = form.getResultList().get(0);
        posted.setIsAccepted(true);
        posted.setNote("SIM note");
        posted.setResult("9999");
        posted.setRawResultValue("9999");
        posted.setStatusId("FORGED");
        posted.setQualifiedResultId("FORGED");
        posted.setSampleItemId("FORGED");
        posted.setResultMembers(List.of());
        List<AnalysisItem> saved = service.consumeForSave(session, "7", form);
        assertTrue(saved.get(0).getIsAccepted());
        assertEquals("SIM note", saved.get(0).getNote());
        assertEquals("3.33333", saved.get(0).getResult());
        assertEquals("READY", saved.get(0).getStatusId());
        assertEquals("21", saved.get(0).getSampleItemId());
        assertNull(saved.get(0).getQualifiedResultId());
        assertEquals(1, saved.get(0).getResultMembers().size());
        reject(409, () -> service.consumeForSave(session, "7", form));
    }

    @Test public void jsonRoundTripKeepsIdentityAndRestoresServerOnlyEvidence() throws Exception {
        ResultValidationForm form = create("SIM-A", row("1", "SIM-A"));
        ObjectMapper mapper = new ObjectMapper();
        ResultValidationForm posted = mapper.readValue(mapper.writeValueAsString(form), ResultValidationForm.class);
        assertNull(posted.getResultList().get(0).getSampleItemId());
        assertNull(posted.getResultList().get(0).getRawResultValue());
        posted.getResultList().get(0).setIsAccepted(true);
        AnalysisItem saved = service.consumeForSave(session, "7", posted).get(0);
        assertEquals("21", saved.getSampleItemId());
        assertEquals("3.33333", saved.getResult());
    }

    @Test public void oneQuerySaveNeverConsumesOtherQuery() {
        ResultValidationForm a = create("SIM-A", row("1", "SIM-A"));
        ResultValidationForm b = create("SIM-B", row("2", "SIM-B"));
        a.getResultList().get(0).setIsAccepted(true);
        assertEquals("1", service.consumeForSave(session, "7", a).get(0).getAnalysisId());
        service.page(session, "7", b, b.getQueryId(), "1");
        assertFalse(b.getResultList().get(0).getIsAccepted());
    }

    @Test public void concurrentSubmissionsConsumeExactlyOnce() throws Exception {
        ResultValidationForm form = create("SIM-A", row("1", "SIM-A"));
        var pool = Executors.newFixedThreadPool(2);
        try {
            Callable<Integer> submit = () -> {
                try { service.consumeForSave(session, "7", form); return 1; }
                catch (ResponseStatusException e) { assertEquals(409, e.getStatusCode().value()); return 0; }
            };
            var attempts = pool.invokeAll(List.of(submit, submit));
            assertEquals(1, (int) attempts.get(0).get() + attempts.get(1).get());
        } finally { pool.shutdownNow(); }
    }

    @Test public void contradictoryAndReadOnlyDecisionsAreRejected() {
        ResultValidationForm form = create("SIM-A", row("1", "SIM-A"));
        form.getResultList().get(0).setIsAccepted(true);
        form.getResultList().get(0).setIsRejected(true);
        reject(409, () -> service.consumeForSave(session, "7", form));
        AnalysisItem readOnly = row("2", "SIM-B");
        readOnly.setReadOnly(true);
        ResultValidationForm restricted = create("SIM-B", readOnly);
        restricted.getResultList().get(0).setReadOnly(false);
        restricted.getResultList().get(0).setIsAccepted(true);
        reject(409, () -> service.consumeForSave(session, "7", restricted));
    }

    @Test public void emptyQueryHasOwnContextAndCannotReuseEarlierRows() {
        ResultValidationForm a = create("SIM-A", row("1", "SIM-A"));
        ResultValidationForm empty = create("SIM-missing");
        assertNotNull(empty.getQueryId());
        assertTrue(empty.getResultList().isEmpty());
        reject(409, () -> service.consumeForSave(session, "7", empty));
        service.page(session, "7", a, a.getQueryId(), "1");
        assertEquals("1", a.getResultList().get(0).getAnalysisId());
    }

    private ResultValidationForm create(String accession, AnalysisItem... rows) {
        ResultValidationForm form = new ResultValidationForm();
        form.setAccessionNumber(accession);
        form.setDoRange(false);
        service.create(session, "7", form, List.of(rows), masked);
        return form;
    }

    private AnalysisItem row(String id, String accession) {
        Analysis analysis = new Analysis();
        analysis.setId(id);
        analysis.setStatusId("READY");
        analysis.setLastupdated(new Timestamp(1000));
        TestSection section = new TestSection();
        section.setId("10");
        analysis.setTestSection(section);
        when(analyses.get(id)).thenReturn(analysis);
        AnalysisItem row = new AnalysisItem();
        row.setAnalysisId(id);
        row.setAccessionNumber(accession);
        row.setTestId("10" + id);
        row.setResultId("20" + id);
        row.setTestResultComponentId("11");
        row.setSampleId("20");
        row.setSampleItemId("21");
        row.setResult("3.33");
        row.setRawResultValue("3.33333");
        row.setResultType("N");
        row.setAnalysisLastupdated("1000");
        row.setStatusId("READY");
        return row;
    }

    private void reject(int status, Runnable operation) {
        try { operation.run(); fail("Expected HTTP " + status); }
        catch (ResponseStatusException e) { assertEquals(status, e.getStatusCode().value()); }
    }

    private static class MutableClock extends Clock {
        long time = 10000;
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return Instant.ofEpochMilli(time); }
    }
}
