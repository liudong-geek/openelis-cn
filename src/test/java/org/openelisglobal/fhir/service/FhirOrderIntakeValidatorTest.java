package org.openelisglobal.fhir.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import ca.uhn.fhir.rest.server.exceptions.UnprocessableEntityException;
import java.util.List;
import java.util.UUID;
import org.hl7.fhir.r4.model.Reference;
import org.hl7.fhir.r4.model.ServiceRequest;
import org.hl7.fhir.r4.model.Specimen;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.dataexchange.fhir.FhirConfig;
import org.openelisglobal.organization.service.OrganizationService;
import org.openelisglobal.organization.valueholder.Organization;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.sample.validator.RequesterMasterDataValidator;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;

@RunWith(MockitoJUnitRunner.class)
public class FhirOrderIntakeValidatorTest {
    private static final String PATIENT_UUID = "4fb79322-1a01-4297-8fc7-57272af27713";
    private static final String ORG_UUID = "bc826025-6962-4483-94a3-5756f631ae7c";
    private static final String SYSTEM = "http://openelis-global.org";
    @Mock
    private TestService tests;
    @Mock
    private TypeOfSampleService sampleTypes;
    @Mock
    private PatientService patients;
    @Mock
    private OrganizationService organizations;
    @Mock
    private RequesterMasterDataValidator requester;
    @Mock
    private FhirConfig config;
    @Mock
    private FhirClinicalTestReadiness readiness;
    private FhirOrderIntakeValidator validator;
    private org.openelisglobal.test.valueholder.Test test;

    @Before
    public void setUp() {
        validator = new FhirOrderIntakeValidator(tests, sampleTypes, patients, organizations, requester, config,
                readiness);
        lenient().when(config.getOeFhirSystem()).thenReturn(SYSTEM);
        Patient patient = new Patient();
        patient.setId("10");
        patient.setFhirUuid(UUID.fromString(PATIENT_UUID));
        lenient().when(patients.getAllMatching("fhirUuid", UUID.fromString(PATIENT_UUID))).thenReturn(List.of(patient));
        Organization org = new Organization();
        org.setId("20");
        org.setFhirUuid(UUID.fromString(ORG_UUID));
        org.setIsActive("Y");
        lenient().when(organizations.getOrganizationByFhirId(ORG_UUID)).thenReturn(org);
        TypeOfSample type = new TypeOfSample();
        type.setId("30");
        type.setDomain("CLINICAL");
        type.setActive(true);
        type.setLocalAbbreviation("WB");
        lenient().when(sampleTypes.getAllMatching("localAbbreviation", "WB")).thenReturn(List.of(type));
        test = new org.openelisglobal.test.valueholder.Test();
        test.setId("40");
        test.setIsActive("Y");
        TestSection section = new TestSection();
        section.setId("50");
        section.setIsActive("Y");
        test.setTestSection(section);
        lenient().when(tests.getTestsByLoincCode("6690-2")).thenReturn(List.of(test));
        lenient().when(sampleTypes.getTypeOfSampleForTest("40")).thenReturn(List.of(type));
    }

    @Test
    public void testValidate_CanonicalCodes_ResolvesWithoutClientLabels() {
        var resolved = validator.validate(request());
        assertEquals("10", resolved.patient().getId());
        assertEquals("40", resolved.test().getId());
        assertEquals("30", resolved.sampleType().getId());
        assertEquals("20", resolved.order().getReferringSiteId());
        verify(requester).validate(eq(resolved.order()), any());
        verify(requester).applyCanonicalValues(resolved.order());
    }

    @Test
    public void testValidate_ParsedFhirJson_ResolvesContainedSpecimen() {
        var parser = ca.uhn.fhir.context.FhirContext.forR4Cached().newJsonParser();
        var parsed = parser.parseResource(ServiceRequest.class, parser.encodeResourceToString(request()));
        assertEquals("30", validator.validate(parsed).sampleType().getId());
    }

    @Test
    public void testValidate_LegacyHumanDomain_IsStillClinical() {
        sampleTypes.getAllMatching("localAbbreviation", "WB").getFirst().setDomain("H");
        assertEquals("30", validator.validate(request()).sampleType().getId());
    }

    @Test
    public void testValidate_EnvironmentalOrUnknownDomain_Rejects() {
        var type = sampleTypes.getAllMatching("localAbbreviation", "WB").getFirst();
        type.setDomain("ENVIRONMENTAL");
        assertThrows(UnprocessableEntityException.class, () -> validator.validate(request()));
        type.setDomain("UNKNOWN");
        assertThrows(UnprocessableEntityException.class, () -> validator.validate(request()));
    }

    @Test
    public void testValidate_MissingPatient_Rejects() {
        when(patients.getAllMatching("fhirUuid", UUID.fromString(PATIENT_UUID))).thenReturn(List.of());
        assertThrows(UnprocessableEntityException.class, () -> validator.validate(request()));
    }

    @Test
    public void testValidate_UnknownTest_DoesNotFallBackToDisplay() {
        var input = request();
        input.getCode().getCodingFirstRep().setCode("unknown").setDisplay("白细胞计数");
        assertThrows(UnprocessableEntityException.class, () -> validator.validate(input));
        verify(tests, never()).getTestByDescription(anyString());
    }

    @Test
    public void testValidate_AmbiguousTest_RejectsInsteadOfChoosingFirst() {
        var other = new org.openelisglobal.test.valueholder.Test();
        other.setId("41");
        when(tests.getTestsByLoincCode("6690-2")).thenReturn(List.of(test, other));
        assertThrows(UnprocessableEntityException.class, () -> validator.validate(request()));
    }

    @Test
    public void testValidate_InactiveTest_Rejects() {
        test.setIsActive("N");
        doThrow(new UnprocessableEntityException("未启用")).when(readiness).validate(test);
        assertThrows(UnprocessableEntityException.class, () -> validator.validate(request()));
    }

    @Test
    public void testValidate_MismatchedSpecimenType_Rejects() {
        when(sampleTypes.getTypeOfSampleForTest("40")).thenReturn(List.of());
        assertThrows(UnprocessableEntityException.class, () -> validator.validate(request()));
    }

    @Test
    public void testValidate_StopOrder_RejectsInsteadOfStartingTest() {
        assertThrows(UnprocessableEntityException.class, () -> validator.validate(request().setDoNotPerform(true)));
    }

    @Test
    public void testValidate_FutureOrderDate_Rejects() {
        var input = request().setAuthoredOn(new java.util.Date(System.currentTimeMillis() + 86400000L));
        assertThrows(UnprocessableEntityException.class, () -> validator.validate(input));
    }

    @Test
    public void testValidate_SpecimenForAnotherPatient_Rejects() {
        var input = request();
        ((Specimen) input.getContained().getFirst()).setSubject(new Reference("Patient/" + ORG_UUID));
        assertThrows(UnprocessableEntityException.class, () -> validator.validate(input));
    }

    private ServiceRequest request() {
        ServiceRequest input = new ServiceRequest().setStatus(ServiceRequest.ServiceRequestStatus.ACTIVE)
                .setIntent(ServiceRequest.ServiceRequestIntent.ORDER)
                .setSubject(new Reference("Patient/" + PATIENT_UUID))
                .setRequester(new Reference("Organization/" + ORG_UUID));
        input.addIdentifier().setSystem("https://test.invalid/his/orders").setValue("TEST-API-1");
        input.getCode().addCoding().setSystem("http://loinc.org").setCode("6690-2");
        Specimen specimen = new Specimen();
        specimen.setId("requested-specimen");
        specimen.getType().addCoding().setSystem(SYSTEM + "/sampleType").setCode("WB");
        input.addContained(specimen);
        input.addSpecimen(new Reference("#requested-specimen"));
        return input;
    }
}
