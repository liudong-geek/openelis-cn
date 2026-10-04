package org.openelisglobal.sampleitem.service;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.sample.service.SampleEditAuthorizationService;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.dao.SampleItemDAO;
import org.openelisglobal.sampleitem.dto.CancelTestResponse;
import org.openelisglobal.sampleitem.dto.SampleItemDTO;
import org.openelisglobal.sampleitem.dto.SearchSamplesResponse;
import org.openelisglobal.sampleitem.dto.TestSummaryDTO;
import org.openelisglobal.sampleitem.form.CancelTestForm;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;

/** State categories and current permissions, never client labels, authorize cancellation. */
public class SampleManagementStatusContractTest {
    private SampleManagementServiceImpl service;
    private SampleService samples;
    private SampleItemDAO items;
    private AnalysisService analyses;
    private IStatusService statuses;
    private SampleEditAuthorizationService authorization;
    private EntityManager entityManager;
    private Sample sample;
    private SampleItem tube;
    private Analysis analysis;
    private MockHttpServletRequest request;
    private Map<String, AnalysisStatus> analysisStates;
    private Map<String, SampleStatus> tubeStates;

    @Before
    public void prepare() {
        service = new SampleManagementServiceImpl();
        samples = mock(SampleService.class);
        items = mock(SampleItemDAO.class);
        analyses = mock(AnalysisService.class);
        statuses = mock(IStatusService.class);
        authorization = mock(SampleEditAuthorizationService.class);
        entityManager = mock(EntityManager.class);
        ReflectionTestUtils.setField(service, "sampleService", samples);
        ReflectionTestUtils.setField(service, "sampleItemDAO", items);
        ReflectionTestUtils.setField(service, "analysisService", analyses);
        ReflectionTestUtils.setField(service, "statusService", statuses);
        ReflectionTestUtils.setField(service, "authorization", authorization);
        ReflectionTestUtils.setField(service, "entityManager", entityManager);
        analysisStates = new HashMap<>();
        tubeStates = new HashMap<>();
        for (AnalysisStatus state : AnalysisStatus.values()) {
            String id = Integer.toString(975000 + state.ordinal());
            analysisStates.put(id, state);
            when(statuses.getStatusID(state)).thenReturn(id);
        }
        for (SampleStatus state : SampleStatus.values()) {
            String id = Integer.toString(976000 + state.ordinal());
            tubeStates.put(id, state);
            when(statuses.getStatusID(state)).thenReturn(id);
        }
        when(statuses.getAnalysisStatusForID(any())).thenAnswer(call -> analysisStates.get(call.getArgument(0)));
        when(statuses.getSampleStatusForID(any())).thenAnswer(call -> tubeStates.get(call.getArgument(0)));
        sample = new Sample();
        sample.setId("91");
        sample.setAccessionNumber("CHG069-UNIT");
        tube = new SampleItem();
        tube.setId("92");
        tube.setSample(sample);
        tube.setExternalId("CHG069-UNIT-1");
        tube.setStatusId(statuses.getStatusID(SampleStatus.Entered));
        analysis = new Analysis();
        analysis.setId("93");
        analysis.setSampleItem(tube);
        analysis.setStatusId(statuses.getStatusID(AnalysisStatus.NotStarted));
        var test = new org.openelisglobal.test.valueholder.Test();
        test.setId("94");
        test.setDescription("CHG069 unit test");
        analysis.setTest(test);
        when(samples.getSampleByAccessionNumber("CHG069-UNIT")).thenReturn(sample);
        when(items.getSampleItemsBySampleId("91")).thenReturn(List.of(tube));
        when(items.getSampleItemsWithHierarchy(List.of("92"))).thenReturn(List.of(tube));
        when(items.getRecentSampleItems(2)).thenReturn(List.of(tube));
        when(analyses.getAnalysesBySampleItem(tube)).thenReturn(List.of(analysis));
        when(analyses.getAnalysisById("93")).thenReturn(analysis);
        when(analyses.update(any())).thenAnswer(call -> call.getArgument(0));
        request = new MockHttpServletRequest();
    }

    @Test
    public void dynamicIdsResolveToCategoriesAndStrictCapabilities() {
        SampleItemDTO dto = service.searchByAccessionNumber("CHG069-UNIT", true).getSampleItems().get(0);
        assertEquals(statuses.getStatusID(SampleStatus.Entered), dto.getStatusId());
        assertEquals("Entered", dto.getStatusCode());
        assertEquals(statuses.getStatusID(AnalysisStatus.NotStarted), dto.getOrderedTests().get(0).getStatus());
        assertEquals("NotStarted", dto.getOrderedTests().get(0).getStatusCode());
        assertTrue(dto.getOrderedTests().get(0).isCanCancelByStatus());
    }

    @Test
    public void recentListUsesSameContractWithoutInventingPermission() {
        var response = service.listRecentSampleItems(2, true);
        assertFalse(response.isCanCancelTests());
        assertEquals("Entered", response.getSampleItems().get(0).getStatusCode());
        assertEquals("NotStarted", response.getSampleItems().get(0).getOrderedTests().get(0).getStatusCode());
    }

    @Test
    public void cancelledRowsRemainVisibleWithAuthoritativeCancelledStatus() {
        analysis.setStatusId(statuses.getStatusID(AnalysisStatus.Canceled));
        var row = service.searchByAccessionNumber("CHG069-UNIT", true).getSampleItems().get(0).getOrderedTests().get(0);
        assertEquals("Canceled", row.getStatusCode());
        assertFalse(row.isCanCancelByStatus());
    }

    @Test
    public void nullUnknownAndWrongCategoryStatesFailClosed() {
        for (String status : new String[] {null, "", "unknown", statuses.getStatusID(SampleStatus.Entered)}) {
            analysis.setStatusId(status);
            var row = service.searchByAccessionNumber("CHG069-UNIT", true).getSampleItems().get(0).getOrderedTests().get(0);
            assertEquals("UNKNOWN", row.getStatusCode());
            assertFalse(row.isCanCancelByStatus());
            assertThrows(SampleManagementConflictException.class, () -> cancel());
        }
        verify(analyses, never()).update(any());
    }

    @Test
    public void everyAnalysisStateUsesExistingNotStartedAndTechnicalAcceptanceRule() {
        for (AnalysisStatus state : AnalysisStatus.values()) {
            analysis.setStatusId(statuses.getStatusID(state));
            var row = service.searchByAccessionNumber("CHG069-UNIT", true).getSampleItems().get(0).getOrderedTests().get(0);
            assertEquals(state.name(), row.getStatusCode());
            assertEquals(state == AnalysisStatus.NotStarted || state == AnalysisStatus.TechnicalAcceptance,
                    row.isCanCancelByStatus());
        }
    }

    @Test
    public void nonEnteredUnknownAndWrongCategoryTubesCannotCancelAnyTests() {
        for (String status : new String[] { statuses.getStatusID(SampleStatus.SampleRejected),
                statuses.getStatusID(SampleStatus.Canceled), statuses.getStatusID(SampleStatus.Disposed),
                null, "", "unknown", statuses.getStatusID(AnalysisStatus.NotStarted) }) {
            tube.setStatusId(status);
            var dto = service.searchByAccessionNumber("CHG069-UNIT", true).getSampleItems().get(0);
            assertFalse(dto.getOrderedTests().get(0).isCanCancelByStatus());
            assertThrows(SampleManagementConflictException.class, () -> cancel());
        }
        verify(analyses, never()).update(any());
    }

    @Test
    public void successfulCancellationReturnsMatchingTubeAndCancelledTestAndAuditActor() {
        for (AnalysisStatus initial : List.of(AnalysisStatus.NotStarted, AnalysisStatus.TechnicalAcceptance)) {
            analysis.setStatusId(statuses.getStatusID(initial));
            CancelTestResponse response = cancel();
            assertTrue(response.isSuccess());
            assertEquals("93", response.getAnalysisId());
            assertEquals("92", response.getSampleItemId());
            assertEquals("CHG069 unit test", response.getTestName());
            assertEquals("93", response.getTest().getAnalysisId());
            assertEquals("Canceled", response.getTest().getStatusCode());
            assertEquals(statuses.getStatusID(AnalysisStatus.Canceled), response.getTest().getStatus());
            assertFalse(response.getTest().isCanCancelByStatus());
            assertEquals("7", analysis.getSysUserId());
        }
        verify(authorization, times(4)).requireWrite(request, "7");
        verify(entityManager, times(2)).lock(tube, LockModeType.OPTIMISTIC);
        verify(entityManager, times(2)).detach(analysis);
        verify(analyses, times(2)).update(analysis);
    }

    @Test
    public void currentStateOverridesPreviouslyLoadedCapability() {
        assertTrue(service.searchByAccessionNumber("CHG069-UNIT", true).getSampleItems().get(0).getOrderedTests().get(0)
                .isCanCancelByStatus());
        analysis.setStatusId(statuses.getStatusID(AnalysisStatus.Finalized));
        assertThrows(SampleManagementConflictException.class, () -> cancel());
        assertEquals(statuses.getStatusID(AnalysisStatus.Finalized), analysis.getStatusId());
        verify(analyses, never()).update(any());
    }

    @Test
    public void mismatchedOrMissingAnalysisDoesNotWrite() {
        assertThrows(IllegalArgumentException.class,
                () -> service.cancelTest(new CancelTestForm("93", "999"), "7", request));
        when(analyses.getAnalysisById("93")).thenReturn(null);
        assertThrows(IllegalArgumentException.class, () -> cancel());
        verify(analyses, never()).update(any());
    }

    @Test
    public void malformedOrUnsupportedIdentifiersFailBeforeClinicalDataLookup() {
        for (String id : new String[] { null, "", "0", "-1", "01", " 93 ", "name", "1.0",
                "2147483648", "9999999999999999999999999999999999999999" }) {
            assertThrows(IllegalArgumentException.class,
                    () -> service.cancelTest(new CancelTestForm(id, "92"), "7", request));
            assertThrows(IllegalArgumentException.class,
                    () -> service.cancelTest(new CancelTestForm("93", id), "7", request));
        }
        assertThrows(IllegalArgumentException.class, () -> service.cancelTest(null, "7", request));
        verifyZeroInteractions(analyses, entityManager);
    }

    @Test
    public void permissionIsCheckedBeforeClinicalDataLookupOrWrites() {
        doThrow(new AccessDeniedException("revoked")).when(authorization).requireWrite(request, "7");
        assertThrows(AccessDeniedException.class, () -> cancel());
        verify(analyses, never()).getAnalysisById(any());
        verify(analyses, never()).update(any());
        verifyZeroInteractions(entityManager);
    }

    @Test
    public void permissionsChangedBeforePersistenceAbortWithoutChangingAnalysis() {
        doNothing().doThrow(new AccessDeniedException("revoked during operation"))
                .when(authorization).requireWrite(request, "7");
        String initial = analysis.getStatusId();
        assertThrows(AccessDeniedException.class, () -> cancel());
        assertEquals(initial, analysis.getStatusId());
        verify(analyses, never()).update(any());
        verify(authorization, times(2)).requireWrite(request, "7");
    }

    @Test
    public void missingOrWrongCancelledConfigurationCannotPersistInvalidStatus() {
        for (String target : new String[] { null, "", "-1", statuses.getStatusID(SampleStatus.Canceled) }) {
            when(statuses.getStatusID(AnalysisStatus.Canceled)).thenReturn(target);
            assertThrows(SampleManagementConflictException.class, () -> cancel());
            assertEquals(statuses.getStatusID(AnalysisStatus.NotStarted), analysis.getStatusId());
        }
        verify(analyses, never()).update(any());
    }

    @Test
    public void jsonContractsKeepOldIdentifiersAndEmitStrictBooleanCapabilities() throws Exception {
        var json = new ObjectMapper();
        var dto = service.searchByAccessionNumber("CHG069-UNIT", true);
        var tree = json.valueToTree(dto);
        assertTrue(tree.path("canCancelTests").isBoolean());
        assertFalse(tree.path("canCancelTests").asBoolean());
        assertTrue(tree.path("sampleItems").get(0).path("orderedTests").get(0).path("canCancelByStatus").isBoolean());
        assertEquals(statuses.getStatusID(AnalysisStatus.NotStarted),
                tree.path("sampleItems").get(0).path("orderedTests").get(0).path("status").asText());
        assertEquals("UNKNOWN", new TestSummaryDTO().getStatusCode());
        assertFalse(new TestSummaryDTO().isCanCancelByStatus());
        assertEquals("UNKNOWN", new SampleItemDTO().getStatusCode());
    }

    private CancelTestResponse cancel() {
        return service.cancelTest(new CancelTestForm("93", "92"), "7", request);
    }
}
