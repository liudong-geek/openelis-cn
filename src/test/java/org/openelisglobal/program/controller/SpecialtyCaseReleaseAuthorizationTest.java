package org.openelisglobal.program.controller;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.Method;
import org.junit.Test;
import org.openelisglobal.program.controller.cytology.CytologyController;
import org.openelisglobal.program.controller.cytology.CytologySampleForm;
import org.openelisglobal.program.controller.immunohistochemistry.ImmunohistochemistryController;
import org.openelisglobal.program.controller.immunohistochemistry.ImmunohistochemistrySampleForm;
import org.openelisglobal.program.controller.pathology.PathologyController;
import org.openelisglobal.program.controller.pathology.PathologySampleForm;
import org.openelisglobal.program.service.ImmunohistochemistrySampleServiceImpl;
import org.openelisglobal.program.service.PathologySampleServiceImpl;
import org.openelisglobal.program.service.cytology.CytologySampleServiceImpl;
import org.openelisglobal.program.valueholder.cytology.CytologySample.CytologyStatus;
import org.openelisglobal.program.valueholder.immunohistochemistry.ImmunohistochemistrySample.ImmunohistochemistryStatus;
import org.openelisglobal.program.valueholder.pathology.PathologySample.PathologyStatus;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

public class SpecialtyCaseReleaseAuthorizationTest {

    @Test
    public void caseWriteRoutesAllowDraftTechniciansAndSpecialists() throws Exception {
        assertAuthorization(PathologyController.class, "getFilteredPathologyEntries",
                new Class<?>[] { Integer.class, PathologySampleForm.class, HttpServletRequest.class },
                "hasAnyRole('RESULTS', 'PATHOLOGIST')");
        assertAuthorization(CytologyController.class, "createCytologyEntry",
                new Class<?>[] { Integer.class, CytologySampleForm.class, HttpServletRequest.class },
                "hasAnyRole('RESULTS', 'CYTOPATHOLOGIST')");
        assertAuthorization(ImmunohistochemistryController.class, "getFilteredImmunohistochemistryEntries",
                new Class<?>[] { Integer.class, ImmunohistochemistrySampleForm.class, HttpServletRequest.class },
                "hasAnyRole('RESULTS', 'PATHOLOGIST')");
    }

    @Test
    public void technicianAssignmentRoutesRequireResultsRole() throws Exception {
        assertAuthorization(PathologyController.class, "assignTechnician",
                new Class<?>[] { Integer.class, HttpServletRequest.class }, "hasRole('RESULTS')");
        assertAuthorization(CytologyController.class, "assignTechnician",
                new Class<?>[] { Integer.class, HttpServletRequest.class }, "hasRole('RESULTS')");
        assertAuthorization(ImmunohistochemistryController.class, "assignTechnician",
                new Class<?>[] { Integer.class, HttpServletRequest.class }, "hasRole('RESULTS')");
    }

    @Test
    public void specialistAssignmentRoutesRequireMatchingSpecialistRole() throws Exception {
        assertAuthorization(PathologyController.class, "assignPathologist",
                new Class<?>[] { Integer.class, HttpServletRequest.class }, "hasRole('PATHOLOGIST')");
        assertAuthorization(CytologyController.class, "assignPathologist",
                new Class<?>[] { Integer.class, HttpServletRequest.class }, "hasRole('CYTOPATHOLOGIST')");
        assertAuthorization(ImmunohistochemistryController.class, "assignPathologist",
                new Class<?>[] { Integer.class, HttpServletRequest.class }, "hasRole('PATHOLOGIST')");
    }

    @Test
    public void specialtyReadRoutesRequireMatchingBusinessRoles() throws Exception {
        assertAuthorization(PathologyController.class, "getFilteredPathologyEntries",
                new Class<?>[] { String.class, PathologyStatus[].class },
                "hasAnyRole('RESULTS', 'PATHOLOGIST')");
        assertAuthorization(PathologyController.class, "getFilteredPathologyEntries", new Class<?>[] {},
                "hasAnyRole('RESULTS', 'PATHOLOGIST')");
        assertAuthorization(PathologyController.class, "getFilteredPathologyEntries",
                new Class<?>[] { Integer.class }, "hasAnyRole('RESULTS', 'PATHOLOGIST')");

        assertAuthorization(CytologyController.class, "getFilteredCytologyEntries",
                new Class<?>[] { String.class, CytologyStatus[].class },
                "hasAnyRole('RESULTS', 'CYTOPATHOLOGIST')");
        assertAuthorization(CytologyController.class, "getCytologyDashBoardMetrics", new Class<?>[] {},
                "hasAnyRole('RESULTS', 'CYTOPATHOLOGIST')");
        assertAuthorization(CytologyController.class, "getCytologyEntry", new Class<?>[] { Integer.class },
                "hasAnyRole('RESULTS', 'CYTOPATHOLOGIST')");

        assertAuthorization(ImmunohistochemistryController.class, "getFilteredImmunohistochemistryEntries",
                new Class<?>[] { String.class, ImmunohistochemistryStatus[].class },
                "hasAnyRole('RESULTS', 'PATHOLOGIST')");
        assertAuthorization(ImmunohistochemistryController.class, "getFilteredImmunohistochemistryEntries",
                new Class<?>[] {}, "hasAnyRole('RESULTS', 'PATHOLOGIST')");
        assertAuthorization(ImmunohistochemistryController.class, "getFilteredImmunohistochemistryEntries",
                new Class<?>[] { Integer.class }, "hasAnyRole('RESULTS', 'PATHOLOGIST')");
    }

    @Test
    public void selfClaimWritesUseSerializableTransactions() throws Exception {
        assertSerializableClaim(PathologySampleServiceImpl.class, "assignTechnician", Integer.class,
                SystemUser.class, String.class);
        assertSerializableClaim(PathologySampleServiceImpl.class, "assignPathologist", Integer.class,
                SystemUser.class, String.class);
        assertSerializableClaim(CytologySampleServiceImpl.class, "assignTechnician", Integer.class,
                SystemUser.class);
        assertSerializableClaim(CytologySampleServiceImpl.class, "assignCytoPathologist", Integer.class,
                SystemUser.class);
        assertSerializableClaim(ImmunohistochemistrySampleServiceImpl.class, "assignTechnician", Integer.class,
                SystemUser.class);
        assertSerializableClaim(ImmunohistochemistrySampleServiceImpl.class, "assignPathologist", Integer.class,
                SystemUser.class);
    }

    private void assertAuthorization(Class<?> controller, String methodName, Class<?>[] argumentTypes,
            String expression) throws Exception {
        Method write = controller.getMethod(methodName, argumentTypes);
        PreAuthorize authorization = write.getAnnotation(PreAuthorize.class);

        assertNotNull(authorization);
        assertEquals(expression, authorization.value());
    }

    private void assertSerializableClaim(Class<?> service, String methodName, Class<?>... argumentTypes)
            throws Exception {
        Transactional transaction = service.getMethod(methodName, argumentTypes).getAnnotation(Transactional.class);
        assertNotNull(transaction);
        assertEquals(Isolation.SERIALIZABLE, transaction.isolation());
    }
}
