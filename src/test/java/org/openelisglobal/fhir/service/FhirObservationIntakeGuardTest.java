package org.openelisglobal.fhir.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import ca.uhn.fhir.rest.server.exceptions.UnprocessableEntityException;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.List;
import java.util.UUID;
import org.hl7.fhir.r4.model.Observation;
import org.hl7.fhir.r4.model.Quantity;
import org.hl7.fhir.r4.model.Reference;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.result.service.ResultService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.unitofmeasure.valueholder.UnitOfMeasure;
import org.openelisglobal.userrole.service.UserRoleService;

@RunWith(MockitoJUnitRunner.class)
public class FhirObservationIntakeGuardTest {
    private static final UUID UUID_VALUE = UUID.fromString("6769b995-6cbf-4a3c-a115-22e6707b1b81");
    @Mock
    private AnalysisService analyses;
    @Mock
    private SampleHumanService sampleHumans;
    @Mock
    private ResultService results;
    @Mock
    private IStatusService statuses;
    @Mock
    private UserRoleService roles;
    @Mock
    private UserService users;
    @Mock
    private org.openelisglobal.dataexchange.fhir.FhirConfig config;
    @Mock
    private FhirClinicalTestReadiness readiness;
    private FhirObservationIntakeGuard guard;
    private Analysis analysis;

    @Before
    public void setUp() {
        guard = new FhirObservationIntakeGuard(analyses, sampleHumans, results, statuses, roles, users, config,
                readiness);
        lenient().when(config.getOeFhirSystem()).thenReturn("http://openelis-global.org");
        lenient().when(roles.userInRole("1", Constants.ROLE_GLOBAL_ADMIN)).thenReturn(true);
        analysis = new Analysis();
        analysis.setId("10");
        analysis.setStatusId("1");
        SampleItem item = new SampleItem();
        item.setSample(new Sample());
        item.setFhirUuid(UUID_VALUE);
        item.setCollectionDate(new Timestamp(1));
        item.setReceivedDate(new Timestamp(2));
        analysis.setSampleItem(item);
        var test = new org.openelisglobal.test.valueholder.Test();
        test.setId("20");
        test.setLoinc("6690-2");
        var unit = new UnitOfMeasure();
        unit.setName("10^9/L");
        test.setUnitOfMeasure(unit);
        analysis.setTest(test);
        var patient = new Patient();
        patient.setFhirUuid(UUID_VALUE);
        lenient().when(sampleHumans.getPatientForSample(item.getSample())).thenReturn(patient);
        lenient().when(analyses.getAllMatching("fhirUuid", UUID_VALUE)).thenReturn(List.of(analysis));
        lenient().when(statuses.getStatusID(AnalysisStatus.NotStarted)).thenReturn("1");
        lenient().when(statuses.getStatusID(AnalysisStatus.TechnicalAcceptance)).thenReturn("2");
    }

    @Test
    public void testValidate_ConsistentUnreviewedResult_AcceptsWithoutChangingStatus() {
        assertSame(analysis, guard.validate(observation(), "1", null));
        assertEquals("1", analysis.getStatusId());
        verify(analyses, never()).update(any());
    }

    @Test
    public void testValidate_WrongPatient_Rejects() {
        var input = observation().setSubject(new Reference("Patient/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"));
        assertThrows(UnprocessableEntityException.class, () -> guard.validate(input, "1", null));
    }

    @Test
    public void testValidate_WrongUnit_RejectsWithoutConversion() {
        var input = observation();
        input.getValueQuantity().setUnit("mg/dL");
        assertThrows(UnprocessableEntityException.class, () -> guard.validate(input, "1", null));
    }

    @Test
    public void testValidate_ExplicitLocalTestGuid_AcceptsWithoutInventingLoinc() {
        analysis.getTest().setGuid(UUID_VALUE.toString());
        var input = observation();
        input.getCode().getCodingFirstRep().setSystem("http://openelis-global.org/test-guid")
                .setCode(UUID_VALUE.toString());
        assertSame(analysis, guard.validate(input, "1", null));
        input.getCode().getCodingFirstRep().setCode("another-test");
        assertThrows(UnprocessableEntityException.class, () -> guard.validate(input, "1", null));
    }

    @Test
    public void testValidate_UnreceivedSpecimen_Rejects() {
        analysis.getSampleItem().setReceivedDate(null);
        assertThrows(UnprocessableEntityException.class, () -> guard.validate(observation(), "1", null));
    }

    @Test
    public void testValidate_ReviewedAnalysis_CannotOverwrite() {
        analysis.setStatusId("FINALIZED");
        assertThrows(UnprocessableEntityException.class, () -> guard.validate(observation(), "1", null));
    }

    private Observation observation() {
        var observation = new Observation().setStatus(Observation.ObservationStatus.FINAL)
                .setSubject(new Reference("Patient/" + UUID_VALUE)).setSpecimen(new Reference("Specimen/" + UUID_VALUE))
                .setValue(new Quantity().setValue(new BigDecimal("6.5")).setUnit("10^9/L"));
        observation.addBasedOn(new Reference("ServiceRequest/" + UUID_VALUE));
        observation.getCode().addCoding().setSystem("http://loinc.org").setCode("6690-2");
        return observation;
    }
}
