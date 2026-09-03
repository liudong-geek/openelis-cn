package org.openelisglobal.sample.validator;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyZeroInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.Test;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.organization.service.OrganizationService;
import org.openelisglobal.organization.service.OrganizationTypeService;
import org.openelisglobal.organization.valueholder.Organization;
import org.openelisglobal.organization.valueholder.OrganizationType;
import org.openelisglobal.sample.bean.SampleOrderItem;
import org.openelisglobal.sample.form.SamplePatientEntryForm;
import org.springframework.validation.BeanPropertyBindingResult;

public class RequesterMasterDataValidatorTest {

    @Test
    public void activeDepartmentBelowSelectedFacility_isAccepted() {
        OrganizationService organizationService = mock(OrganizationService.class);
        configureFacilityType(organizationService, "10");
        configureDepartmentType(organizationService, "11");
        when(organizationService.get("10")).thenReturn(organization("10", "Y", "本院", "CN-LOCAL"));
        when(organizationService.getOrganizationsByParentId("10"))
                .thenReturn(List.of(organization("11", "Y", "门诊", "CN-OPD")));

        BeanPropertyBindingResult errors = errors();
        validator(organizationService, true).validate("10", "11", null, errors);

        assertFalse(errors.hasErrors());
    }

    @Test
    public void departmentOutsideSelectedFacility_isRejected() {
        OrganizationService organizationService = mock(OrganizationService.class);
        configureFacilityType(organizationService, "10");
        when(organizationService.get("10")).thenReturn(organization("10", "Y", "本院", "CN-LOCAL"));
        when(organizationService.getOrganizationsByParentId("10"))
                .thenReturn(List.of(organization("12", "Y", "住院病区", "CN-IPD")));

        BeanPropertyBindingResult errors = errors();
        validator(organizationService, true).validate("10", "11", null, errors);

        assertTrue(errors.hasFieldErrors("sampleOrderItems.referringSiteDepartmentId"));
    }

    @Test
    public void inactiveFacility_isRejectedBeforeLoadingDepartments() {
        OrganizationService organizationService = mock(OrganizationService.class);
        when(organizationService.get("10")).thenReturn(organization("10", "N", "本院", "CN-LOCAL"));

        BeanPropertyBindingResult errors = errors();
        validator(organizationService, true).validate("10", "11", null, errors);

        assertTrue(errors.hasFieldErrors("sampleOrderItems.referringSiteId"));
        verify(organizationService).get("10");
    }

    @Test
    public void departmentWithoutFacility_isRejectedWithoutDatabaseLookup() {
        OrganizationService organizationService = mock(OrganizationService.class);

        BeanPropertyBindingResult errors = errors();
        validator(organizationService, false).validate(null, "11", null, errors);

        assertTrue(errors.hasFieldErrors("sampleOrderItems.referringSiteDepartmentId"));
        verifyZeroInteractions(organizationService);
    }

    @Test
    public void missingFacility_isRejectedWhenChinaMasterDataGuardIsEnabled() {
        OrganizationService organizationService = mock(OrganizationService.class);

        BeanPropertyBindingResult errors = errors();
        validator(organizationService, true).validate(null, null, null, errors);

        assertTrue(errors.hasFieldErrors("sampleOrderItems.referringSiteId"));
        verifyZeroInteractions(organizationService);
    }

    @Test
    public void activeOrganizationWithoutReferringFacilityType_isRejected() {
        OrganizationService organizationService = mock(OrganizationService.class);
        when(organizationService.get("10")).thenReturn(organization("10", "Y", "供应商", "VENDOR"));
        when(organizationService.getTypeIdsForOrganizationId("10")).thenReturn(List.of("99"));

        BeanPropertyBindingResult errors = errors();
        validator(organizationService, true).validate("10", null, null, errors);

        assertTrue(errors.hasFieldErrors("sampleOrderItems.referringSiteId"));
    }

    @Test
    public void canonicalValues_replaceClientSuppliedOrganizationText() {
        OrganizationService organizationService = mock(OrganizationService.class);
        when(organizationService.get("10")).thenReturn(organization("10", "Y", "本院", "CN-LOCAL"));
        when(organizationService.get("11")).thenReturn(organization("11", "Y", "门诊", "CN-OPD"));
        RequesterMasterDataValidator validator = validator(organizationService, true);
        SampleOrderItem orderItem = new SampleOrderItem();
        orderItem.setReferringSiteId("10");
        orderItem.setReferringSiteDepartmentId("11");
        orderItem.setReferringSiteName("伪造机构");
        orderItem.setReferringSiteDepartmentName("伪造科室");
        orderItem.setReferringSiteCode("伪造代码");
        orderItem.setNewRequesterName("自由文本机构");

        validator.applyCanonicalValues(orderItem);

        org.junit.Assert.assertEquals("本院", orderItem.getReferringSiteName());
        org.junit.Assert.assertEquals("门诊", orderItem.getReferringSiteDepartmentName());
        org.junit.Assert.assertEquals("CN-LOCAL", orderItem.getReferringSiteCode());
        assertNull(orderItem.getNewRequesterName());
    }

    private RequesterMasterDataValidator validator(OrganizationService organizationService,
            boolean requiresConfiguredRequester) {
        DefaultConfigurationProperties configuration = mock(DefaultConfigurationProperties.class);
        OrganizationTypeService organizationTypeService = mock(OrganizationTypeService.class);
        when(organizationTypeService.getOrganizationTypeByName("referring clinic"))
                .thenReturn(organizationType("5"));
        when(organizationTypeService.getOrganizationTypeByName("dept")).thenReturn(organizationType("11"));
        when(configuration.isPropertyValueEqual(Property.restrictFreeTextRefSiteEntry, "true"))
                .thenReturn(requiresConfiguredRequester);
        return new RequesterMasterDataValidator(organizationService, organizationTypeService, configuration);
    }

    private BeanPropertyBindingResult errors() {
        SamplePatientEntryForm form = new SamplePatientEntryForm();
        form.setSampleOrderItems(new SampleOrderItem());
        return new BeanPropertyBindingResult(form, "samplePatientEntryForm");
    }

    private void configureFacilityType(OrganizationService organizationService, String organizationId) {
        when(organizationService.getTypeIdsForOrganizationId(organizationId)).thenReturn(List.of("5"));
    }

    private void configureDepartmentType(OrganizationService organizationService, String organizationId) {
        when(organizationService.getTypeIdsForOrganizationId(organizationId)).thenReturn(List.of("11"));
    }

    private Organization organization(String id, String active, String name, String code) {
        Organization organization = new Organization();
        organization.setId(id);
        organization.setIsActive(active);
        organization.setOrganizationName(name);
        organization.setCode(code);
        return organization;
    }

    private OrganizationType organizationType(String id) {
        OrganizationType type = new OrganizationType();
        type.setId(id);
        return type;
    }
}
