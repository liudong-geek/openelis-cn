package org.openelisglobal.program.service.cytology;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.program.controller.cytology.CytologySampleForm;
import org.openelisglobal.program.service.SpecialtyCaseWriteGuard;
import org.openelisglobal.program.service.SpecialtyCaseWriteGuard.Assignment;
import org.openelisglobal.program.service.SpecialtyCaseWriteGuard.Authorization;
import org.openelisglobal.program.valueholder.cytology.CytologyDiagnosis;
import org.openelisglobal.program.valueholder.cytology.CytologyDiagnosis.CytologyDiagnosisResultType;
import org.openelisglobal.program.valueholder.cytology.CytologyDiagnosis.DiagnosisCategory;
import org.openelisglobal.program.valueholder.cytology.CytologyDiagnosisCategoryResultsMap;
import org.openelisglobal.program.valueholder.cytology.CytologySample;
import org.openelisglobal.program.valueholder.cytology.CytologySpecimenAdequacy;
import org.openelisglobal.program.valueholder.cytology.CytologySpecimenAdequacy.SpecimenAdequacyResultType;
import org.openelisglobal.program.valueholder.cytology.CytologySpecimenAdequacy.SpecimenAdequancySatisfaction;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;

public class CytologyAssignmentAuthorizationTest {

    @Test
    public void technicianAndCytopathologistAssignmentsUseRoleScopedSelfAssignment() {
        CytologySampleServiceImpl service = org.mockito.Mockito.spy(new CytologySampleServiceImpl());
        SpecialtyCaseWriteGuard guard = mock(SpecialtyCaseWriteGuard.class);
        ReflectionTestUtils.setField(service, "specialtyCaseWriteGuard", guard);
        CytologySample owner = new CytologySample();
        owner.setId(53);
        owner.setSample(sample("301"));
        owner.setSlides(new ArrayList<>());
        owner.setReports(new ArrayList<>());
        doReturn(owner).when(service).get(53);
        doReturn(owner).when(service).update(any(CytologySample.class));
        SystemUser actor = user("11");
        Authorization authorization = new Authorization("11", Set.of("101"), List.of(), List.of());
        when(guard.require("11", owner, Constants.ROLE_RESULTS)).thenReturn(authorization);
        when(guard.require("11", owner, Constants.ROLE_CYTOPATHOLOGIST)).thenReturn(authorization);

        service.assignTechnician(53, actor);
        service.assignCytoPathologist(53, actor);

        verify(guard).require("11", owner, Constants.ROLE_RESULTS);
        verify(guard).require("11", owner, Constants.ROLE_CYTOPATHOLOGIST);
        verify(guard, times(2)).requireSelfAssignment(authorization, actor, null);
    }

    @Test
    public void draftCannotPersistCompletedStatus() {
        CytologySampleServiceImpl service = org.mockito.Mockito.spy(new CytologySampleServiceImpl());
        SpecialtyCaseWriteGuard guard = mock(SpecialtyCaseWriteGuard.class);
        ReflectionTestUtils.setField(service, "specialtyCaseWriteGuard", guard);
        CytologySample owner = owner();
        doReturn(owner).when(service).get(53);
        Authorization authorization = new Authorization("11", Set.of("101"), List.of(), List.of());
        when(guard.require("11", owner, List.of(Constants.ROLE_RESULTS, Constants.ROLE_CYTOPATHOLOGIST)))
                .thenReturn(authorization);
        doThrow(new AccessDeniedException("error.notauthorized")).when(guard).requireDraftStatus(false,
                CytologySample.CytologyStatus.COMPLETED);
        CytologySampleForm form = new CytologySampleForm();
        form.setSystemUserId("11");
        form.setRelease(false);
        form.setStatus(CytologySample.CytologyStatus.COMPLETED);

        org.junit.Assert.assertThrows(AccessDeniedException.class, () -> service.updateWithFormValues(53, form));

        verify(service, never()).update(any(CytologySample.class));
    }

    @Test
    public void occupiedTechnicianAssignmentCannotBeOverwritten() {
        CytologySampleServiceImpl service = org.mockito.Mockito.spy(new CytologySampleServiceImpl());
        SpecialtyCaseWriteGuard guard = mock(SpecialtyCaseWriteGuard.class);
        ReflectionTestUtils.setField(service, "specialtyCaseWriteGuard", guard);
        CytologySample owner = owner();
        SystemUser current = user("12");
        owner.setTechnician(current);
        doReturn(owner).when(service).get(53);
        SystemUser actor = user("11");
        Authorization authorization = new Authorization("11", Set.of("101"), List.of(), List.of());
        when(guard.require("11", owner, Constants.ROLE_RESULTS)).thenReturn(authorization);
        doThrow(new AccessDeniedException("error.notauthorized")).when(guard)
                .requireSelfAssignment(authorization, actor, current);

        org.junit.Assert.assertThrows(AccessDeniedException.class, () -> service.assignTechnician(53, actor));

        verify(service, never()).update(any(CytologySample.class));
    }

    @Test
    public void resultsTechnicianCannotChangeCytopathologistDiagnosisFields() {
        CytologySampleServiceImpl service = org.mockito.Mockito.spy(new CytologySampleServiceImpl());
        SpecialtyCaseWriteGuard guard = mock(SpecialtyCaseWriteGuard.class);
        ReflectionTestUtils.setField(service, "specialtyCaseWriteGuard", guard);
        CytologySample owner = owner();
        owner.setTechnician(user("11"));
        SystemUser cytopathologist = user("12");
        owner.setCytoPathologist(cytopathologist);
        doReturn(owner).when(service).get(53);
        Authorization authorization = new Authorization("11", Set.of("101"), List.of(), List.of());
        when(guard.require("11", owner, List.of(Constants.ROLE_RESULTS, Constants.ROLE_CYTOPATHOLOGIST)))
                .thenReturn(authorization);
        List<Assignment> specialistOwner = List
                .of(new Assignment(Constants.ROLE_CYTOPATHOLOGIST, cytopathologist));
        doThrow(new AccessDeniedException("error.notauthorized")).when(guard)
                .requireCurrentAssignment(authorization, specialistOwner);
        CytologySampleForm form = draftForm();
        CytologySpecimenAdequacy forged = new CytologySpecimenAdequacy();
        forged.setValues(List.of("9"));
        form.setSpecimenAdequacy(forged);

        org.junit.Assert.assertThrows(AccessDeniedException.class, () -> service.updateWithFormValues(53, form));

        verify(service, never()).update(any(CytologySample.class));
    }

    @Test
    public void caseSaveCannotTransferThePersistedCytopathologist() {
        CytologySampleServiceImpl service = org.mockito.Mockito.spy(new CytologySampleServiceImpl());
        SpecialtyCaseWriteGuard guard = mock(SpecialtyCaseWriteGuard.class);
        ReflectionTestUtils.setField(service, "specialtyCaseWriteGuard", guard);
        CytologySample owner = owner();
        SystemUser cytopathologist = user("11");
        owner.setCytoPathologist(cytopathologist);
        doReturn(owner).when(service).get(53);
        Authorization authorization = new Authorization("11", Set.of("101"), List.of(), List.of());
        when(guard.require("11", owner, List.of(Constants.ROLE_RESULTS, Constants.ROLE_CYTOPATHOLOGIST)))
                .thenReturn(authorization);
        doThrow(new AccessDeniedException("error.notauthorized")).when(guard)
                .requireUnchangedAssignment(cytopathologist, "12");
        CytologySampleForm form = draftForm();
        form.setAssignedCytoPathologistId("12");

        org.junit.Assert.assertThrows(AccessDeniedException.class, () -> service.updateWithFormValues(53, form));

        verify(service, never()).update(any(CytologySample.class));
    }

    @Test
    public void submittedNestedIdsAreIgnoredWhenRebuildingThisCasesDiagnosis() {
        CytologySampleServiceImpl service = org.mockito.Mockito.spy(new CytologySampleServiceImpl());
        SpecialtyCaseWriteGuard guard = mock(SpecialtyCaseWriteGuard.class);
        ReflectionTestUtils.setField(service, "specialtyCaseWriteGuard", guard);
        CytologySample owner = owner();
        owner.setCytoPathologist(user("11"));
        doReturn(owner).when(service).get(53);
        doReturn(owner).when(service).update(any(CytologySample.class));
        Authorization authorization = new Authorization("11", Set.of("101"), List.of(), List.of());
        when(guard.require("11", owner, List.of(Constants.ROLE_RESULTS, Constants.ROLE_CYTOPATHOLOGIST)))
                .thenReturn(authorization);

        CytologySpecimenAdequacy foreignAdequacy = new CytologySpecimenAdequacy();
        foreignAdequacy.setId(7001);
        foreignAdequacy.setResultType(SpecimenAdequacyResultType.DICTIONARY);
        foreignAdequacy.setSatisfaction(SpecimenAdequancySatisfaction.SATISFACTORY_FOR_EVALUATION);
        foreignAdequacy.setValues(List.of("9"));
        CytologyDiagnosisCategoryResultsMap foreignMap = new CytologyDiagnosisCategoryResultsMap();
        foreignMap.setId(7002);
        foreignMap.setCategory(DiagnosisCategory.OTHER);
        foreignMap.setResultType(CytologyDiagnosisResultType.DICTIONARY);
        foreignMap.setResults(List.of("10"));
        CytologyDiagnosis foreignDiagnosis = new CytologyDiagnosis();
        foreignDiagnosis.setId(7003);
        foreignDiagnosis.setNegativeDiagnosis(false);
        foreignDiagnosis.setDiagnosisResultsMaps(List.of(foreignMap));
        CytologySampleForm form = draftForm();
        form.setSpecimenAdequacy(foreignAdequacy);
        form.setDiagnosis(foreignDiagnosis);

        service.updateWithFormValues(53, form);

        ArgumentCaptor<CytologySample> saved = ArgumentCaptor.forClass(CytologySample.class);
        verify(service).update(saved.capture());
        org.junit.Assert.assertNotSame(foreignAdequacy, saved.getValue().getSpecimenAdequacy());
        org.junit.Assert.assertNull(saved.getValue().getSpecimenAdequacy().getId());
        org.junit.Assert.assertNotSame(foreignDiagnosis, saved.getValue().getDiagnosis());
        org.junit.Assert.assertNull(saved.getValue().getDiagnosis().getId());
        org.junit.Assert.assertNotSame(foreignMap,
                saved.getValue().getDiagnosis().getDiagnosisResultsMaps().get(0));
        org.junit.Assert.assertNull(saved.getValue().getDiagnosis().getDiagnosisResultsMaps().get(0).getId());
    }

    @Test
    public void releaseWithoutAPersistedTechnicianIsRejectedBeforeUpdate() {
        CytologySampleServiceImpl service = org.mockito.Mockito.spy(new CytologySampleServiceImpl());
        SpecialtyCaseWriteGuard guard = mock(SpecialtyCaseWriteGuard.class);
        ReflectionTestUtils.setField(service, "specialtyCaseWriteGuard", guard);
        CytologySample owner = owner();
        SystemUser cytopathologist = user("11");
        owner.setCytoPathologist(cytopathologist);
        doReturn(owner).when(service).get(53);
        Authorization authorization = new Authorization("11", Set.of("101"), List.of(), List.of());
        when(guard.require("11", owner, List.of(Constants.ROLE_CYTOPATHOLOGIST))).thenReturn(authorization);
        Assignment specialist = new Assignment(Constants.ROLE_CYTOPATHOLOGIST, cytopathologist);
        doThrow(new AccessDeniedException("error.notauthorized")).when(guard)
                .requireReleaseAssignments(authorization, specialist, null);
        CytologySampleForm form = draftForm();
        form.setRelease(true);

        org.junit.Assert.assertThrows(AccessDeniedException.class, () -> service.updateWithFormValues(53, form));

        verify(service, never()).update(any(CytologySample.class));
    }

    private CytologySampleForm draftForm() {
        CytologySampleForm form = new CytologySampleForm();
        form.setSystemUserId("11");
        form.setRelease(false);
        form.setStatus(CytologySample.CytologyStatus.PREPARING_SLIDES);
        form.setSlides(new ArrayList<>());
        form.setReports(new ArrayList<>());
        return form;
    }

    private CytologySample owner() {
        CytologySample owner = new CytologySample();
        owner.setId(53);
        owner.setSample(sample("301"));
        owner.setSlides(new ArrayList<>());
        owner.setReports(new ArrayList<>());
        return owner;
    }

    private Sample sample(String id) {
        Sample value = new Sample();
        value.setId(id);
        return value;
    }

    private SystemUser user(String id) {
        SystemUser value = new SystemUser();
        value.setId(id);
        return value;
    }
}
