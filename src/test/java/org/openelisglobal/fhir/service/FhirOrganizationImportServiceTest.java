package org.openelisglobal.fhir.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import ca.uhn.fhir.rest.server.exceptions.ForbiddenOperationException;
import ca.uhn.fhir.rest.server.exceptions.UnprocessableEntityException;
import java.util.List;
import java.util.UUID;
import org.hl7.fhir.r4.model.Coding;
import org.hl7.fhir.r4.model.Organization;
import org.hl7.fhir.r4.model.Reference;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.dataexchange.fhir.FhirConfig;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformService;
import org.openelisglobal.fhir.dao.FhirWriteLockDAO;
import org.openelisglobal.organization.service.OrganizationService;
import org.openelisglobal.organization.service.OrganizationTypeService;
import org.openelisglobal.organization.valueholder.OrganizationType;
import org.openelisglobal.userrole.service.UserRoleService;

@RunWith(MockitoJUnitRunner.class)
public class FhirOrganizationImportServiceTest {
    private static final String UUID_VALUE = "502576b9-e3c7-4fce-8837-78983ee09a9c";
    private static final String PARENT_UUID = "bc826025-6962-4483-94a3-5756f631ae7c";
    private static final String SYSTEM = "https://test.invalid/lis";
    @Mock
    private OrganizationService organizations;
    @Mock
    private OrganizationTypeService types;
    @Mock
    private FhirTransformService transform;
    @Mock
    private UserRoleService roles;
    @Mock
    private FhirConfig config;
    @Mock
    private FhirWriteLockDAO locks;
    private FhirOrganizationImportService service;

    @Before
    public void setUp() throws Exception {
        service = new FhirOrganizationImportService(organizations, types, transform, roles, config, locks);
        lenient().when(config.getOeFhirSystem()).thenReturn(SYSTEM);
        lenient().when(roles.userInRole("1", Constants.ROLE_GLOBAL_ADMIN)).thenReturn(true);
        lenient().when(types.getOrganizationTypeByName("referring clinic")).thenReturn(type("10", "referring clinic"));
        lenient().when(types.getOrganizationTypeByName("dept")).thenReturn(type("11", "dept"));
        lenient().when(transform.transformToOrganization(any())).thenAnswer(call -> {
            Organization input = call.getArgument(0);
            var row = row(null, input.getIdElement().getIdPart());
            row.setOrganizationName(input.getName());
            row.setCode(input.getIdentifierFirstRep().getValue());
            row.setIsActive(input.getActive() ? "Y" : "N");
            return row;
        });
        lenient().when(organizations.save(any())).thenAnswer(call -> {
            org.openelisglobal.organization.valueholder.Organization row = call.getArgument(0);
            if (row.getId() == null)
                row.setId("100");
            return row;
        });
    }

    @Test
    public void testImport_Department_PersistsCanonicalParentTypeAndAuditUser() {
        var parent = row("20", PARENT_UUID);
        when(organizations.getOrganizationByFhirId(PARENT_UUID)).thenReturn(parent);
        when(organizations.getTypeIdsForOrganizationId("20")).thenReturn(List.of("10"));
        var result = service.save(UUID_VALUE, resource("dept").setPartOf(new Reference("Organization/" + PARENT_UUID)),
                "1");
        assertTrue(result.created());
        assertSame(parent, result.organization().getOrganization());
        assertEquals("1", result.organization().getSysUserId());
        verify(organizations).linkOrganizationAndType(result.organization(), "11");
        verify(locks).lock("fhir-organization-master");
    }

    @Test
    public void testImport_RepeatedPut_UpdatesSameRecord() {
        var existing = row("100", UUID_VALUE);
        when(organizations.getOrganizationByFhirId(UUID_VALUE)).thenReturn(existing);
        var result = service.save(UUID_VALUE, resource("referring clinic"), "1");
        assertFalse(result.created());
        assertSame(existing, result.organization());
        assertEquals("接口测试机构", existing.getOrganizationName());
        assertEquals("TEST-API", existing.getCode());
    }

    @Test
    public void testImport_MissingParent_RejectsBeforeWriting() {
        assertThrows(UnprocessableEntityException.class, () -> service.save(UUID_VALUE, resource("dept"), "1"));
        verify(organizations, never()).save(any());
    }

    @Test
    public void testImport_InactiveParent_RejectsBeforeWriting() {
        var parent = row("20", PARENT_UUID);
        parent.setIsActive("N");
        when(organizations.getOrganizationByFhirId(PARENT_UUID)).thenReturn(parent);
        assertThrows(UnprocessableEntityException.class, () -> service.save(UUID_VALUE,
                resource("dept").setPartOf(new Reference("Organization/" + PARENT_UUID)), "1"));
        verify(organizations, never()).save(any());
    }

    @Test
    public void testImport_DuplicateCode_RejectsDifferentIdentity() {
        when(organizations.getAllMatching("code", "TEST-API")).thenReturn(List.of(row("200", PARENT_UUID)));
        assertThrows(UnprocessableEntityException.class,
                () -> service.save(UUID_VALUE, resource("referring clinic"), "1"));
        verify(organizations, never()).save(any());
    }

    @Test
    public void testImport_UnknownType_DoesNotCreateDictionaryValue() {
        assertThrows(UnprocessableEntityException.class, () -> service.save(UUID_VALUE, resource("unknown"), "1"));
        verify(organizations, never()).save(any());
    }

    @Test
    public void testImport_Unauthorized_DoesNotLookUpOrWriteMasterData() {
        assertThrows(ForbiddenOperationException.class,
                () -> service.save(UUID_VALUE, resource("referring clinic"), "2"));
        verifyZeroInteractions(organizations, locks);
    }

    private Organization resource(String type) {
        Organization resource = new Organization().setName("接口测试机构").setActive(true);
        resource.setId(UUID_VALUE);
        resource.addIdentifier().setSystem(SYSTEM + "/org_code").setValue("TEST-API");
        resource.addType().addCoding(new Coding(SYSTEM + "/orgType", type, null));
        return resource;
    }

    private static OrganizationType type(String id, String name) {
        OrganizationType type = new OrganizationType();
        type.setId(id);
        type.setName(name);
        return type;
    }

    private static org.openelisglobal.organization.valueholder.Organization row(String id, String uuid) {
        var row = new org.openelisglobal.organization.valueholder.Organization();
        row.setId(id);
        row.setFhirUuid(UUID.fromString(uuid));
        row.setIsActive("Y");
        return row;
    }
}
