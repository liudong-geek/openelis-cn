package org.openelisglobal.sample.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.persistence.EntityManager;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.login.dao.UserModuleService;
import org.openelisglobal.sample.action.util.SampleUtil;
import org.openelisglobal.sample.bean.SampleEditItem;
import org.openelisglobal.sample.bean.SampleOrderItem;
import org.openelisglobal.sample.form.SampleEditForm;
import org.openelisglobal.sample.valueholder.OrderPriority;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.service.SampleItemService;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.validation.Errors;

/**
 * Request display flags and row order cannot authorize changes to persisted
 * tubes.
 */
public class SampleEditActionGuardTest {
    private static final String ACTOR = "7";
    private static final String ACCESSION = "DEMO260001";
    private static final List<String> CANCELLATION_ROLES = List.of("Validator", "Validation", "Biologist");
    private Object oldFactory;
    private SampleEditServiceImpl service;
    private SampleService samples;
    private SampleItemService items;
    private AnalysisService analyses;
    private UserRoleService roles;
    private UserModuleService modules;
    private SampleUtil sampleUtil;
    private SampleEditAuthorizationService authorization;
    private EntityManager entityManager;
    private MockHttpServletRequest request;
    private SampleEditForm form;
    private Sample sample;
    private SampleItem tube;
    private Analysis analysis;

    @Before
    public void setUp() {
        oldFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        AutowireCapableBeanFactory factory = mock(AutowireCapableBeanFactory.class);
        IStatusService statuses = mock(IStatusService.class);
        when(statuses.getStatusID(AnalysisStatus.Canceled)).thenReturn("analysis-canceled");
        when(statuses.getStatusID(SampleStatus.Canceled)).thenReturn("sample-canceled");
        when(statuses.matches("not-started", AnalysisStatus.NotStarted)).thenReturn(true);
        when(statuses.matches("analysis-canceled", AnalysisStatus.Canceled)).thenReturn(true);
        when(statuses.matches("entered", SampleStatus.Entered)).thenReturn(true);
        when(factory.getBean(IStatusService.class)).thenReturn(statuses);
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        service = new SampleEditServiceImpl();
        samples = mock(SampleService.class);
        items = mock(SampleItemService.class);
        analyses = mock(AnalysisService.class);
        roles = mock(UserRoleService.class);
        modules = mock(UserModuleService.class);
        sampleUtil = mock(SampleUtil.class);
        authorization = mock(SampleEditAuthorizationService.class);
        entityManager = mock(EntityManager.class);
        ReflectionTestUtils.setField(service, "sampleService", samples);
        ReflectionTestUtils.setField(service, "sampleItemService", items);
        ReflectionTestUtils.setField(service, "analysisService", analyses);
        ReflectionTestUtils.setField(service, "userRoleService", roles);
        ReflectionTestUtils.setField(service, "userModuleService", modules);
        ReflectionTestUtils.setField(service, "sampleUtil", sampleUtil);
        ReflectionTestUtils.setField(service, "authorization", authorization);
        ReflectionTestUtils.setField(service, "entityManager", entityManager);
        ReflectionTestUtils.setField(service, "testService", mock(TestService.class));
        sample = new Sample();
        sample.setId("1");
        sample.setAccessionNumber(ACCESSION);
        sample.setPriority(OrderPriority.ROUTINE);
        sample.setSysUserId("original-actor");
        when(samples.getSampleByAccessionNumber(ACCESSION)).thenReturn(sample);
        tube = tube("11", sample);
        analysis = analysis("101", tube, "not-started");
        when(analyses.getAnalysesBySampleItem(tube)).thenReturn(List.of(analysis));
        request = new MockHttpServletRequest();
        form = mock(SampleEditForm.class);
        when(form.getAccessionNumber()).thenReturn(ACCESSION);
        when(form.getExistingTests()).thenReturn(new ArrayList<>());
        when(form.getPossibleTests()).thenReturn(new ArrayList<>());
        SampleOrderItem orderInfo = new SampleOrderItem();
        orderInfo.setPriority(OrderPriority.STAT);
        when(form.getSampleOrderItems()).thenReturn(orderInfo);
    }

    @After
    public void tearDown() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", oldFactory);
    }

    @Test
    public void forgedCancellationFlagsCannotCancelAnalysisWithResults() {
        analysis.setStatusId("finalized");
        SampleEditItem row = row(tube, analysis);
        row.setCanceled(true);
        row.setCanCancel(true);
        when(form.getAbleToCancelResults()).thenReturn(true);
        when(form.getExistingTests()).thenReturn(List.of(row));
        assertRejectedWithoutWrites();
        assertEquals("finalized", analysis.getStatusId());
    }

    @Test
    public void currentAnalysisStatusOverridesThePreviouslyLoadedNotStartedRow() {
        SampleEditItem row = row(tube, analysis);
        row.setCanceled(true);
        row.setStatus("not-started");
        when(form.getExistingTests()).thenReturn(List.of(row));
        analysis.setStatusId("technical-acceptance");
        assertRejectedWithoutWrites();
    }

    @Test
    public void ordinaryUserCanCancelNotStartedAnalysisWithoutClientPermissionFlags() {
        SampleEditItem row = row(tube, analysis);
        row.setCanceled(true);
        when(form.getExistingTests()).thenReturn(List.of(row));
        validateActions();
        assertFalse(row.isCanCancel());
        verify(roles).userInRole(ACTOR, CANCELLATION_ROLES);
    }

    @Test
    public void existingValidatorValidationAndBiologistRolesCanCancelCompletedAnalysis() {
        analysis.setStatusId("finalized");
        SampleEditItem row = row(tube, analysis);
        row.setCanceled(true);
        when(form.getExistingTests()).thenReturn(List.of(row));
        for (String assignedRole : CANCELLATION_ROLES) {
            when(roles.userInRole(eq(ACTOR), anyCollection())).thenAnswer(
                    invocation -> ((java.util.Collection<?>) invocation.getArgument(1)).contains(assignedRole));
            validateActions();
        }
    }

    @Test
    public void existingAdministratorCanCancelCompletedAnalysis() {
        analysis.setStatusId("finalized");
        SampleEditItem row = row(tube, analysis);
        row.setCanceled(true);
        when(form.getExistingTests()).thenReturn(List.of(row));
        enableAdministrator();
        validateActions();
        verify(modules).isUserAdmin(request);
        verify(roles, never()).userInRole(eq(ACTOR), anyCollection());
    }

    @Test
    public void omittedCompletedAnalysisPreventsWholeTubeRemovalForOrdinaryUser() {
        Analysis omitted = analysis("102", tube, "finalized");
        when(analyses.getAnalysesBySampleItem(tube)).thenReturn(List.of(analysis, omitted));
        SampleEditItem row = row(tube, analysis);
        row.setRemoveSample(true);
        row.setCanRemoveSample(true);
        when(form.getExistingTests()).thenReturn(List.of(row));
        assertRejectedWithoutWrites();
        assertEquals("entered", tube.getStatusId());
        assertEquals("finalized", omitted.getStatusId());
    }

    @Test
    public void administratorRetainsExistingWholeTubeCancellationPrivilege() {
        Analysis completed = analysis("102", tube, "finalized");
        when(analyses.getAnalysesBySampleItem(tube)).thenReturn(List.of(analysis, completed));
        SampleEditItem row = row(tube, analysis);
        row.setRemoveSample(true);
        when(form.getExistingTests()).thenReturn(List.of(row));
        enableAdministrator();
        validateActions();
    }

    @Test
    public void previouslyCanceledAnalysisDoesNotBlockWholeTubeRemoval() {
        Analysis canceled = analysis("102", tube, "analysis-canceled");
        when(analyses.getAnalysesBySampleItem(tube)).thenReturn(List.of(analysis, canceled));
        SampleEditItem row = row(tube, analysis);
        row.setRemoveSample(true);
        when(form.getExistingTests()).thenReturn(List.of(row));
        validateActions();
    }

    @Test
    public void analysisFromAnotherTubeCannotBeCanceledUsingTheCurrentTubeId() {
        SampleItem otherTube = tube("12", sample);
        Analysis otherAnalysis = analysis("102", otherTube, "not-started");
        SampleEditItem row = row(tube, otherAnalysis);
        row.setCanceled(true);
        when(form.getExistingTests()).thenReturn(List.of(row));
        assertRejectedWithoutWrites();
        assertEquals("not-started", otherAnalysis.getStatusId());
    }

    @Test
    public void foreignOrderTubeCannotHaveItsCollectionDateChanged() {
        Sample otherOrder = new Sample();
        otherOrder.setId("2");
        SampleItem foreignTube = tube("12", otherOrder);
        SampleEditItem row = row(foreignTube, null);
        row.setSampleItemChanged(true);
        row.setCollectionDate("2026/10/01");
        when(form.getExistingTests()).thenReturn(List.of(row));
        assertRejectedWithoutWrites();
    }

    @Test
    public void foreignOrderTubeCannotHaveTestsAdded() {
        Sample otherOrder = new Sample();
        otherOrder.setId("2");
        SampleItem foreignTube = tube("12", otherOrder);
        SampleEditItem row = row(foreignTube, null);
        row.setAdd(true);
        row.setTestId("21");
        when(form.getPossibleTests()).thenReturn(List.of(row));
        assertRejectedWithoutWrites();
    }

    @Test
    public void foreignOrderTubeCannotBeCanceledEvenByAdministrator() {
        Sample otherOrder = new Sample();
        otherOrder.setId("2");
        SampleItem foreignTube = tube("12", otherOrder);
        Analysis foreignAnalysis = analysis("102", foreignTube, "not-started");
        SampleEditItem row = row(foreignTube, foreignAnalysis);
        row.setRemoveSample(true);
        when(form.getExistingTests()).thenReturn(List.of(row));
        enableAdministrator();
        assertRejectedWithoutWrites();
    }

    @Test
    public void missingAnalysisCannotBeCanceled() {
        SampleEditItem row = row(tube, null);
        row.setAnalysisId("999");
        row.setCanceled(true);
        when(form.getExistingTests()).thenReturn(List.of(row));
        assertRejectedWithoutWrites();
    }

    @Test
    public void tubeNoLongerEnteredCannotBeChangedEvenByAdministrator() {
        tube.setStatusId("sample-canceled");
        SampleEditItem row = row(tube, analysis);
        row.setRemoveSample(true);
        when(form.getExistingTests()).thenReturn(List.of(row));
        enableAdministrator();
        assertRejectedWithoutWrites();
    }

    @Test
    public void previouslyCanceledAnalysisCannotBeCanceledAgain() {
        analysis.setStatusId("analysis-canceled");
        SampleEditItem row = row(tube, analysis);
        row.setCanceled(true);
        when(form.getExistingTests()).thenReturn(List.of(row));
        enableAdministrator();
        assertRejectedWithoutWrites();
    }

    @Test
    public void wholeTubeCancellationUsesPersistedAnalysisIdsAndIgnoresClientRowOrder() {
        Analysis omitted = analysis("102", tube, "not-started");
        when(analyses.getAnalysesBySampleItem(tube)).thenReturn(List.of(analysis, omitted));
        SampleItem untouchedTube = tube("12", sample);
        Analysis untouchedAnalysis = analysis("103", untouchedTube, "not-started");
        SampleEditItem removeRow = row(tube, analysis);
        removeRow.setRemoveSample(true);
        SampleEditItem untouchedRow = row(untouchedTube, untouchedAnalysis);
        // The old algorithm propagated removal through subsequent rows lacking a
        // client-provided accession header, including this different tube.
        List<SampleEditItem> reorderedRows = List.of(removeRow, untouchedRow, removeRow);
        when(form.getExistingTests()).thenReturn(reorderedRows);
        validateActions();
        List<Analysis> canceledAnalyses = new ArrayList<>();
        List<SampleItem> canceledItems = ReflectionTestUtils.invokeMethod(service, "createCancelSampleList",
                reorderedRows, canceledAnalyses, ACTOR);
        assertEquals(List.of("11"), canceledItems.stream().map(SampleItem::getId).collect(Collectors.toList()));
        assertEquals(List.of("101", "102"),
                canceledAnalyses.stream().map(Analysis::getId).collect(Collectors.toList()));
        assertEquals("not-started", untouchedAnalysis.getStatusId());
        assertEquals("entered", untouchedTube.getStatusId());
        verify(entityManager, never()).detach(untouchedAnalysis);
    }

    @Test
    public void failedActionGuardDoesNotRenameTheOrderOrValidateTheNewAccession() {
        analysis.setStatusId("finalized");
        SampleEditItem row = row(tube, analysis);
        row.setCanceled(true);
        when(form.getExistingTests()).thenReturn(List.of(row));
        when(form.getNewAccessionNumber()).thenReturn("DEMO260002");
        assertThrows(LIMSRuntimeException.class, () -> service.editSample(form, request, null, true, ACTOR));
        assertEquals(ACCESSION, sample.getAccessionNumber());
        assertEquals("original-actor", sample.getSysUserId());
        assertEquals(OrderPriority.ROUTINE, sample.getPriority());
        verify(sampleUtil, never()).validateNewAccessionNumber(any(), any());
        verify(samples, never()).update(any(Sample.class));
    }

    @Test
    public void invalidNewAccessionDoesNotChangeAnyEntities() {
        when(form.getNewAccessionNumber()).thenReturn("DUPLICATE");
        org.mockito.Mockito.doAnswer(invocation -> {
            ((Errors) invocation.getArgument(1)).reject("sample.entry.invalid.accession.number.used");
            return null;
        }).when(sampleUtil).validateNewAccessionNumber(eq("DUPLICATE"), any(Errors.class));
        assertThrows(LIMSRuntimeException.class, () -> service.editSample(form, request, null, true, ACTOR));
        assertEquals(ACCESSION, sample.getAccessionNumber());
        assertEquals(OrderPriority.ROUTINE, sample.getPriority());
        verify(samples, never()).update(any(Sample.class));
    }

    @Test
    public void requestedRenameWithoutANewAccessionIsRejected() {
        assertThrows(LIMSRuntimeException.class, () -> service.editSample(form, request, null, true, ACTOR));
        assertEquals(ACCESSION, sample.getAccessionNumber());
        verify(samples, never()).update(any(Sample.class));
    }

    @Test
    public void suppliedEntityForADifferentOrderCannotSelectTheWriteTarget() {
        Sample supplied = new Sample();
        supplied.setId("2");
        supplied.setAccessionNumber(ACCESSION);
        assertThrows(LIMSRuntimeException.class, () -> service.editSample(form, request, supplied, false, ACTOR));
        assertEquals(ACCESSION, sample.getAccessionNumber());
        verify(entityManager, never()).detach(any());
        verify(samples, never()).update(any(Sample.class));
    }

    @Test
    public void deniedWritePermissionStopsBeforeLoadingOrChangingAnyOrderData() {
        org.mockito.Mockito.doThrow(new AccessDeniedException("denied")).when(authorization).requireWrite(request,
                ACTOR);
        assertThrows(AccessDeniedException.class, () -> service.editSample(form, request, sample, true, ACTOR));
        verify(samples, never()).getSampleByAccessionNumber(any(String.class));
        verify(items, never()).get(any());
        verify(analyses, never()).get(any(String.class));
        verify(entityManager, never()).detach(any());
        assertEquals(ACCESSION, sample.getAccessionNumber());
        assertEquals(OrderPriority.ROUTINE, sample.getPriority());
    }

    @Test
    public void accessionContainingAHyphenUsesTheFinalTubeSuffix() {
        Integer order = ReflectionTestUtils.invokeMethod(service, "parseSampleItemOrder", "24-00001", "24-00001-1");
        assertEquals(Integer.valueOf(1), order);
        Integer next = ReflectionTestUtils.invokeMethod(service, "parseSampleItemOrder", "24-00001", "24-00001-12");
        assertEquals(Integer.valueOf(12), next);
    }

    @Test
    public void malformedOrForeignMaxTubeNumbersCannotProvideTheNextTubeOrder() {
        for (String invalid : List.of("24-00001", "24-00001-", "24-00001--1", "24-00001-one", "25-00001-1",
                "24-00001-9999999999999")) {
            assertThrows(LIMSRuntimeException.class,
                    () -> ReflectionTestUtils.invokeMethod(service, "parseSampleItemOrder", "24-00001", invalid));
        }
    }

    private void validateActions() {
        ReflectionTestUtils.invokeMethod(service, "validateEditActions", form, sample, request, ACTOR);
    }

    private void assertRejectedWithoutWrites() {
        LIMSRuntimeException failure = assertThrows(LIMSRuntimeException.class,
                () -> service.editSample(form, request, null, false, ACTOR));
        assertTrue(failure.getMessage() != null && !failure.getMessage().isBlank());
        assertEquals(ACCESSION, sample.getAccessionNumber());
        assertEquals(OrderPriority.ROUTINE, sample.getPriority());
        verify(samples, never()).update(any(Sample.class));
        verify(items, never()).update(any(SampleItem.class));
        verify(analyses, never()).update(any(Analysis.class));
        verify(entityManager, never()).detach(any());
    }

    private void enableAdministrator() {
        request.getSession().setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,
                new SecurityContextImpl());
        when(modules.isUserAdmin(request)).thenReturn(true);
    }

    private SampleItem tube(String id, Sample order) {
        SampleItem item = new SampleItem();
        item.setId(id);
        item.setSample(order);
        item.setStatusId("entered");
        when(items.get(id)).thenReturn(item);
        return item;
    }

    private Analysis analysis(String id, SampleItem item, String status) {
        Analysis persisted = new Analysis();
        persisted.setId(id);
        persisted.setSampleItem(item);
        persisted.setStatusId(status);
        when(analyses.get(id)).thenReturn(persisted);
        return persisted;
    }

    private SampleEditItem row(SampleItem item, Analysis persisted) {
        SampleEditItem row = new SampleEditItem();
        row.setSampleItemId(item.getId());
        if (persisted != null) {
            row.setAnalysisId(persisted.getId());
        }
        return row;
    }
}
