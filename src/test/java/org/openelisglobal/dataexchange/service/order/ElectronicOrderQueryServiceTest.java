package org.openelisglobal.dataexchange.service.order;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.ExternalOrderStatus;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.dataexchange.fhir.FhirConfig;
import org.openelisglobal.dataexchange.fhir.FhirUtil;
import org.openelisglobal.dataexchange.order.dao.ElectronicOrderDAO;
import org.openelisglobal.dataexchange.order.form.ElectronicOrderQueryPaging;
import org.openelisglobal.dataexchange.order.form.ElectronicOrderViewForm;
import org.openelisglobal.dataexchange.order.form.ElectronicOrderViewForm.SearchType;
import org.openelisglobal.dataexchange.order.valueholder.ElectronicOrder;
import org.openelisglobal.organization.service.OrganizationService;
import org.openelisglobal.patient.service.PatientManagementAuthorizationService;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.statusofsample.service.StatusOfSampleService;
import org.openelisglobal.statusofsample.valueholder.StatusOfSample;
import org.openelisglobal.test.service.TestService;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

public class ElectronicOrderQueryServiceTest {
    private Object factoryBefore;
    private ElectronicOrderQueryService service;
    private ElectronicOrderDAO dao;
    private ElectronicOrderQueryAuthorizationService auth;
    private PatientManagementAuthorizationService entry;
    private IStatusService names;
    private StatusOfSampleService statuses;
    private SampleService samples;
    private FhirUtil fhir;
    private MockHttpServletRequest request;

    @Before
    public void setup() {
        factoryBefore = ReflectionTestUtils.getField(SpringContext.class, "factory");
        var factory = mock(AutowireCapableBeanFactory.class);
        var config = mock(DefaultConfigurationProperties.class);
        when(factory.getBean(DefaultConfigurationProperties.class)).thenReturn(config);
        when(config.getPropertyValue(Property.DEFAULT_DATE_LOCALE)).thenReturn("zh-CN");
        when(config.getPropertyValue(Property.AmbiguousDateHolder)).thenReturn("X");
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        dao = mock(ElectronicOrderDAO.class);
        auth = mock(ElectronicOrderQueryAuthorizationService.class);
        entry = mock(PatientManagementAuthorizationService.class);
        names = mock(IStatusService.class);
        statuses = mock(StatusOfSampleService.class);
        samples = mock(SampleService.class);
        fhir = mock(FhirUtil.class);
        request = new MockHttpServletRequest();
        when(auth.requireRead(request)).thenReturn("7");
        when(entry.canCreate(request, "7")).thenReturn(true);
        when(entry.canEdit(request, "7")).thenReturn(true);
        when(names.getStatusID(ExternalOrderStatus.Entered)).thenReturn("21");
        status("21", ExternalOrderStatus.Entered, "EXTERNAL_ORDER");
        status("23", ExternalOrderStatus.Realized, "EXTERNAL_ORDER");
        var entered = statuses.get("21");
        var realized = statuses.get("23");
        when(statuses.getAllMatching("statusType", "EXTERNAL_ORDER")).thenReturn(List.of(entered, realized));
        when(fhir.getFhirParser()).thenReturn(ca.uhn.fhir.context.FhirContext.forR4().newJsonParser());
        service = new ElectronicOrderQueryService(dao, auth, entry, names, statuses, mock(PatientService.class),
                samples, mock(OrganizationService.class), mock(TestService.class), fhir, mock(FhirConfig.class));
    }

    @After
    public void restore() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", factoryBefore);
    }

    private void status(String id, ExternalOrderStatus code, String type) {
        var status = mock(StatusOfSample.class);
        when(status.getId()).thenReturn(id);
        when(status.getStatusType()).thenReturn(type);
        when(status.getIsActive()).thenReturn("Y");
        when(status.getStatusOfSampleName()).thenReturn(code.name());
        when(status.getDefaultLocalizedName()).thenReturn("本地状态");
        when(statuses.get(id)).thenReturn(status);
        when(names.getExternalOrderStatusForID(id)).thenReturn(code);
    }

    private ElectronicOrderViewForm form() {
        var f = new ElectronicOrderViewForm();
        f.setQueryVersion("2");
        return f;
    }

    private ElectronicOrder order(String id, String state) {
        var e = new ElectronicOrder();
        e.setId(id);
        e.setExternalId("DEMO-" + id);
        e.setStatusId(state);
        var patient = new org.openelisglobal.patient.valueholder.Patient();
        patient.setId(id);
        var person = new org.openelisglobal.person.valueholder.Person();
        person.setId(id);
        person.setFirstName("模拟");
        patient.setPerson(person);
        e.setPatient(patient);
        e.setData("{\"resourceType\":\"Task\",\"focus\":{\"reference\":\"ServiceRequest/" + e.getExternalId() + "\"}}");
        e.setOrderTimestamp(Timestamp.valueOf("2026-10-06 12:00:00"));
        when(dao.getElectronicOrdersByExternalId(e.getExternalId())).thenReturn(List.of(e));
        return e;
    }

    private void rows(List<ElectronicOrder> list) {
        when(dao.searchElectronicOrderQuery(null,null,"21",null,null)).thenReturn(list);
    }

    @Test
    public void defaultUsesActualPendingStatusAndNoDates() {
        rows(List.of());
        var result = service.query(request, form());
        verify(dao).searchElectronicOrderQuery(null, null, "21", null, null);
        assertTrue(result.getPendingOnly());
        assertEquals("7", result.getCurrentUserId());
        assertEquals(0, ((ElectronicOrderQueryPaging) result.getPaging()).getTotalResults());
        assertEquals(50, ((ElectronicOrderQueryPaging) result.getPaging()).getPageSize());
        assertEquals("1", result.getPaging().getCurrentPage());
    }

    @Test
    public void dateRangePassesInclusiveStartAndExclusiveNextMidnight() {
        var f = form();
        f.setStartDate("2026/10/05");
        f.setEndDate("2026/10/06");
        service.query(request, f);
        verify(dao).searchElectronicOrderQuery(Timestamp.valueOf("2026-10-05 00:00:00"),
                Timestamp.valueOf("2026-10-07 00:00:00"), "21", null, null);
    }

    @Test
    public void endOnlyRetainsExistingSingleDayMeaning() {
        var f = form();
        f.setEndDate("2026/10/05");
        service.query(request, f);
        verify(dao).searchElectronicOrderQuery(Timestamp.valueOf("2026-10-05 00:00:00"),
                Timestamp.valueOf("2026-10-06 00:00:00"), "21", null, null);
    }

    @Test
    public void impossibleAndReversedDatesFailBeforeQuery() {
        var f = form();
        f.setStartDate("2026/02/30");
        assertThrows(ResponseStatusException.class, () -> service.query(request, f));
        f.setStartDate("2026/10/06");
        f.setEndDate("2026/10/05");
        assertThrows(ResponseStatusException.class, () -> service.query(request, f));
        verifyZeroInteractions(dao);
    }

    @Test
    public void mismatchedStatusCategoryAndContradictoryPendingFail() {
        status("1", ExternalOrderStatus.Entered, "ORDER");
        var f = form();
        f.setStatusId("1");
        assertThrows(ResponseStatusException.class, () -> service.query(request, f));
        f.setStatusId("23");
        assertThrows(ResponseStatusException.class, () -> service.query(request, f));
        verifyZeroInteractions(dao);
    }

    @Test
    public void explicitAllStatusesAvoidsPendingPredicate() {
        var f = form();
        f.setPendingOnly(false);
        service.query(request, f);
        verify(dao).searchElectronicOrderQuery(null, null, null, null, null);
        assertNull(f.getStatusId());
    }

    @Test
    public void keywordRespectsDatesAndStatusWhenFhirIsUnavailable() {
        var f = form();
        f.setSearchType(SearchType.IDENTIFIER);
        f.setSearchValue(" DEMO-AbC ");
        f.setStartDate("2026/10/05");
        service.query(request, f);
        verify(dao).searchElectronicOrderQuery(Timestamp.valueOf("2026-10-05 00:00:00"),
                Timestamp.valueOf("2026-10-06 00:00:00"), "21", List.of("demo-abc"), "demo-abc");
        assertEquals(List.of("FHIR_SEARCH_UNAVAILABLE"), f.getWarningCodes());
    }

    @Test
    public void emptyIdentifierUnsupportedTestIdsAndPageSizeFail() {
        var f = form();
        f.setSearchType(SearchType.IDENTIFIER);
        assertThrows(ResponseStatusException.class, () -> service.query(request, f));
        f.setSearchType(SearchType.DATE_STATUS);
        f.setTestIds(List.of("1"));
        assertThrows(ResponseStatusException.class, () -> service.query(request, f));
        f.setTestIds(null);
        f.setPageSize(30);
        assertThrows(ResponseStatusException.class, () -> service.query(request, f));
        verifyZeroInteractions(dao);
    }

    @Test
    public void eachPageIgnoresSessionCacheAndContainsExactlyRequestedRows() {
        var list = new ArrayList<ElectronicOrder>();
        for (int i = 1; i <= 101; i++)
            list.add(order(Integer.toString(i), "21"));
        rows(list);
        request.getSession().setAttribute(IActionConstants.RESULTS_SESSION_CACHE, List.of(List.of("other workspace")));
        var f = form();
        f.setPageSize(50);
        f.setPage(2);
        service.query(request, f);
        assertEquals(50, f.geteOrders().size());
        assertEquals("51", f.geteOrders().get(0).getElectronicOrderId());
        assertEquals("100", f.geteOrders().get(49).getElectronicOrderId());
        assertEquals(101, ((ElectronicOrderQueryPaging) f.getPaging()).getTotalResults());
        assertEquals("3", f.getPaging().getTotalPages());
        assertEquals(List.of(List.of("other workspace")),
                request.getSession().getAttribute(IActionConstants.RESULTS_SESSION_CACHE));
    }

    @Test
    public void badTaskPreservesIdentityLocalLabAndWarningInsteadOfDroppingRow() {
        var e = order("1", "21");
        e.setData("invalid Task");
        rows(List.of(e));
        var sample = new Sample();
        sample.setAccessionNumber("HMC-1");
        when(samples.getSampleByReferringId("DEMO-1")).thenReturn(sample);
        var f = form();
        service.query(request, f);
        var row = f.geteOrders().get(0);
        assertEquals("1", row.getElectronicOrderId());
        assertEquals("21", row.getStatusId());
        assertEquals("ENTERED", row.getStatusCode());
        assertEquals("HMC-1", row.getLabNumber());
        assertTrue(row.getWarningCodes().contains("TASK_DATA_UNAVAILABLE"));
        assertFalse(row.getCanReceive());
        assertEquals("LINKED_LOCAL_ORDER", row.getActionUnavailableReason());
    }

    @Test
    public void pendingIdentityAndLiveBothEntryPermissionsPermitManualReview() {
        rows(List.of(order("1", "21")));
        var f = form();
        service.query(request, f);
        assertTrue(f.geteOrders().get(0).getCanReceive());
        when(entry.canEdit(request, "7")).thenReturn(false);
        service.query(request, f);
        assertFalse(f.geteOrders().get(0).getCanReceive());
        assertEquals("NO_RECEIVE_PERMISSION", f.geteOrders().get(0).getActionUnavailableReason());
    }

    @Test
    public void realizedUnknownAndDuplicateExternalRowsNeverReceive() {
        var e = order("1", "21");
        rows(List.of(e));
        var duplicate = order("2", "21");
        when(dao.getElectronicOrdersByExternalId("DEMO-1")).thenReturn(List.of(e, duplicate));
        var f = form();
        service.query(request, f);
        assertEquals("AMBIGUOUS_EXTERNAL_ID", f.geteOrders().get(0).getActionUnavailableReason());
        e.setStatusId("23");
        service.query(request, f);
        assertEquals("NOT_PENDING", f.geteOrders().get(0).getActionUnavailableReason());
        e.setStatusId("999");
        service.query(request, f);
        assertEquals("UNKNOWN_STATUS", f.geteOrders().get(0).getActionUnavailableReason());
    }

    @Test
    public void fhirDetailFailureKeepsRowsAndWarns() {
        rows(List.of(order("1", "21")));
        var f = form();
        f.setUseAllInfo(true);
        service.query(request, f);
        assertEquals("DEMO-1", f.geteOrders().get(0).getExternalOrderId());
        assertTrue(f.geteOrders().get(0).getWarningCodes().contains("FHIR_DETAILS_UNAVAILABLE"));
    }

    @Test
    public void missingOrWrongTaskFocusCannotOfferReceiveCapability() {
        var e = order("1", "21");
        e.setData("{\"resourceType\":\"Task\"}");
        rows(List.of(e));
        var f = form();
        service.query(request, f);
        assertFalse(f.geteOrders().get(0).getCanReceive());
        assertEquals("INCOMPLETE_ORDER_DATA", f.geteOrders().get(0).getActionUnavailableReason());
        e.setData("{\"resourceType\":\"Task\",\"focus\":{\"reference\":\"Patient/other\"}}");
        f.setUseAllInfo(true);
        service.query(request, f);
        assertFalse(f.geteOrders().get(0).getCanReceive());
        verify(fhir, never()).getFhirClient(org.mockito.ArgumentMatchers.any());
    }

    @Test
    public void storedServiceRequestFallsBackReadOnlyWithoutInventingTaskCapability() {
        var e = order("1", "21");
        e.setData("{\"resourceType\":\"ServiceRequest\",\"authoredOn\":\"2026-10-04T08:00:00+08:00\"}");
        rows(List.of(e));
        var f = form();
        service.query(request, f);
        var row = f.geteOrders().get(0);
        assertEquals("1", row.getElectronicOrderId());
        assertEquals(
                org.openelisglobal.common.util.DateUtil.formatDateAsText(
                        new org.hl7.fhir.r4.model.DateTimeType("2026-10-04T08:00:00+08:00").getValue()),
                row.getRequestDateDisplay());
        assertTrue(row.getWarningCodes().contains("TASK_DATA_UNAVAILABLE"));
        assertFalse(row.getCanReceive());
        assertEquals("INCOMPLETE_ORDER_DATA", row.getActionUnavailableReason());
    }

    @Test
    public void unrelatedStoredResourceNeverOffersReceiveCapability() {
        var e = order("1", "21");
        e.setData("{\"resourceType\":\"Patient\",\"id\":\"other\"}");
        rows(List.of(e));
        var f = form();
        service.query(request, f);
        assertFalse(f.geteOrders().get(0).getCanReceive());
        assertEquals("INCOMPLETE_ORDER_DATA", f.geteOrders().get(0).getActionUnavailableReason());
    }

    @Test
    public void overflowingStatusIdFailsBeforeStatusLookup() {
        var f = form();
        f.setStatusId("999999999999999999999");
        assertThrows(ResponseStatusException.class, () -> service.query(request, f));
        verify(statuses, never()).get("999999999999999999999");
        verifyZeroInteractions(dao);
    }

    @Test
    public void fhirIdentifierValuesAreReturnedInsteadOfElementIds() {
        rows(List.of(order("1", "21")));
        var client = mock(ca.uhn.fhir.rest.client.api.IGenericClient.class, RETURNS_DEEP_STUBS);
        when(fhir.getFhirClient(null)).thenReturn(client);
        var sr = new org.hl7.fhir.r4.model.ServiceRequest();
        sr.addIdentifier().setValue("DEMO-1");
        sr.getSubject().setReference("Patient/fhir-patient");
        sr.setRequisition(new org.hl7.fhir.r4.model.Identifier().setValue("REF-42"));
        var patient = new org.hl7.fhir.r4.model.Patient();
        var passport = patient.addIdentifier().setSystem("passport").setValue("PASS-VALUE");
        passport.setId("ELEMENT-ID");
        var readExecutable1 = client.read().resource(org.hl7.fhir.r4.model.ServiceRequest.class).withId("DEMO-1");
        doReturn(sr).when(readExecutable1).execute();
        var readExecutable2 = client.read().resource(org.hl7.fhir.r4.model.Patient.class).withId("fhir-patient");
        doReturn(patient).when(readExecutable2).execute();
        var f = form();
        f.setUseAllInfo(true);
        service.query(request, f);
        assertEquals("PASS-VALUE", f.geteOrders().get(0).getPassportNumber());
        assertEquals("REF-42", f.geteOrders().get(0).getReferringLabNumber());
    }

    @Test
    public void sourceBusinessIdentifierMismatchFailsClosedBeforeMixingDetails() {
        var e = order("1", "21");
        e.setData(
                "{\"resourceType\":\"Task\",\"focus\":{\"reference\":\"ServiceRequest/resource-uuid\"},\"authoredOn\":\"2020-01-01T00:00:00Z\"}");
        rows(List.of(e));
        var client = mock(ca.uhn.fhir.rest.client.api.IGenericClient.class, RETURNS_DEEP_STUBS);
        when(fhir.getFhirClient(null)).thenReturn(client);
        var other = new org.hl7.fhir.r4.model.ServiceRequest();
        other.addIdentifier().setValue("OTHER-BUSINESS-ID");
        other.setRequisition(new org.hl7.fhir.r4.model.Identifier().setValue("OTHER-LAB"));
        var readExecutable3 = client.read().resource(org.hl7.fhir.r4.model.ServiceRequest.class)
                .withId("resource-uuid");
        doReturn(other).when(readExecutable3).execute();
        var f = form();
        f.setUseAllInfo(true);
        service.query(request, f);
        var row = f.geteOrders().get(0);
        assertFalse(row.getCanReceive());
        assertEquals("INCOMPLETE_ORDER_DATA", row.getActionUnavailableReason());
        assertTrue(row.getWarningCodes().contains("SOURCE_IDENTITY_MISMATCH"));
        assertNull(row.getReferringLabNumber());
        assertEquals(org.openelisglobal.common.util.DateUtil.formatDateAsText(e.getOrderTimestamp()),
                row.getRequestDateDisplay());
    }

    @Test
    public void focusResourceIdCanDifferWhenImportedBusinessIdentifierMatches() {
        var e = order("1", "21");
        e.setData("{\"resourceType\":\"Task\",\"focus\":{\"reference\":\"ServiceRequest/resource-uuid\"}}");
        rows(List.of(e));
        var client = mock(ca.uhn.fhir.rest.client.api.IGenericClient.class, RETURNS_DEEP_STUBS);
        when(fhir.getFhirClient(null)).thenReturn(client);
        var sr = new org.hl7.fhir.r4.model.ServiceRequest();
        sr.addIdentifier().setValue("DEMO-1");
        sr.getSubject().setReference("Patient/fhir-patient");
        var readExecutable4 = client.read().resource(org.hl7.fhir.r4.model.ServiceRequest.class)
                .withId("resource-uuid");
        doReturn(sr).when(readExecutable4).execute();
        var readExecutable5 = client.read().resource(org.hl7.fhir.r4.model.Patient.class).withId("fhir-patient");
        doReturn(new org.hl7.fhir.r4.model.Patient()).when(readExecutable5).execute();
        var f = form();
        f.setUseAllInfo(true);
        service.query(request, f);
        assertTrue(f.geteOrders().get(0).getCanReceive());
        assertFalse(f.geteOrders().get(0).getWarningCodes().contains("SOURCE_IDENTITY_UNCONFIRMED"));
    }

    @Test
    @SuppressWarnings("unchecked")
    public void secondaryIdentifierSearchIncludesImportedFirstIdentifierAndTail60() {
        var client = mock(ca.uhn.fhir.rest.client.api.IGenericClient.class, RETURNS_DEEP_STUBS);
        when(fhir.getFhirClient(null)).thenReturn(client);
        var sr = new org.hl7.fhir.r4.model.ServiceRequest();
        sr.setId("resource-uuid");
        String first = "P".repeat(61);
        sr.addIdentifier().setValue(first);
        sr.addIdentifier().setValue("HIS-SECOND");
        var bundle = new org.hl7.fhir.r4.model.Bundle();
        bundle.addEntry().setResource(sr);
        var searchExecutable = client.search().forResource(org.hl7.fhir.r4.model.ServiceRequest.class)
                .where(org.mockito.ArgumentMatchers.any(ca.uhn.fhir.rest.gclient.ICriterion.class))
                .returnBundle(org.hl7.fhir.r4.model.Bundle.class);
        doReturn(bundle).when(searchExecutable).execute();
        var f = form();
        f.setSearchType(SearchType.IDENTIFIER);
        f.setSearchValue("HIS-SECOND");
        f.setStartDate("2026/10/05");
        service.query(request, f);
        verify(dao).searchElectronicOrderQuery(Timestamp.valueOf("2026-10-05 00:00:00"),
                Timestamp.valueOf("2026-10-06 00:00:00"), "21", List.of("his-second", "resource-uuid", "p".repeat(60)),
                "his-second");
        assertEquals(List.of(), f.getWarningCodes());
    }

    @Test
    public void revokedReadPermissionPrecedesAllQueryAndStatusWork() {
        doThrow(new AccessDeniedException("denied")).when(auth).requireRead(request);
        assertThrows(AccessDeniedException.class, () -> service.query(request, form()));
        verifyZeroInteractions(dao, entry);
    }
}
