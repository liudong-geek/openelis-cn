package org.openelisglobal.sampletyperequest.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.same;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.aopalliance.intercept.MethodInterceptor;
import org.hibernate.Hibernate;
import org.hibernate.bytecode.internal.bytebuddy.BytecodeProviderImpl;
import org.hibernate.engine.spi.SharedSessionContractImplementor;
import org.hibernate.proxy.HibernateProxy;
import org.junit.Test;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampletyperequest.controller.rest.SampleTypeRequestRestController;
import org.openelisglobal.sampletyperequest.dto.SampleTypeRequestDTO;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.openelisglobal.unitofmeasure.valueholder.UnitOfMeasure;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Real Hibernate proxies and controller/service code; persistence and loading
 * are mocked.
 */
public class SampleTypeRequestCancellationResponseTest {
    private final SharedSessionContractImplementor session = mock(SharedSessionContractImplementor.class,
            RETURNS_DEEP_STUBS);
    private final SampleTypeRequestServiceImpl service = spy(new SampleTypeRequestServiceImpl());
    private final SampleTypeRequest request = new SampleTypeRequest();
    private final List<HibernateProxy> proxies = new ArrayList<>();
    private TypeOfSample type;
    private UnitOfMeasure unit;

    private <T> T lazy(Class<T> entityType, String id, T target) throws Exception {
        var factory = new BytecodeProviderImpl().getProxyFactoryFactory().buildProxyFactory(session.getFactory());
        factory.postInstantiate(entityType.getName(), entityType, Set.of(HibernateProxy.class),
                entityType.getMethod("getId"), entityType.getMethod("setId", String.class), null);
        when(session.immediateLoad(entityType.getName(), id)).thenReturn(target);
        HibernateProxy proxy = factory.getProxy(id, session);
        proxies.add(proxy);
        return entityType.cast(proxy);
    }

    private SampleTypeRequestRestController controller(boolean withUnit) throws Exception {
        when(session.isOpenOrWaitingForAutoClose()).thenReturn(true);
        when(session.isConnected()).thenReturn(true);
        TypeOfSample loadedType = mock(TypeOfSample.class);
        when(loadedType.getId()).thenReturn("4");
        when(loadedType.getLocalizedName()).thenReturn("血清");
        type = lazy(TypeOfSample.class, "4", loadedType);
        request.setId(701);
        var sample = new Sample();
        sample.setId("301");
        request.setSample(sample);
        request.setTypeOfSample(type);
        request.setStatus(SampleTypeRequest.Status.REQUESTED);
        request.setRequestedQuantity(2.0);
        request.setSortOrder(1);
        request.setCreatedDate(Timestamp.valueOf("2026-01-01 10:00:00"));
        if (withUnit) {
            var loadedUnit = new UnitOfMeasure();
            loadedUnit.setId("2");
            loadedUnit.setUnitOfMeasureName("毫升");
            unit = lazy(UnitOfMeasure.class, "2", loadedUnit);
            request.setUnitOfMeasure(unit);
        }
        doReturn(request).when(service).get(701);
        doAnswer(call -> call.getArgument(0)).when(service).update(any(SampleTypeRequest.class));
        ProxyFactory boundary = new ProxyFactory(service);
        boundary.setInterfaces(SampleTypeRequestService.class);
        boundary.addAdvice((MethodInterceptor) invocation -> {
            try {
                return invocation.proceed();
            } finally {
                if (invocation.getMethod().getName().equals("cancelRequest")) {
                    proxies.forEach(proxy -> proxy.getHibernateLazyInitializer().unsetSession());
                }
            }
        });
        var controller = new SampleTypeRequestRestController();
        ReflectionTestUtils.setField(controller, "sampleTypeRequestService", boundary.getProxy());
        return controller;
    }

    private void assertCancellationResponse(boolean withUnit) throws Exception {
        var controller = controller(withUnit);
        assertFalse(Hibernate.isInitialized(type));
        if (withUnit) {
            assertFalse(Hibernate.isInitialized(unit));
        }
        ResponseEntity<?> response = controller.cancelRequest(701);
        // The old implementation changes status, then fails while reading the detached
        // proxy.
        assertEquals(SampleTypeRequest.Status.CANCELLED, request.getStatus());
        verify(service, times(1)).update(same(request));
        assertEquals(String.valueOf(response.getBody()), 200, response.getStatusCode().value());
        var dto = (SampleTypeRequestDTO) response.getBody();
        assertEquals("701", dto.getId());
        assertEquals("301", dto.getSampleId());
        assertEquals("4", dto.getTypeOfSampleId());
        assertEquals("血清", dto.getTypeOfSampleName());
        assertEquals("CANCELLED", dto.getStatus());
        assertNull(dto.getSampleItemId());
        assertEquals(Double.valueOf(2.0), dto.getRequestedQuantity());
        assertEquals("2026-01-01 10:00:00.0", dto.getCreatedDate());
        assertEquals(withUnit ? "2" : null, dto.getUnitOfMeasureId());
        assertEquals(withUnit ? "毫升" : null, dto.getUnitOfMeasureName());
        verify(service, times(1)).get(701);
        assertNull(((HibernateProxy) type).getHibernateLazyInitializer().getSession());
    }

    @Test
    public void cancelReturnsReadableDtoAfterSessionBoundaryWithUnit() throws Exception {
        assertCancellationResponse(true);
    }

    @Test
    public void cancelReturnsReadableDtoAfterSessionBoundaryWithoutUnit() throws Exception {
        assertCancellationResponse(false);
    }

    @Test
    public void collectedRequestStillReturnsConflictWithoutUpdate() throws Exception {
        var controller = controller(true);
        request.setStatus(SampleTypeRequest.Status.COLLECTED);
        assertEquals(409, controller.cancelRequest(701).getStatusCode().value());
        assertEquals(SampleTypeRequest.Status.COLLECTED, request.getStatus());
        verify(service, never()).update(any(SampleTypeRequest.class));
        assertFalse(Hibernate.isInitialized(type));
    }

    @Test
    public void cancelledRequestStillReturnsConflictWithoutUpdate() throws Exception {
        var controller = controller(false);
        request.setStatus(SampleTypeRequest.Status.CANCELLED);
        assertEquals(409, controller.cancelRequest(701).getStatusCode().value());
        assertEquals(SampleTypeRequest.Status.CANCELLED, request.getStatus());
        verify(service, never()).update(any(SampleTypeRequest.class));
        assertFalse(Hibernate.isInitialized(type));
    }

    @Test
    public void cancelUsesManagedUpdateResultAfterOriginalProxiesDetach() throws Exception {
        var controller = controller(true);
        TypeOfSample originalType = type;
        UnitOfMeasure originalUnit = unit;
        var managed = new SampleTypeRequest();
        managed.setId(request.getId());
        managed.setSample(request.getSample());
        managed.setStatus(SampleTypeRequest.Status.CANCELLED);
        var managedType = mock(TypeOfSample.class);
        when(managedType.getId()).thenReturn("4");
        when(managedType.getLocalizedName()).thenReturn("血清");
        managed.setTypeOfSample(lazy(TypeOfSample.class, "4", managedType));
        var managedUnit = new UnitOfMeasure();
        managedUnit.setId("2");
        managedUnit.setUnitOfMeasureName("毫升");
        managed.setUnitOfMeasure(lazy(UnitOfMeasure.class, "2", managedUnit));
        doAnswer(call -> {
            assertEquals(SampleTypeRequest.Status.CANCELLED, request.getStatus());
            ((HibernateProxy) originalType).getHibernateLazyInitializer().unsetSession();
            ((HibernateProxy) originalUnit).getHibernateLazyInitializer().unsetSession();
            return managed;
        }).when(service).update(same(request));

        ResponseEntity<?> response = controller.cancelRequest(701);
        assertEquals(String.valueOf(response.getBody()), 200, response.getStatusCode().value());
        var dto = (SampleTypeRequestDTO) response.getBody();
        assertEquals("701", dto.getId());
        assertEquals("301", dto.getSampleId());
        assertEquals("CANCELLED", dto.getStatus());
        assertEquals("4", dto.getTypeOfSampleId());
        assertEquals("血清", dto.getTypeOfSampleName());
        assertEquals("2", dto.getUnitOfMeasureId());
        assertEquals("毫升", dto.getUnitOfMeasureName());
        assertNull(dto.getSampleItemId());
        assertFalse(Hibernate.isInitialized(originalType));
        assertFalse(Hibernate.isInitialized(originalUnit));
        assertTrue(Hibernate.isInitialized(managed.getTypeOfSample()));
        assertTrue(Hibernate.isInitialized(managed.getUnitOfMeasure()));
        assertNull(((HibernateProxy) managed.getTypeOfSample()).getHibernateLazyInitializer().getSession());
        verify(service, times(1)).update(same(request));
        verify(service, times(1)).get(701);
    }
}
