package org.openelisglobal.program.service;

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
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.program.controller.immunohistochemistry.ImmunohistochemistrySampleForm;
import org.openelisglobal.program.service.SpecialtyCaseWriteGuard.Assignment;
import org.openelisglobal.program.service.SpecialtyCaseWriteGuard.Authorization;
import org.openelisglobal.program.valueholder.immunohistochemistry.ImmunohistochemistrySample;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.security.access.AccessDeniedException;

public class ImmunohistochemistryAssignmentAuthorizationTest {

    @Test
    public void technicianAndPathologistAssignmentsUseRoleScopedSelfAssignment() {
        ImmunohistochemistrySampleServiceImpl service = org.mockito.Mockito
                .spy(new ImmunohistochemistrySampleServiceImpl());
        SpecialtyCaseWriteGuard guard = mock(SpecialtyCaseWriteGuard.class);
        ReflectionTestUtils.setField(service, "specialtyCaseWriteGuard", guard);
        ImmunohistochemistrySample owner = new ImmunohistochemistrySample();
        owner.setId(52);
        owner.setSample(sample("301"));
        owner.setReports(new ArrayList<>());
        doReturn(owner).when(service).get(52);
        doReturn(owner).when(service).update(any(ImmunohistochemistrySample.class));
        SystemUser actor = user("11");
        Authorization authorization = new Authorization("11", Set.of("101"), List.of(), List.of());
        when(guard.require("11", owner, Constants.ROLE_RESULTS)).thenReturn(authorization);
        when(guard.require("11", owner, Constants.ROLE_PATHOLOGIST)).thenReturn(authorization);

        service.assignTechnician(52, actor);
        service.assignPathologist(52, actor);

        verify(guard).require("11", owner, Constants.ROLE_RESULTS);
        verify(guard).require("11", owner, Constants.ROLE_PATHOLOGIST);
        verify(guard, times(2)).requireSelfAssignment(authorization, actor, null);
    }

    @Test
    public void draftCannotPersistCompletedStatus() {
        ImmunohistochemistrySampleServiceImpl service = org.mockito.Mockito
                .spy(new ImmunohistochemistrySampleServiceImpl());
        SpecialtyCaseWriteGuard guard = mock(SpecialtyCaseWriteGuard.class);
        ReflectionTestUtils.setField(service, "specialtyCaseWriteGuard", guard);
        ImmunohistochemistrySample owner = owner();
        doReturn(owner).when(service).get(52);
        Authorization authorization = new Authorization("11", Set.of("101"), List.of(), List.of());
        when(guard.require("11", owner, List.of(Constants.ROLE_RESULTS, Constants.ROLE_PATHOLOGIST)))
                .thenReturn(authorization);
        doThrow(new AccessDeniedException("error.notauthorized")).when(guard).requireDraftStatus(false,
                ImmunohistochemistrySample.ImmunohistochemistryStatus.COMPLETED);
        ImmunohistochemistrySampleForm form = new ImmunohistochemistrySampleForm();
        form.setSystemUserId("11");
        form.setRelease(false);
        form.setStatus(ImmunohistochemistrySample.ImmunohistochemistryStatus.COMPLETED);

        org.junit.Assert.assertThrows(AccessDeniedException.class, () -> service.updateWithFormValues(52, form));

        verify(service, never()).update(any(ImmunohistochemistrySample.class));
    }

    @Test
    public void occupiedPathologistAssignmentCannotBeOverwritten() {
        ImmunohistochemistrySampleServiceImpl service = org.mockito.Mockito
                .spy(new ImmunohistochemistrySampleServiceImpl());
        SpecialtyCaseWriteGuard guard = mock(SpecialtyCaseWriteGuard.class);
        ReflectionTestUtils.setField(service, "specialtyCaseWriteGuard", guard);
        ImmunohistochemistrySample owner = owner();
        SystemUser current = user("12");
        owner.setPathologist(current);
        doReturn(owner).when(service).get(52);
        SystemUser actor = user("11");
        Authorization authorization = new Authorization("11", Set.of("101"), List.of(), List.of());
        when(guard.require("11", owner, Constants.ROLE_PATHOLOGIST)).thenReturn(authorization);
        doThrow(new AccessDeniedException("error.notauthorized")).when(guard)
                .requireSelfAssignment(authorization, actor, current);

        org.junit.Assert.assertThrows(AccessDeniedException.class, () -> service.assignPathologist(52, actor));

        verify(service, never()).update(any(ImmunohistochemistrySample.class));
    }

    @Test
    public void caseSaveCannotTransferThePersistedPathologist() {
        ImmunohistochemistrySampleServiceImpl service = org.mockito.Mockito
                .spy(new ImmunohistochemistrySampleServiceImpl());
        SpecialtyCaseWriteGuard guard = mock(SpecialtyCaseWriteGuard.class);
        ReflectionTestUtils.setField(service, "specialtyCaseWriteGuard", guard);
        ImmunohistochemistrySample owner = owner();
        SystemUser pathologist = user("11");
        owner.setPathologist(pathologist);
        doReturn(owner).when(service).get(52);
        Authorization authorization = new Authorization("11", Set.of("101"), List.of(), List.of());
        when(guard.require("11", owner, List.of(Constants.ROLE_RESULTS, Constants.ROLE_PATHOLOGIST)))
                .thenReturn(authorization);
        doThrow(new AccessDeniedException("error.notauthorized")).when(guard)
                .requireUnchangedAssignment(pathologist, "12");
        ImmunohistochemistrySampleForm form = new ImmunohistochemistrySampleForm();
        form.setSystemUserId("11");
        form.setRelease(false);
        form.setStatus(ImmunohistochemistrySample.ImmunohistochemistryStatus.IN_PROGRESS);
        form.setReports(new ArrayList<>());
        form.setAssignedPathologistId("12");

        org.junit.Assert.assertThrows(AccessDeniedException.class, () -> service.updateWithFormValues(52, form));

        verify(service, never()).update(any(ImmunohistochemistrySample.class));
    }

    @Test
    public void releaseWithoutAPersistedTechnicianIsRejectedBeforeUpdate() {
        ImmunohistochemistrySampleServiceImpl service = org.mockito.Mockito
                .spy(new ImmunohistochemistrySampleServiceImpl());
        SpecialtyCaseWriteGuard guard = mock(SpecialtyCaseWriteGuard.class);
        ReflectionTestUtils.setField(service, "specialtyCaseWriteGuard", guard);
        ImmunohistochemistrySample owner = owner();
        SystemUser pathologist = user("11");
        owner.setPathologist(pathologist);
        doReturn(owner).when(service).get(52);
        Authorization authorization = new Authorization("11", Set.of("101"), List.of(), List.of());
        when(guard.require("11", owner, List.of(Constants.ROLE_PATHOLOGIST))).thenReturn(authorization);
        Assignment specialist = new Assignment(Constants.ROLE_PATHOLOGIST, pathologist);
        doThrow(new AccessDeniedException("error.notauthorized")).when(guard)
                .requireReleaseAssignments(authorization, specialist, null);
        ImmunohistochemistrySampleForm form = new ImmunohistochemistrySampleForm();
        form.setSystemUserId("11");
        form.setRelease(true);
        form.setStatus(ImmunohistochemistrySample.ImmunohistochemistryStatus.READY_PATHOLOGIST);
        form.setReports(new ArrayList<>());

        org.junit.Assert.assertThrows(AccessDeniedException.class, () -> service.updateWithFormValues(52, form));

        verify(service, never()).update(any(ImmunohistochemistrySample.class));
    }

    private ImmunohistochemistrySample owner() {
        ImmunohistochemistrySample owner = new ImmunohistochemistrySample();
        owner.setId(52);
        owner.setSample(sample("301"));
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
