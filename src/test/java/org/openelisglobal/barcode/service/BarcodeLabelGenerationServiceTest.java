package org.openelisglobal.barcode.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.sql.Timestamp;
import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.audittrail.dao.AuditTrailService;
import org.openelisglobal.barcode.dao.BarcodeLabelGenerationDAO;
import org.openelisglobal.barcode.dto.BarcodeLabelGenerateRequest;
import org.openelisglobal.barcode.dto.BarcodeLabelGenerateRequest.RequestedLabel;
import org.openelisglobal.barcode.dto.BarcodeLabelGenerateResponse;
import org.openelisglobal.barcode.exception.BarcodeLabelGenerationException;
import org.openelisglobal.barcode.labeltype.Label;
import org.openelisglobal.barcode.valueholder.BarcodeLabelInfo;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.person.valueholder.Person;
import org.openelisglobal.referencetables.service.ReferenceTablesService;
import org.openelisglobal.referencetables.valueholder.ReferenceTables;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.springframework.test.util.ReflectionTestUtils;

public class BarcodeLabelGenerationServiceTest {
    private final BarcodeLabelGenerationDAO dao = mock(BarcodeLabelGenerationDAO.class);
    private final BarcodeLabelGenerationRenderer renderer = mock(BarcodeLabelGenerationRenderer.class);
    private final BarcodeLabelInfoService counts = mock(BarcodeLabelInfoService.class);
    private final AuditTrailService audit = mock(AuditTrailService.class);
    private final ReferenceTablesService referenceTables = mock(ReferenceTablesService.class);
    private final Sample sample = new Sample();
    private final SampleItem specimen = new SampleItem();
    private final Patient patient = new Patient();
    private final Label orderLabel = mock(Label.class);
    private final Label specimenLabel = mock(Label.class);
    private final BarcodeLabelGenerationPermissionService.BoundOperator operator = new BarcodeLabelGenerationPermissionService.BoundOperator(null, null, null, null, "7", "SIM-operator", 0, java.util.Set.of());
    private BarcodeLabelGenerationServiceImpl service;

    @Before
    public void setup() {
        service = new BarcodeLabelGenerationServiceImpl(dao, renderer, counts, audit, referenceTables);
        var permissions = mock(BarcodeLabelGenerationPermissionService.class);
        when(permissions.bindCurrent(any())).thenAnswer(call -> call.getArgument(0));
        ReflectionTestUtils.setField(service, "permissions", permissions);
        ReferenceTables configuration = new ReferenceTables();
        configuration.setKeepHistory("Y");
        when(referenceTables.getReferenceTableByName("BARCODE_LABEL_INFO")).thenReturn(configuration);
        sample.setId("12");
        sample.setAccessionNumber("TEST260001");
        // Avoid the display-only DateUtil side effect of the entity setter.
        ReflectionTestUtils.setField(sample, "receivedTimestamp", new Timestamp(1000));
        specimen.setId("41");
        specimen.setSample(sample);
        specimen.setSortOrder("2");
        specimen.setTypeOfSample(new TypeOfSample());
        patient.setId("9");
        Person person = new Person();
        person.setId("8");
        patient.setPerson(person);
        when(dao.lockOrder("12")).thenReturn(sample);
        when(dao.lockSampleItems("12")).thenReturn(List.of(specimen));
        when(dao.findClinicalPatients("12")).thenReturn(List.of(patient));
        when(dao.findCounters(anyString())).thenReturn(List.of());
        when(dao.isSpecimenEligible("41")).thenReturn(true);
        when(renderer.maximumRequestQuantity()).thenReturn(100);
        when(renderer.createOrderLabel(patient, sample)).thenReturn(orderLabel);
        when(renderer.createSpecimenLabel(patient, sample, specimen)).thenReturn(specimenLabel);
        when(orderLabel.getCode()).thenReturn("TEST260001");
        when(specimenLabel.getCode()).thenReturn("TEST260001.2");
        when(orderLabel.getMaxNumLabels()).thenReturn(10);
        when(specimenLabel.getMaxNumLabels()).thenReturn(10);
        when(renderer.render(anyList())).thenReturn(new byte[] {37, 80, 68, 70, 45, 49});
    }

    private BarcodeLabelGenerateRequest request(RequestedLabel... labels) {
        return new BarcodeLabelGenerateRequest("12", "TEST260001", List.of(labels));
    }

    private void rejects(String code, BarcodeLabelGenerateRequest request) {
        try {
            service.generate(request, operator);
            fail("Expected rejection");
        } catch (BarcodeLabelGenerationException error) {
            assertEquals(code, error.getCode());
        }
        verify(counts, never()).save(any());
        verify(audit, never()).saveNewHistory(any(), anyString(), anyString());
    }

    @Test
    public void returnsExactGeneratedManifestAndCountsOnlyAfterRendering() {
        BarcodeLabelGenerateResponse result = service.generate(request(new RequestedLabel("order", null, 2),
                new RequestedLabel("specimen", "41", 3)), operator);
        assertEquals(5, result.totalGenerated());
        assertEquals(2, result.items().get(0).generatedQuantity());
        assertEquals("41", result.items().get(1).sampleItemId());
        assertEquals("TEST260001.2", result.items().get(1).barcode());
        assertNotNull(result.pdfBase64());
        var sequence = inOrder(renderer, counts, audit, dao);
        sequence.verify(renderer).render(anyList());
        sequence.verify(counts).save(argThat(info -> info.getNumPrinted() == 2 && "7".equals(info.getSysUserId())));
        sequence.verify(audit).saveNewHistory(any(), eq("7"), eq("BARCODE_LABEL_INFO"));
        sequence.verify(counts).save(argThat(info -> info.getNumPrinted() == 3));
        sequence.verify(audit).saveNewHistory(any(), eq("7"), eq("BARCODE_LABEL_INFO"));
        sequence.verify(dao).flush();
    }

    @Test
    public void reportsPartialRemainingQuantityAndDoesNotCountRequestedQuantity() {
        BarcodeLabelInfo previous = new BarcodeLabelInfo("TEST260001");
        previous.setId("80");
        previous.setType("order");
        previous.setNumPrinted(8);
        when(dao.findCounters("TEST260001")).thenReturn(List.of(previous));
        var result = service.generate(request(new RequestedLabel("order", null, 5)), operator);
        assertEquals(5, result.items().get(0).requestedQuantity());
        assertEquals(2, result.items().get(0).generatedQuantity());
        assertEquals("PRINT_LIMIT", result.items().get(0).reason());
        assertEquals(10, previous.getNumPrinted());
        verify(audit).saveHistory(eq(previous), argThat(before -> ((BarcodeLabelInfo) before).getNumPrinted() == 8),
                eq("7"), anyString(), eq("BARCODE_LABEL_INFO"));
    }

    @Test
    public void zeroRemainingReturnsNoPdfAndNoWrite() {
        when(orderLabel.getMaxNumLabels()).thenReturn(0);
        var result = service.generate(request(new RequestedLabel("order", null, 2)), operator);
        assertEquals(0, result.totalGenerated());
        assertNull(result.pdfBase64());
        assertEquals("PRINT_LIMIT", result.items().get(0).reason());
        verify(renderer, never()).render(anyList());
        verify(counts, never()).save(any());
    }

    @Test
    public void renderFailureNeverPersistsCounters() {
        when(renderer.render(anyList())).thenThrow(new IllegalStateException("render failed"));
        rejects("BARCODE_GENERATION_FAILED", request(new RequestedLabel("order", null, 2)));
    }

    @Test
    public void emptyPdfNeverPersistsCounters() {
        when(renderer.render(anyList())).thenReturn(new byte[0]);
        rejects("BARCODE_GENERATION_FAILED", request(new RequestedLabel("order", null, 2)));
    }

    @Test
    public void rejectsMismatchedAccession() {
        rejects("BARCODE_IDENTIFIER_MISMATCH", new BarcodeLabelGenerateRequest("12", "OTHER", List.of(new RequestedLabel("order", null, 1))));
    }

    @Test
    public void rejectsAnotherOrdersSpecimen() {
        rejects("BARCODE_SPECIMEN_INVALID", request(new RequestedLabel("specimen", "42", 1)));
    }

    @Test
    public void rejectsVoidedAndIneligibleSpecimens() {
        specimen.setVoided(true);
        rejects("BARCODE_SPECIMEN_INVALID", request(new RequestedLabel("specimen", "41", 1)));
        specimen.setVoided(false);
        when(dao.isSpecimenEligible("41")).thenReturn(false);
        rejects("BARCODE_SPECIMEN_INVALID", request(new RequestedLabel("specimen", "41", 1)));
    }

    @Test
    public void rejectsDisposedRejectedOrConflictingOrdersFromPersistedFacts() {
        when(dao.isOrderBlocked("12")).thenReturn(true);
        rejects("BARCODE_ORDER_BLOCKED", request(new RequestedLabel("order", null, 1)));
    }

    @Test
    public void rejectsAbsentOrAmbiguousPatientWithoutInventingOne() {
        when(dao.findClinicalPatients("12")).thenReturn(List.of());
        rejects("BARCODE_CLINICAL_ORDER_REQUIRED", request(new RequestedLabel("order", null, 1)));
        when(dao.findClinicalPatients("12")).thenReturn(List.of(patient, patient));
        rejects("BARCODE_CLINICAL_ORDER_REQUIRED", request(new RequestedLabel("order", null, 1)));
    }

    @Test
    public void rejectsDuplicateEntriesAndRequestTotalBeforeLocking() {
        rejects("BARCODE_REQUEST_INVALID", request(new RequestedLabel("order", null, 1), new RequestedLabel("order", null, 2)));
        rejects("BARCODE_QUANTITY_INVALID", request(new RequestedLabel("order", null, 60), new RequestedLabel("specimen", "41", 60)));
        verify(dao, never()).lockOrder(anyString());
    }

    @Test
    public void rejectsDuplicateStoredCountersInsteadOfResettingToZero() {
        when(dao.findCounters("TEST260001")).thenReturn(List.of(new BarcodeLabelInfo(), new BarcodeLabelInfo()));
        rejects("BARCODE_COUNTER_INVALID", request(new RequestedLabel("order", null, 1)));
    }

    @Test
    public void rejectsNegativeStoredCounter() {
        BarcodeLabelInfo previous = new BarcodeLabelInfo("TEST260001");
        previous.setNumPrinted(-1);
        when(dao.findCounters("TEST260001")).thenReturn(List.of(previous));
        rejects("BARCODE_COUNTER_INVALID", request(new RequestedLabel("order", null, 1)));
    }

    @Test
    public void rejectsDuplicateSpecimenBarcodeAndNeverUsesArrayPosition() {
        SampleItem another = new SampleItem();
        another.setId("42");
        another.setSample(sample);
        another.setSortOrder("2");
        when(dao.lockSampleItems("12")).thenReturn(List.of(specimen, another));
        rejects("BARCODE_SPECIMEN_INVALID", request(new RequestedLabel("specimen", "41", 1)));
    }

    @Test
    public void rejectsAnonymousServiceInvocation() {
        try {
            var invalid = new BarcodeLabelGenerationPermissionService.BoundOperator(null, null, null, null, "0", "SIM-operator", 0, java.util.Set.of());
            service.generate(request(new RequestedLabel("order", null, 1)), invalid);
            fail("Expected auth rejection");
        } catch (BarcodeLabelGenerationException error) {
            assertEquals(401, error.getStatus());
        }
        verify(dao, never()).lockOrder(anyString());
    }

    @Test
    public void rejectsMissingOrDisabledAuditConfigurationBeforeGenerating() {
        when(referenceTables.getReferenceTableByName("BARCODE_LABEL_INFO")).thenReturn(null);
        rejects("BARCODE_CONFIGURATION_INVALID", request(new RequestedLabel("order", null, 1)));
        ReferenceTables configuration = new ReferenceTables();
        configuration.setKeepHistory("N");
        when(referenceTables.getReferenceTableByName("BARCODE_LABEL_INFO")).thenReturn(configuration);
        rejects("BARCODE_CONFIGURATION_INVALID", request(new RequestedLabel("order", null, 1)));
        verify(renderer, never()).render(anyList());
    }

    @Test
    public void respectsSmallerSiteTotalLimit() {
        when(renderer.maximumRequestQuantity()).thenReturn(3);
        rejects("BARCODE_QUANTITY_INVALID", request(new RequestedLabel("order", null, 2), new RequestedLabel("specimen", "41", 2)));
    }

    @Test
    public void counterPersistenceAndAuditErrorsEscapeInsteadOfReturningSuccess() {
        doThrow(new IllegalStateException("unavailable")).when(audit).saveNewHistory(any(), anyString(), anyString());
        try {
            service.generate(request(new RequestedLabel("order", null, 1)), operator);
            fail("Expected transaction failure");
        } catch (IllegalStateException expected) {
            assertEquals("unavailable", expected.getMessage());
        }
        verify(dao, never()).flush();
    }
}
