package org.openelisglobal.sample.service;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.sample.dao.OrderDashboardDAO;
import org.openelisglobal.sample.form.OrderDashboardCriteria;
import org.openelisglobal.sample.form.OrderDashboardQuery;
import org.openelisglobal.sample.form.OrderDashboardRecord;
import org.openelisglobal.sample.service.impl.OrderDashboardServiceImpl;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;

public class OrderDashboardServiceTest {
    private OrderDashboardDAO dao;
    private OrderDashboardAccess access;
    private SpecimenIntakeDecisionReader decisions;
    private OrderDashboardService service;
    private MockHttpServletRequest request;
    private OrderDashboardAccess.Scope scope;

    @Before
    public void setUp() {
        dao = mock(OrderDashboardDAO.class);
        access = mock(OrderDashboardAccess.class);
        decisions = mock(SpecimenIntakeDecisionReader.class);
        request = new MockHttpServletRequest();
        scope = new OrderDashboardAccess.Scope(null, List.of("1"), List.of("3"), false);
        when(access.bind(request)).thenReturn(scope);
        when(dao.findPage(any())).thenReturn(List.of());
        when(dao.tubes(anyList(), anyList())).thenReturn(Map.of());
        when(decisions.read(anyString(), anyString(), any(), anyList())).thenReturn(List.of());
        service = new OrderDashboardServiceImpl(dao, access, decisions);
    }

    private OrderDashboardQuery query(String status) {
        return new OrderDashboardQuery(2, 25, null, null, status, null, false, null, null);
    }

    private OrderDashboardRecord row(boolean labelled, boolean qa) {
        return new OrderDashboardRecord("42", "SIM-42", Timestamp.valueOf("2026-09-01 12:00:00"), null, null, "小明", "王",
                "SIM", true, true, true, labelled, qa, false, false, false, false, "7");
    }

    @Test public void keepsDatabaseTotalAndSharesAuthorizedCriteriaForPageAndCount() {
        when(dao.count(any())).thenReturn(63L); when(dao.findPage(any())).thenReturn(List.of(row(false, true)));
        var result = service.getDashboard(query(null), request);
        assertEquals(63, result.totalCount()); assertEquals(2, result.page());
        assertEquals("label_pending", result.orders().get(0).specimenIntakeStatus());
        assertFalse(result.orders().get(0).stepProgress().get("label"));
        assertFalse(result.orders().get(0).stepProgress().get("qa"));
        assertEquals("王小明", result.orders().get(0).patientName());
        var capture = ArgumentCaptor.forClass(OrderDashboardCriteria.class);
        verify(dao).count(capture.capture()); verify(dao).findPage(same(capture.getValue()));
        assertEquals(25, capture.getValue().offset()); assertEquals(List.of("1"), capture.getValue().testIds());
        verify(access).requireUnchanged(request, scope);
    }

    @Test public void maskIsAppliedAndARecordedAcceptanceNeverBecomesCurrentAcceptance() {
        when(access.bind(request)).thenReturn(new OrderDashboardAccess.Scope(null, List.of("1"), List.of("3"), true));
        when(dao.findPage(any())).thenReturn(List.of(row(true, true)));
        when(decisions.read(eq("42"), eq("SIM-42"), eq("7"), anyList())).thenReturn(List.of(
            new SpecimenIntakeDecisionReader.Tube("8", "RECORDED", "ACCEPTED", "operation", null, "1", "date", false, "hash"),
            new SpecimenIntakeDecisionReader.Tube("9", "NOT_RECORDED", null, null, null, null, null, false, null),
            new SpecimenIntakeDecisionReader.Tube("10", "REVIEW_REQUIRED", null, null, null, null, null, false, null)));
        var row = service.getDashboard(query(null), request).orders().get(0);
        assertEquals("---", row.patientName()); assertEquals("checklist_complete", row.specimenIntakeStatus());
        assertEquals(1, row.specimenDecisions().acceptedRecorded()); assertEquals(1, row.specimenDecisions().notRecorded());
        assertEquals(1, row.specimenDecisions().reviewRequired()); assertFalse(row.specimenDecisions().currentAcceptanceVerified());
        assertEquals("generated_counter_not_physical_print", row.labelEvidenceScope());
        assertEquals("stored_checklist_snapshot_not_acceptance", row.qaVerificationScope());
    }

    @Test(expected = AccessDeniedException.class)
    public void changedActorCannotReceiveAlreadyBuiltPage() {
        doThrow(new AccessDeniedException("changed")).when(access).requireUnchanged(request, scope);
        service.getDashboard(query(null), request);
    }

    @Test
    public void rejectsInvalidFiltersBeforeAccessOrDatabaseRead() {
        for (var q : List.of(new OrderDashboardQuery(0, 25, null, null, null, null, false, null, null),
                new OrderDashboardQuery(1, 26, null, null, null, null, false, null, null),
                new OrderDashboardQuery(1, 25, null, null, null, null, false, "2026-02-30", null),
                new OrderDashboardQuery(1, 25, null, null, "invented", null, false, null, null))) {
            try {
                service.getDashboard(q, request);
                fail("invalid query accepted");
            } catch (IllegalArgumentException expected) {
            }
        }
        verifyZeroInteractions(dao);
        verifyZeroInteractions(access);
    }

    @Test
    public void literalSearchAndDateBoundsReachDaoWithoutReinterpretation() {
        service.getDashboard(new OrderDashboardQuery(1, 100, "  SIM_%  ", "pending_qa", "qa_pending", "STAT", true,
                "2026-09-01", "2026-09-02"), request);
        var capture = ArgumentCaptor.forClass(OrderDashboardCriteria.class);
        verify(dao).count(capture.capture());
        assertEquals("SIM_%", capture.getValue().search());
        assertEquals(List.of("qa_pending"), capture.getValue().intakeStatuses());
        assertEquals(java.sql.Date.valueOf("2026-09-01"), capture.getValue().startDate());
    }
}
