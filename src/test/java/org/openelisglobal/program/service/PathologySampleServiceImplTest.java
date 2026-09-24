package org.openelisglobal.program.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.barcode.form.LabelRowForm;
import org.openelisglobal.barcode.form.LabelsSectionForm;
import org.openelisglobal.barcode.form.PostSavePrintDialogForm;
import org.openelisglobal.barcode.service.BarcodeInfoService;
import org.openelisglobal.barcode.service.BarcodeWorkflowPrintService;
import org.openelisglobal.program.controller.pathology.PathologySampleForm;
import org.openelisglobal.program.service.SpecialtyCaseWriteGuard.Assignment;
import org.openelisglobal.program.service.SpecialtyCaseWriteGuard.Authorization;
import org.openelisglobal.program.valueholder.pathology.PathologySample;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;

@RunWith(MockitoJUnitRunner.class)
public class PathologySampleServiceImplTest {

    @Mock
    private BarcodeInfoService barcodeInfoService;

    @Mock
    private BarcodeWorkflowPrintService barcodeWorkflowPrintService;

    private PathologySampleServiceImpl pathologySampleService;
    private PathologySample existingPathologySample;
    private SpecialtyCaseWriteGuard writeGuard;

    @Before
    public void setUp() {
        pathologySampleService = org.mockito.Mockito.spy(new PathologySampleServiceImpl());
        ReflectionTestUtils.setField(pathologySampleService, "barcodeInfoService", barcodeInfoService);
        ReflectionTestUtils.setField(pathologySampleService, "barcodeWorkflowPrintService",
                barcodeWorkflowPrintService);
        writeGuard = org.mockito.Mockito.mock(SpecialtyCaseWriteGuard.class);
        when(writeGuard.require(eq("2"), any(PathologySample.class), anyList()))
                .thenReturn(new Authorization("2", Set.of(), List.of(), List.of()));
        ReflectionTestUtils.setField(pathologySampleService, "specialtyCaseWriteGuard", writeGuard);

        existingPathologySample = new PathologySample();
        existingPathologySample.setId(2);
        existingPathologySample.setBlocks(new ArrayList<>());
        existingPathologySample.setSlides(new ArrayList<>());
        existingPathologySample.setRequests(new ArrayList<>());
        existingPathologySample.setTechniques(new ArrayList<>());
        existingPathologySample.setConclusions(new ArrayList<>());
        existingPathologySample.setReports(new ArrayList<>());

        Sample sample = new Sample();
        sample.setId("1");
        existingPathologySample.setSample(sample);

        doReturn(existingPathologySample).when(pathologySampleService).get(eq(2));
        doReturn(existingPathologySample).when(pathologySampleService).update(any(PathologySample.class));
    }

    @Test
    public void updateWithFormValues_persistsPathologyBarcodeCountsWhenSupplied() {
        PathologySampleForm form = baseForm();
        form.setNumOrderLabels(2);
        form.setNumSpecimenLabels(3);
        form.setNumBlockLabels(4);
        form.setNumSlideLabels(5);
        form.setNumFreezerLabels(6);
        LabelsSectionForm labelsSection = createLabelsSectionForm();
        PostSavePrintDialogForm postSavePrintDialog = new PostSavePrintDialogForm();
        when(barcodeWorkflowPrintService.buildLabelsSection(2, java.util.List.of(3))).thenReturn(labelsSection);
        when(barcodeWorkflowPrintService.buildPostSavePrintDialog(any(), eq(labelsSection)))
                .thenReturn(postSavePrintDialog);

        pathologySampleService.updateWithFormValues(2, form);

        verify(barcodeInfoService).saveBarcodeInfoForSampleAndSampleItemsPathology(existingPathologySample.getSample(),
                2, 3, 4, 5, 6);
        verify(barcodeWorkflowPrintService).buildLabelsSection(2, java.util.List.of(3));
        verify(barcodeWorkflowPrintService).buildPostSavePrintDialog(any(), eq(labelsSection));
    }

    @Test
    public void updateWithFormValues_doesNotPersistPathologyBarcodeCountsWhenMissing() {
        PathologySampleForm form = baseForm();
        LabelsSectionForm labelsSection = createLabelsSectionForm();
        PostSavePrintDialogForm postSavePrintDialog = new PostSavePrintDialogForm();
        when(barcodeWorkflowPrintService.buildLabelsSection(1, java.util.List.of(1))).thenReturn(labelsSection);
        when(barcodeWorkflowPrintService.buildPostSavePrintDialog(any(), eq(labelsSection)))
                .thenReturn(postSavePrintDialog);

        pathologySampleService.updateWithFormValues(2, form);

        verify(barcodeInfoService, never()).saveBarcodeInfoForSampleAndSampleItemsPathology(
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.anyInt(), org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.anyInt(), org.mockito.ArgumentMatchers.anyInt());
        verify(barcodeWorkflowPrintService).buildLabelsSection(1, java.util.List.of(1));
        verify(barcodeWorkflowPrintService).buildPostSavePrintDialog(any(), eq(labelsSection));
    }

    @Test
    public void updateWithFormValues_setsWorkflowModelsOnFormResponse() {
        PathologySampleForm form = baseForm();
        form.setNumOrderLabels(2);
        form.setNumSpecimenLabels(2);
        form.setNumBlockLabels(1);
        form.setNumSlideLabels(1);
        form.setNumFreezerLabels(1);
        LabelsSectionForm labelsSection = createLabelsSectionForm();
        PostSavePrintDialogForm postSavePrintDialog = new PostSavePrintDialogForm();
        when(barcodeWorkflowPrintService.buildLabelsSection(2, java.util.List.of(2))).thenReturn(labelsSection);
        when(barcodeWorkflowPrintService.buildPostSavePrintDialog(any(), eq(labelsSection)))
                .thenReturn(postSavePrintDialog);

        pathologySampleService.updateWithFormValues(2, form);

        org.junit.Assert.assertSame(labelsSection, form.getLabelsSection());
        org.junit.Assert.assertSame(postSavePrintDialog, form.getPostSavePrintDialog());
        org.junit.Assert.assertEquals(Integer.valueOf(1), labelsSection.getOrderRow().getQuantities().get("block"));
        org.junit.Assert.assertEquals(Integer.valueOf(1), labelsSection.getOrderRow().getQuantities().get("slide"));
        org.junit.Assert.assertEquals(Integer.valueOf(1), labelsSection.getOrderRow().getQuantities().get("freezer"));
    }

    @Test
    public void draftSaveRequestsResultsOrPathologistScope() {
        PathologySampleForm form = baseForm();
        LabelsSectionForm labelsSection = createLabelsSectionForm();
        when(barcodeWorkflowPrintService.buildLabelsSection(1, java.util.List.of(1))).thenReturn(labelsSection);
        when(barcodeWorkflowPrintService.buildPostSavePrintDialog(any(), eq(labelsSection)))
                .thenReturn(new PostSavePrintDialogForm());

        pathologySampleService.updateWithFormValues(2, form);

        verify(writeGuard).require("2", existingPathologySample,
                List.of(org.openelisglobal.common.constants.Constants.ROLE_RESULTS,
                        org.openelisglobal.common.constants.Constants.ROLE_PATHOLOGIST));
    }

    @Test
    public void technicianAndPathologistAssignmentsUseDifferentRolesAndSelfAssignmentGuard() {
        SystemUser actor = new SystemUser();
        actor.setId("2");
        Authorization technicianAuthorization = new Authorization("2", Set.of(), List.of(), List.of());
        Authorization pathologistAuthorization = new Authorization("2", Set.of(), List.of(), List.of());
        when(writeGuard.require("2", existingPathologySample,
                org.openelisglobal.common.constants.Constants.ROLE_RESULTS)).thenReturn(technicianAuthorization);
        when(writeGuard.require("2", existingPathologySample,
                org.openelisglobal.common.constants.Constants.ROLE_PATHOLOGIST)).thenReturn(pathologistAuthorization);

        pathologySampleService.assignTechnician(2, actor, "2");
        pathologySampleService.assignPathologist(2, actor, "2");

        verify(writeGuard).require("2", existingPathologySample,
                org.openelisglobal.common.constants.Constants.ROLE_RESULTS);
        verify(writeGuard).require("2", existingPathologySample,
                org.openelisglobal.common.constants.Constants.ROLE_PATHOLOGIST);
        verify(writeGuard, times(2)).requireSelfAssignment(technicianAuthorization, actor, null);
    }

    @Test
    public void draftCannotPersistCompletedStatus() {
        PathologySampleForm form = baseForm();
        form.setStatus(PathologySample.PathologyStatus.COMPLETED);
        doThrow(new AccessDeniedException("error.notauthorized")).when(writeGuard).requireDraftStatus(false,
                PathologySample.PathologyStatus.COMPLETED);

        org.junit.Assert.assertThrows(AccessDeniedException.class,
                () -> pathologySampleService.updateWithFormValues(2, form));

        verify(pathologySampleService, never()).update(any(PathologySample.class));
    }

    @Test
    public void resultsOnlyDraftCannotCreateIhcReferralBeforeSpecialistAuthorization() {
        PathologySampleForm form = baseForm();
        form.setReferToImmunoHistoChemistry(true);
        doThrow(new AccessDeniedException("error.notauthorized")).when(writeGuard).requireRead(existingPathologySample,
                List.of(org.openelisglobal.common.constants.Constants.ROLE_PATHOLOGIST));

        org.junit.Assert.assertThrows(AccessDeniedException.class,
                () -> pathologySampleService.updateWithFormValues(2, form));

        verify(pathologySampleService, never()).update(any(PathologySample.class));
    }

    @Test
    public void occupiedAssignmentCannotBeOverwritten() {
        SystemUser actor = new SystemUser();
        actor.setId("2");
        SystemUser owner = new SystemUser();
        owner.setId("3");
        existingPathologySample.setTechnician(owner);
        Authorization authorization = new Authorization("2", Set.of(), List.of(), List.of());
        when(writeGuard.require("2", existingPathologySample,
                org.openelisglobal.common.constants.Constants.ROLE_RESULTS)).thenReturn(authorization);
        doThrow(new AccessDeniedException("error.notauthorized")).when(writeGuard)
                .requireSelfAssignment(authorization, actor, owner);

        org.junit.Assert.assertThrows(AccessDeniedException.class,
                () -> pathologySampleService.assignTechnician(2, actor, "2"));

        verify(pathologySampleService, never()).update(any(PathologySample.class));
    }

    @Test
    public void caseSaveCannotTransferThePersistedTechnician() {
        SystemUser actor = user("2");
        existingPathologySample.setTechnician(actor);
        PathologySampleForm form = baseForm();
        form.setAssignedTechnicianId("3");
        doThrow(new AccessDeniedException("error.notauthorized")).when(writeGuard)
                .requireUnchangedAssignment(actor, "3");

        org.junit.Assert.assertThrows(AccessDeniedException.class,
                () -> pathologySampleService.updateWithFormValues(2, form));

        verify(pathologySampleService, never()).update(any(PathologySample.class));
    }

    @Test
    public void resultsTechnicianCannotChangePathologistDiagnosisFields() {
        SystemUser technician = user("2");
        SystemUser pathologist = user("3");
        existingPathologySample.setTechnician(technician);
        existingPathologySample.setPathologist(pathologist);
        PathologySampleForm form = baseForm();
        form.setGrossExam("forged specialist finding");
        Authorization authorization = new Authorization("2", Set.of(), List.of(), List.of());
        when(writeGuard.require(eq("2"), eq(existingPathologySample), anyList())).thenReturn(authorization);
        List<Assignment> specialistOwner = List
                .of(new Assignment(org.openelisglobal.common.constants.Constants.ROLE_PATHOLOGIST, pathologist));
        doThrow(new AccessDeniedException("error.notauthorized")).when(writeGuard)
                .requireCurrentAssignment(authorization, specialistOwner);

        org.junit.Assert.assertThrows(AccessDeniedException.class,
                () -> pathologySampleService.updateWithFormValues(2, form));

        verify(pathologySampleService, never()).update(any(PathologySample.class));
    }

    @Test
    public void assignedPathologistCanSaveDiagnosisFieldsAsDraft() {
        SystemUser pathologist = user("2");
        existingPathologySample.setPathologist(pathologist);
        PathologySampleForm form = baseForm();
        form.setGrossExam("specialist finding");
        Authorization authorization = new Authorization("2", Set.of(), List.of(), List.of());
        when(writeGuard.require(eq("2"), eq(existingPathologySample), anyList())).thenReturn(authorization);
        LabelsSectionForm labelsSection = createLabelsSectionForm();
        when(barcodeWorkflowPrintService.buildLabelsSection(1, java.util.List.of(1))).thenReturn(labelsSection);
        when(barcodeWorkflowPrintService.buildPostSavePrintDialog(any(), eq(labelsSection)))
                .thenReturn(new PostSavePrintDialogForm());

        pathologySampleService.updateWithFormValues(2, form);

        verify(writeGuard).requireCurrentAssignment(authorization,
                List.of(new Assignment(org.openelisglobal.common.constants.Constants.ROLE_PATHOLOGIST, pathologist)));
        verify(pathologySampleService).update(any(PathologySample.class));
    }

    @Test
    public void anotherPathologistCannotReleaseAnOwnedCase() {
        SystemUser owner = user("3");
        SystemUser technician = user("4");
        existingPathologySample.setPathologist(owner);
        existingPathologySample.setTechnician(technician);
        PathologySampleForm form = baseForm();
        form.setRelease(true);
        Authorization authorization = new Authorization("2", Set.of(), List.of(), List.of());
        when(writeGuard.require("2", existingPathologySample,
                List.of(org.openelisglobal.common.constants.Constants.ROLE_PATHOLOGIST))).thenReturn(authorization);
        Assignment specialistOwner = new Assignment(
                org.openelisglobal.common.constants.Constants.ROLE_PATHOLOGIST, owner);
        doThrow(new AccessDeniedException("error.notauthorized")).when(writeGuard)
                .requireReleaseAssignments(authorization, specialistOwner, technician);

        org.junit.Assert.assertThrows(AccessDeniedException.class,
                () -> pathologySampleService.updateWithFormValues(2, form));

        verify(pathologySampleService, never()).update(any(PathologySample.class));
    }

    @Test
    public void releaseWithoutAPersistedTechnicianIsRejectedBeforeUpdate() {
        SystemUser pathologist = user("2");
        existingPathologySample.setPathologist(pathologist);
        PathologySampleForm form = baseForm();
        form.setRelease(true);
        Authorization authorization = new Authorization("2", Set.of(), List.of(), List.of());
        when(writeGuard.require("2", existingPathologySample,
                List.of(org.openelisglobal.common.constants.Constants.ROLE_PATHOLOGIST))).thenReturn(authorization);
        Assignment specialistOwner = new Assignment(
                org.openelisglobal.common.constants.Constants.ROLE_PATHOLOGIST, pathologist);
        doThrow(new AccessDeniedException("error.notauthorized")).when(writeGuard)
                .requireReleaseAssignments(authorization, specialistOwner, null);

        org.junit.Assert.assertThrows(AccessDeniedException.class,
                () -> pathologySampleService.updateWithFormValues(2, form));

        verify(pathologySampleService, never()).update(any(PathologySample.class));
    }

    private PathologySampleForm baseForm() {
        PathologySampleForm form = new PathologySampleForm();
        form.setSystemUserId("2");
        form.setStatus(PathologySample.PathologyStatus.GROSSING);
        form.setBlocks(new ArrayList<>());
        form.setSlides(new ArrayList<>());
        form.setReports(new ArrayList<>());
        return form;
    }

    private LabelsSectionForm createLabelsSectionForm() {
        LabelsSectionForm labelsSection = new LabelsSectionForm();
        LabelRowForm orderRow = new LabelRowForm();
        orderRow.setQuantities(new java.util.HashMap<>(java.util.Map.of("order", 1)));
        labelsSection.setOrderRow(orderRow);
        labelsSection.setSampleRows(new ArrayList<>());
        return labelsSection;
    }

    private SystemUser user(String id) {
        SystemUser user = new SystemUser();
        user.setId(id);
        return user;
    }
}
