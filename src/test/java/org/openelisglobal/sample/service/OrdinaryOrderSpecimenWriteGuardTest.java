package org.openelisglobal.sample.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.InOrder;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.barcode.service.BarcodeInfoService;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.services.SampleAddService;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.patient.action.bean.PatientManagementInfo;
import org.openelisglobal.sample.action.util.SamplePatientUpdateData;
import org.openelisglobal.sample.dao.SpecimenIntakeDecisionDAO;
import org.openelisglobal.sample.dao.SpecimenReceiptDAO;
import org.openelisglobal.sample.exception.EntrySubmissionException;
import org.openelisglobal.sample.form.SamplePatientEntryForm;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.dao.SampleItemDAO;
import org.openelisglobal.sampleitem.service.SampleItemService;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.samplehuman.valueholder.SampleHuman;
import org.openelisglobal.sampletyperequest.service.SampleTypeRequestService;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;

/** Ordinary whole-order saves must not rewrite facts owned by intake actions. */
public class OrdinaryOrderSpecimenWriteGuardTest {
    private SamplePatientEntryServiceImpl service;
    private SamplePatientUpdateData data;
    private SampleItemService items;
    private SampleItemDAO itemDao;
    private SpecimenIntakeDecisionDAO decisions;
    private SpecimenReceiptDAO graphLocks;
    private SampleService samples;
    private SampleTypeRequestService specimenRequests;
    private BarcodeInfoService barcodes;
    private Sample sample;
    private TypeOfSample type;
    private Object oldFactory;
    private Object oldFields;

    @Before
    public void setUp() {
        oldFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        oldFields = ReflectionTestUtils.getField(FormFields.class, "instance");
        AutowireCapableBeanFactory factory = mock(AutowireCapableBeanFactory.class);
        DefaultConfigurationProperties properties = mock(DefaultConfigurationProperties.class);
        when(factory.getBean(DefaultConfigurationProperties.class)).thenReturn(properties);
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        ReflectionTestUtils.setField(FormFields.class, "instance", mock(FormFields.class));
        service = new SamplePatientEntryServiceImpl();
        data = mock(SamplePatientUpdateData.class);
        items = mock(SampleItemService.class);
        itemDao = mock(SampleItemDAO.class);
        decisions = mock(SpecimenIntakeDecisionDAO.class);
        graphLocks = mock(SpecimenReceiptDAO.class);
        samples = mock(SampleService.class);
        specimenRequests = mock(SampleTypeRequestService.class);
        barcodes = mock(BarcodeInfoService.class);
        ReflectionTestUtils.setField(service, "sampleItemService", items);
        ReflectionTestUtils.setField(service, "sampleItemDAO", itemDao);
        ReflectionTestUtils.setField(service, "specimenIntakeDecisionDAO", decisions);
        ReflectionTestUtils.setField(service, "specimenReceiptDAO", graphLocks);
        ReflectionTestUtils.setField(service, "analysisService", mock(AnalysisService.class));
        ReflectionTestUtils.setField(service, "sampleService", samples);
        ReflectionTestUtils.setField(service, "sampleTypeRequestService", specimenRequests);
        ReflectionTestUtils.setField(service, "barcodeInfoService", barcodes);
        ReflectionTestUtils.setField(service, "sampleHumanService", mock(SampleHumanService.class));
        when(decisions.findForTubes(anyList())).thenReturn(List.of());
        sample = new Sample();
        sample.setId("1");
        type = new TypeOfSample();
        type.setId("7");
        when(data.getSample()).thenReturn(sample);
        when(graphLocks.lockOrder("1")).thenReturn(sample);
    }

    @After
    public void tearDown() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", oldFactory);
        ReflectionTestUtils.setField(FormFields.class, "instance", oldFields);
    }

    @Test
    public void collectedTubeCannotBecomeReceivedThroughOrdinarySave() {
        SampleItem collected = item("11", null);
        SampleItem incoming = copyFacts(collected);
        incoming.setReceivedDate(time("2026-09-26 08:01:00"));
        SampleAddService.SampleTestCollection entry = row("11", incoming);
        when(items.get("11")).thenReturn(collected);
        when(data.getSampleItemsTests()).thenReturn(List.of(entry));

        EntrySubmissionException failure = assertThrows(EntrySubmissionException.class, this::persist);

        assertEquals(409, failure.getStatus());
        assertEquals("ORDER_SPECIMEN_WRITE_CONFLICT", failure.getCode());
        verify(samples, never()).update(sample);
        verify(itemDao, never()).update(collected);
        assertEquals(null, collected.getReceivedDate());
    }

    @Test
    public void laterConflictRejectsEntireBatchBeforeFirstTubeIsChanged() {
        SampleItem signed = item("11", time("2026-09-26 08:01:22"));
        SampleItem collected = item("12", null);
        SampleItem incomingSigned = copyFacts(signed);
        SampleItem incomingCollected = copyFacts(collected);
        incomingCollected.setReceivedDate(time("2026-09-26 08:03:00"));
        List<SampleAddService.SampleTestCollection> entries =
                List.of(row("11", incomingSigned), row("12", incomingCollected));
        when(items.get("11")).thenReturn(signed);
        when(items.get("12")).thenReturn(collected);
        when(data.getSampleItemsTests()).thenReturn(entries);

        assertThrows(EntrySubmissionException.class, this::persist);

        assertEquals(time("2026-09-26 08:01:22"), signed.getReceivedDate());
        assertEquals(null, collected.getReceivedDate());
        verify(itemDao, never()).update(signed);
        verify(itemDao, never()).update(collected);
        verify(samples, never()).update(sample);
    }

    @Test
    public void signedTubeCannotChangeCollector() {
        SampleItem signed = item("11", time("2026-09-26 08:01:22"));
        SampleItem changed = copyFacts(signed);
        changed.setCollector("different");
        SampleAddService.SampleTestCollection entry = row("11", changed);
        when(items.get("11")).thenReturn(signed);
        when(data.getSampleItemsTests()).thenReturn(List.of(entry));

        assertThrows(EntrySubmissionException.class, () -> service.preflightExistingTubes(data));
        assertEquals("collector", signed.getCollector());
        verify(itemDao, never()).update(signed);
    }

    @Test
    public void signedTubeCannotChangeExplicitCollectionMethod() {
        SampleItem signed = item("11", time("2026-09-26 08:01:22"));
        SampleItem changed = copyFacts(signed);
        changed.setCollectionMethod("changed method");
        SampleAddService.SampleTestCollection entry = row("11", changed);
        when(items.get("11")).thenReturn(signed);
        when(data.getSampleItemsTests()).thenReturn(List.of(entry));

        EntrySubmissionException failure = assertThrows(EntrySubmissionException.class, this::persist);

        assertEquals(409, failure.getStatus());
        verify(itemDao, never()).update(signed);
        verify(samples, never()).update(sample);
    }

    @Test
    public void ordinarySaveLocksWholeGraphBeforeInspectingExistingTube() {
        SampleItem signed = item("11", time("2026-09-26 08:01:22"));
        SampleItem changed = copyFacts(signed);
        changed.setCollector("changed");
        SampleAddService.SampleTestCollection entry = row("11", changed);
        when(items.get("11")).thenReturn(signed);
        when(data.getSampleItemsTests()).thenReturn(List.of(entry));

        assertThrows(EntrySubmissionException.class, this::persist);

        InOrder order = org.mockito.Mockito.inOrder(graphLocks, items);
        order.verify(graphLocks).lockOrder("1");
        order.verify(graphLocks).lockRequests("1");
        order.verify(graphLocks).lockItems("1");
        order.verify(graphLocks).lockAnalyses("1");
        order.verify(items).get("11");
        verify(samples, never()).update(sample);
    }

    @Test
    public void signedTubeCannotAddAnAnalysisThroughOrdinarySave() {
        SampleItem signed = item("11", time("2026-09-26 08:01:22"));
        SampleAddService.SampleTestCollection row = row("11", copyFacts(signed));
        org.openelisglobal.test.valueholder.Test extra = new org.openelisglobal.test.valueholder.Test();
        extra.setId("99");
        row.tests = List.of(extra);
        when(items.get("11")).thenReturn(signed);
        when(data.getSampleItemsTests()).thenReturn(List.of(row));

        assertThrows(EntrySubmissionException.class, () -> service.preflightExistingTubes(data));

        verify(itemDao, never()).update(signed);
    }

    @Test
    public void preflightAllowsUnchangedSignedTubeAlongsideNewTube() {
        SampleItem signed = item("11", time("2026-09-26 08:01:22"));
        SampleItem incomingSigned = copyFacts(signed);
        incomingSigned.setCollectionDate(time("2026-09-26 08:00:00"));
        incomingSigned.setReceivedDate(time("2026-09-26 08:01:00"));
        SampleItem newTube = item(null, null);
        List<SampleAddService.SampleTestCollection> entries =
                List.of(row("11", incomingSigned), row(null, newTube));
        when(items.get("11")).thenReturn(signed);
        when(data.getSampleItemsTests()).thenReturn(entries);

        assertEquals(java.util.Set.of("11"), service.preflightExistingTubes(data));
        assertEquals(time("2026-09-26 08:01:22"), signed.getReceivedDate());
        assertTrue(newTube.getId() == null);
    }

    @Test
    public void persistSampleDataInsertsSecondTubeWithoutUpdatingSignedTubeOrRematchingIt() {
        SampleItem signed = item("11", time("2026-09-26 08:01:22"));
        SampleItem incomingSigned = copyFacts(signed);
        SampleItem newTube = item(null, null);
        List<SampleAddService.SampleTestCollection> entries =
                List.of(row("11", incomingSigned), row(null, newTube));
        when(items.get("11")).thenReturn(signed);
        when(items.get("12")).thenReturn(newTube);
        when(items.insert(newTube)).thenAnswer(call -> {
            newTube.setId("12");
            return "12";
        });
        when(data.getSampleItemsTests()).thenReturn(entries);
        when(data.getSampleFields()).thenReturn(List.of());
        when(data.getSampleHuman()).thenReturn(new SampleHuman());

        java.util.Set<String> protectedIds = service.preflightExistingTubes(data);
        ReflectionTestUtils.invokeMethod(service, "persistSampleData", data, protectedIds);

        verify(items).insert(newTube);
        verify(itemDao, never()).update(signed);
        assertEquals(time("2026-09-26 08:01:22"), signed.getReceivedDate());
        ArgumentCaptor<List<SampleItem>> candidates = ArgumentCaptor.forClass(List.class);
        verify(specimenRequests).fulfillMatchingRequests(eq("1"), candidates.capture());
        assertEquals(List.of(newTube), candidates.getValue());
        ArgumentCaptor<Map<SampleItem, Integer>> labelRows = ArgumentCaptor.forClass(Map.class);
        verify(barcodes).saveBarcodeInfoForSampleAndSampleItems(eq(sample), eq(1), labelRows.capture());
        assertEquals(java.util.Set.of(newTube), labelRows.getValue().keySet());
    }

    private void persist() {
        service.persistData(data, mock(PatientManagementUpdate.class), new PatientManagementInfo(),
                new SamplePatientEntryForm(), new MockHttpServletRequest());
    }

    private SampleAddService.SampleTestCollection row(String id, SampleItem incoming) {
        SampleAddService parser = new SampleAddService("", "7", sample, "");
        SampleAddService.SampleTestCollection row = parser.new SampleTestCollection(incoming, List.of(), null, null,
                Map.of(), Map.of(), null);
        row.existingSampleItemId = id;
        return row;
    }

    private SampleItem item(String id, Timestamp received) {
        SampleItem item = new SampleItem();
        item.setId(id);
        item.setSample(sample);
        item.setTypeOfSample(type);
        item.setCollectionDate(time("2026-09-26 08:00:15"));
        item.setReceivedDate(received);
        item.setCollector("collector");
        item.setQuantity(1.0);
        return item;
    }

    private SampleItem copyFacts(SampleItem original) {
        SampleItem copy = item(original.getId(), original.getReceivedDate());
        copy.setCollectionDate(original.getCollectionDate());
        return copy;
    }

    private static Timestamp time(String value) {
        return Timestamp.valueOf(value);
    }
}
