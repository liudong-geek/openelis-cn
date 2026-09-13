package org.openelisglobal.sampletyperequest.service;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.sql.Timestamp;
import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.service.SampleItemService;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.dao.SampleTypeRequestDAO;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.springframework.test.util.ReflectionTestUtils;

/** Real fulfillment decisions with SIM objects; no database or clinical writes. */
public class SampleTypeRequestFulfillmentIdentityTest {
    private SampleTypeRequestServiceImpl service;
    private SampleTypeRequest request;
    private SampleItem item;

    @Before
    public void setUp() {
        service = spy(new SampleTypeRequestServiceImpl());
        request = new SampleTypeRequest();
        request.setId(701); request.setSample(sample("301")); request.setTypeOfSample(type("31"));
        item = new SampleItem(); item.setId("801"); item.setSample(sample("301")); item.setTypeOfSample(type("31"));
        item.setCollectionDate(Timestamp.valueOf("2026-01-01 10:00:00")); item.setStatusId("SIM-ready");
        doReturn(request).when(service).get(701);
        var items = mock(SampleItemService.class);
        when(items.get("801")).thenReturn(item);
        ReflectionTestUtils.setField(service, "sampleItemService", items);
        // Both read and locking-read variants receive the same explicitly scoped SIM set.
        // This does not simulate locking or claim database concurrency coverage.
        var dao = mock(SampleTypeRequestDAO.class, call -> {
            if ((call.getMethod().getName().equals("getRequestsBySampleId")
                    || call.getMethod().getName().equals("getRequestsBySampleIdForUpdate"))
                    && "301".equals(call.getArgument(0))) { return List.of(request); }
            return org.mockito.Answers.RETURNS_DEFAULTS.answer(call);
        });
        ReflectionTestUtils.setField(service, "sampleTypeRequestDAO", dao);
        // The working tree additionally has an uncommitted collection-state collaborator.
        // Supply its valid SIM state without making the independent identity patch depend on it.
        if (org.springframework.util.ReflectionUtils.findField(service.getClass(), "statusService") != null) {
            var statuses = mock(IStatusService.class);
            when(statuses.matches("SIM-ready", SampleStatus.Entered)).thenReturn(true);
            ReflectionTestUtils.setField(service, "statusService", statuses);
        }
        doAnswer(call -> call.getArgument(0)).when(service).update(org.mockito.ArgumentMatchers.any(SampleTypeRequest.class));
    }

    private static Sample sample(String id) { var value = new Sample(); value.setId(id); return value; }
    private static TypeOfSample type(String id) { var value = new TypeOfSample(); value.setId(id); return value; }
    private void collected() { request.setStatus(SampleTypeRequest.Status.COLLECTED); request.setSampleItem(item); }
    private void rejected() {
        var status = request.getStatus(); var linked = request.getSampleItem();
        RuntimeException failure = assertThrows(RuntimeException.class, () -> service.fulfillRequest(701, "801"));
        assertTrue("Must be an explicit business conflict, not NPE or infrastructure failure",
                failure instanceof IllegalStateException || failure.getClass().getName().equals(
                        "org.openelisglobal.sample.exception.SampleCollectionValidationException"));
        assertEquals(status, request.getStatus()); assertSame(linked, request.getSampleItem());
        verify(service, never()).update(org.mockito.ArgumentMatchers.any(SampleTypeRequest.class));
    }

    @Test public void testFulfill_ForeignOrder_RejectsBeforeMutation() { item.setSample(sample("302")); rejected(); }
    @Test public void testFulfill_WrongType_RejectsBeforeMutation() { item.setTypeOfSample(type("32")); rejected(); }
    @Test public void testFulfill_MissingOrderIdentity_RejectsExplicitly() { request.setSample(sample(null)); rejected(); }
    @Test public void testFulfill_WrongLoadedRequestId_Rejects() { request.setId(702); rejected(); }
    @Test public void testFulfill_WrongLoadedPhysicalId_Rejects() { item.setId("802"); rejected(); }
    @Test public void testFulfill_PendingButAlreadyLinked_DoesNotOverwrite() {
        var old = new SampleItem(); old.setId("800"); request.setSampleItem(old); rejected();
    }
    @Test public void testReplay_ForeignOrder_DoesNotTreatAsSuccess() { collected(); item.setSample(sample("302")); rejected(); }
    @Test public void testReplay_WrongType_DoesNotTreatAsSuccess() { collected(); item.setTypeOfSample(type("32")); rejected(); }
    @Test public void testReplay_VoidedPhysicalTube_DoesNotTreatAsSuccess() { collected(); item.setVoided(true); rejected(); }
    @Test public void testReplay_RejectedPhysicalTube_DoesNotTreatAsSuccess() { collected(); item.setRejected(true); rejected(); }
    @Test public void testReplay_MissingTypeIdentity_RejectsExplicitly() { collected(); request.setTypeOfSample(type(null)); rejected(); }
    @Test public void testReplay_CancelledRequest_DoesNotResurrect() {
        collected(); request.setStatus(SampleTypeRequest.Status.CANCELLED); rejected();
    }
    @Test public void testReplay_OrderProgress_IsReadOnlyAndPreservesStatus() {
        collected(); item.getSample().setStatusId("SIM-order-complete");
        assertSame(request, service.fulfillRequest(701, "801"));
        assertSame(item, request.getSampleItem()); assertEquals("SIM-ready", item.getStatusId());
        assertEquals("SIM-order-complete", item.getSample().getStatusId());
        verify(service, never()).update(org.mockito.ArgumentMatchers.any(SampleTypeRequest.class));
    }
    @Test public void testFulfill_ValidNewLink_UpdatesExactlyOnce() {
        assertSame(request, service.fulfillRequest(701, "801"));
        assertEquals(SampleTypeRequest.Status.COLLECTED, request.getStatus());
        assertSame(item, request.getSampleItem());
        verify(service, times(1)).update(same(request));
    }
}
