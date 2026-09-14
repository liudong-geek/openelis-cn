package org.openelisglobal.common.services;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.ArrayList;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.qaevent.service.NceSpecimenService;
import org.openelisglobal.qaevent.service.QaObservationTypeService;
import org.openelisglobal.qaevent.valueholder.NceSpecimen;
import org.openelisglobal.referencetables.service.ReferenceTablesService;
import org.openelisglobal.referencetables.valueholder.ReferenceTables;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampleqaevent.service.SampleQaEventService;
import org.openelisglobal.sampleqaevent.valueholder.SampleQaEvent;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * SIM-only regression through the public path used by worklists and validation.
 */
public class QaEventScopeTest {
    private Object oldFactory;
    private Class<?> isolatedQa;
    private SampleQaEventService events;
    private NceSpecimenService nce;
    private Sample order;
    private SampleItem first;
    private SampleItem second;
    private Analysis analysis;

    @Before
    public void setUp() throws Exception {
        oldFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        var factory = mock(AutowireCapableBeanFactory.class);
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        events = mock(SampleQaEventService.class);
        nce = mock(NceSpecimenService.class);
        var references = mock(ReferenceTablesService.class);
        var reference = new ReferenceTables();
        reference.setId("99");
        when(references.getReferenceTableByName(any(ReferenceTables.class))).thenReturn(reference);
        when(factory.getBean(ReferenceTablesService.class)).thenReturn(references);
        when(factory.getBean(SampleQaEventService.class)).thenReturn(events);
        when(factory.getBean(NceSpecimenService.class)).thenReturn(nce);
        when(factory.getBean(QaObservationTypeService.class)).thenReturn(mock(QaObservationTypeService.class));
        var statuses = mock(IStatusService.class);
        when(factory.getBean(IStatusService.class)).thenReturn(statuses);
        when(statuses.getStatusID(StatusService.OrderStatus.NonConforming_depricated)).thenReturn("80");
        when(statuses.getStatusID(StatusService.AnalysisStatus.NonConforming_depricated)).thenReturn("81");
        // This legacy service captures beans and a final table ID during static
        // initialization. Load only it and its nested types in a throwaway loader;
        // never initialize or replace the shared JVM's QAService dependencies.
        ClassLoader parent = getClass().getClassLoader();
        ClassLoader loader = new ClassLoader(parent) {
            @Override
            protected synchronized Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
                if (!name.equals("org.openelisglobal.common.services.QAService")
                        && !name.startsWith("org.openelisglobal.common.services.QAService$")) {
                    return super.loadClass(name, resolve);
                }
                Class<?> loaded = findLoadedClass(name);
                if (loaded == null) {
                    try (var bytes = parent.getResourceAsStream(name.replace('.', '/') + ".class")) {
                        if (bytes == null) {
                            throw new ClassNotFoundException(name);
                        }
                        byte[] content = bytes.readAllBytes();
                        loaded = defineClass(name, content, 0, content.length);
                    } catch (java.io.IOException error) {
                        throw new ClassNotFoundException(name, error);
                    }
                }
                if (resolve) {
                    resolveClass(loaded);
                }
                return loaded;
            }
        };
        isolatedQa = Class.forName("org.openelisglobal.common.services.QAService", true, loader);
        assertSame(loader, isolatedQa.getClassLoader());
        assertNotSame(parent, isolatedQa.getClassLoader());
        assertNotSame(Class.forName("org.openelisglobal.common.services.QAService", false, parent), isolatedQa);
        order = new Sample();
        order.setId("301");
        order.setAccessionNumber("SIM-QA-SCOPE");
        order.setStatusId("11");
        first = tube("401");
        second = tube("402");
        analysis = analysis(first);
        when(events.getSampleQaEventsBySample(order)).thenReturn(List.of());
        when(nce.getSpecimenBySampleItemId(anyInt())).thenReturn(List.of());
    }

    @After
    public void tearDown() {
        isolatedQa = null;
        ReflectionTestUtils.setField(SpringContext.class, "factory", oldFactory);
    }

    private boolean analysisNonconforming(Analysis value) {
        return query("isAnalysisParentNonConforming", Analysis.class, value);
    }

    private boolean orderNonconforming(Sample value) {
        return query("isOrderNonConforming", Sample.class, value);
    }

    private boolean query(String method, Class<?> type, Object value) {
        try {
            return (boolean) isolatedQa.getMethod(method, type).invoke(null, value);
        } catch (ReflectiveOperationException error) {
            throw new AssertionError("The actual public QA scope read failed", error);
        }
    }

    private SampleItem tube(String id) {
        var type = new TypeOfSample();
        type.setId("31");
        var tube = new SampleItem();
        tube.setId(id);
        tube.setSample(order);
        tube.setTypeOfSample(type);
        return tube;
    }

    private Analysis analysis(SampleItem tube) {
        var value = new Analysis();
        value.setId("5" + tube.getId());
        value.setSampleTypeName("SIM-type");
        value.setSampleItem(tube);
        value.setStatusId("12");
        return value;
    }

    private SampleQaEvent event(String id, SampleItem tube) {
        var value = new SampleQaEvent();
        value.setId(id);
        value.setSample(order);
        value.setSampleItem(tube);
        return value;
    }

    private void given(SampleQaEvent... values) {
        when(events.getSampleQaEventsBySample(order)).thenReturn(List.of(values));
    }

    @Test
    public void noEventsDoesNotCreateANonconformity() {
        assertFalse(analysisNonconforming(analysis));
    }

    @Test
    public void oneOrderEventAppliesToEveryActualTube() {
        given(event("601", null));
        assertTrue(analysisNonconforming(analysis));
        assertTrue(analysisNonconforming(analysis(second)));
    }

    @Test
    public void scopeFixDoesNotIntroduceAutomaticClearanceForCompletedEvents() {
        var completed = event("601", null);
        // Keep the existing all-events read policy; setting a historical date
        // here must not invoke unrelated localized date display configuration.
        ReflectionTestUtils.setField(completed, "completedDate", java.sql.Date.valueOf("2026-09-13"));
        given(completed, event("602", second));
        assertTrue(analysisNonconforming(analysis));
    }

    @Test
    public void oneTubeEventOnlyAppliesToThatTubeEvenWhenTypesMatch() {
        given(event("601", first));
        assertTrue(analysisNonconforming(analysis));
        assertFalse(analysisNonconforming(analysis(second)));
    }

    @Test
    public void anotherTubeEventMustNotHideAnOrderEvent() {
        given(event("601", second), event("602", null));
        assertTrue(analysisNonconforming(analysis));
    }

    @Test
    public void orderEventMustNotBeHiddenWhenReturnedBeforeAnotherTubeEvent() {
        given(event("601", null), event("602", second));
        assertTrue(analysisNonconforming(analysis));
    }

    @Test
    public void allTubesStayFlaggedForMixedOrderAndTubeEvents() {
        given(event("601", first), event("602", null));
        assertTrue(analysisNonconforming(analysis));
        assertTrue(analysisNonconforming(analysis(second)));
        assertTrue(analysisNonconforming(analysis(tube("403"))));
    }

    @Test
    public void distinctEntityInstanceWithSameActualIdStillMatches() {
        given(event("601", tube("401")));
        assertTrue(analysisNonconforming(analysis));
    }

    @Test
    public void allAnalysesOfTheSamePhysicalTubeReceiveTheSameScope() {
        given(event("601", first));
        var anotherAnalysis = analysis(first);
        anotherAnalysis.setId("902");
        assertTrue(analysisNonconforming(analysis));
        assertTrue(analysisNonconforming(anotherAnalysis));
        assertFalse(analysisNonconforming(analysis(second)));
    }

    @Test
    public void orderScopeIsIndependentOfAllMixedEventPermutations() {
        var values = List.of(event("601", null), event("602", second), event("603", tube("403")));
        for (int a = 0; a < 3; a++) {
            for (int b = 0; b < 3; b++) {
                if (a == b) {
                    continue;
                }
                int c = 3 - a - b;
                given(values.get(a), values.get(b), values.get(c));
                assertTrue(analysisNonconforming(analysis));
            }
        }
    }

    @Test
    public void severalOtherTubeEventsDoNotMarkThisTube() {
        given(event("601", second), event("602", tube("403")));
        assertFalse(analysisNonconforming(analysis));
    }

    @Test
    public void repeatedOtherTubeEventsDoNotChangeTheirScope() {
        var event = event("601", second);
        given(event, event);
        assertFalse(analysisNonconforming(analysis));
    }

    @Test
    public void orderSummaryStillSeesAnEventOnAnyTube() {
        given(event("601", second));
        assertTrue(orderNonconforming(order));
        assertFalse(analysisNonconforming(analysis));
    }

    @Test
    public void existingNceSpecimenPathRemainsActive() {
        var nc = new NceSpecimen();
        when(nce.getSpecimenBySampleItemId(401)).thenReturn(List.of(nc));
        assertTrue(analysisNonconforming(analysis));
        verify(events, never()).getSampleQaEventsBySample(any(Sample.class));
    }

    @Test
    public void legacyOrderNonconformityIsNotChanged() {
        order.setStatusId("80");
        assertTrue(analysisNonconforming(analysis));
    }

    @Test
    public void legacyAnalysisNonconformityIsNotChanged() {
        analysis.setStatusId("81");
        assertTrue(analysisNonconforming(analysis));
    }

    @Test
    public void missingPhysicalTubeStillUsesExistingFalseContract() {
        analysis.setSampleItem(null);
        assertFalse(analysisNonconforming(analysis));
    }

    @Test
    public void eventReadDoesNotMutateOrderTubeOrEventCollection() {
        var firstEvent = event("601", second);
        var orderEvent = event("602", null);
        var values = new ArrayList<>(List.of(firstEvent, orderEvent));
        when(events.getSampleQaEventsBySample(order)).thenReturn(values);
        assertTrue(analysisNonconforming(analysis));
        assertEquals(List.of(firstEvent, orderEvent), values);
        assertSame(second, firstEvent.getSampleItem());
        assertNull(orderEvent.getSampleItem());
        assertEquals("11", order.getStatusId());
        assertFalse(first.isRejected());
        assertFalse(second.isRejected());
        verify(events, never()).update(any(SampleQaEvent.class));
        verify(events, never()).insert(any(SampleQaEvent.class));
        verify(events, never()).delete(any(SampleQaEvent.class));
    }
}
