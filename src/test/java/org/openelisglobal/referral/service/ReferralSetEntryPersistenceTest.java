package org.openelisglobal.referral.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.verifyZeroInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.services.SampleAddService;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.organization.service.OrganizationService;
import org.openelisglobal.organization.valueholder.Organization;
import org.openelisglobal.referral.action.beanitems.ReferralItem;
import org.openelisglobal.referral.fhir.service.FhirReferralService;
import org.openelisglobal.referral.valueholder.Referral;
import org.openelisglobal.referral.valueholder.ReferralResult;
import org.openelisglobal.referral.valueholder.ReferralStatus;
import org.openelisglobal.result.service.ResultService;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.sample.action.util.SamplePatientUpdateData;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.test.service.TestService;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.test.util.ReflectionTestUtils;

/** Real local referral creation with mocked persistence; no database or network. */
public class ReferralSetEntryPersistenceTest {
    private ReferralSetServiceImpl service;
    private ReferralService referralService;
    private ReferralResultService referralResultService;
    private ResultService resultService;
    private FhirReferralService fhirReferralService;
    private OrganizationService organizationService;
    private TestService testService;
    private Object oldFactory;
    private Object oldFormFields;

    @Before
    public void setUp() {
        oldFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        oldFormFields = ReflectionTestUtils.getField(FormFields.class, "instance");
        var factory = mock(AutowireCapableBeanFactory.class);
        var configuration = mock(DefaultConfigurationProperties.class);
        when(configuration.getPropertyValue(Property.DEFAULT_DATE_LOCALE)).thenReturn("zh-CN");
        when(factory.getBean(DefaultConfigurationProperties.class)).thenReturn(configuration);
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        ReflectionTestUtils.setField(FormFields.class, "instance", mock(FormFields.class));

        service = new ReferralSetServiceImpl();
        referralService = mock(ReferralService.class);
        referralResultService = mock(ReferralResultService.class);
        resultService = mock(ResultService.class);
        fhirReferralService = mock(FhirReferralService.class);
        organizationService = mock(OrganizationService.class);
        testService = mock(TestService.class);
        ReflectionTestUtils.setField(service, "referralService", referralService);
        ReflectionTestUtils.setField(service, "referralResultService", referralResultService);
        ReflectionTestUtils.setField(service, "resultService", resultService);
        ReflectionTestUtils.setField(service, "fhirReferralService", fhirReferralService);
        ReflectionTestUtils.setField(service, "organizationService", organizationService);
        ReflectionTestUtils.setField(service, "testService", testService);
    }

    @After
    public void tearDown() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", oldFactory);
        ReflectionTestUtils.setField(FormFields.class, "instance", oldFormFields);
    }

    @Test
    public void entryCreationPersistsLinkedReferralWithoutRemoteFhirCall() throws Exception {
        var sample = new Sample();
        sample.setId("301");
        var item = new SampleItem();
        item.setId("401");
        item.setSample(sample);
        var test = new org.openelisglobal.test.valueholder.Test();
        test.setId("2");
        var analysis = new Analysis();
        analysis.setId("501");
        analysis.setSampleItem(item);
        analysis.setTest(test);
        var parser = new SampleAddService(null, "7", sample, null);
        var collection = parser.new SampleTestCollection(item, List.of(test), null, null, null, null, null);
        collection.analysises = List.of(analysis);
        var data = new SamplePatientUpdateData("7");
        data.setSample(sample);
        data.setSampleItemsTests(List.of(collection));
        var organization = new Organization();
        organization.setId("601");
        when(organizationService.get("601")).thenReturn(organization);
        when(testService.getResultType(test)).thenReturn("N");
        doAnswer(call -> {
            Referral referral = call.getArgument(0);
            referral.setId("701");
            return "701";
        }).when(referralService).insert(any(Referral.class));
        doAnswer(call -> {
            Result result = call.getArgument(0);
            result.setId("801");
            return "801";
        }).when(resultService).insert(any(Result.class));
        var request = new ReferralItem();
        request.setReferredTestId("2");
        request.setReferredInstituteId("601");
        request.setReferralReasonId("901");
        request.setReferrer("演示申请医生");
        request.setReferredSendDate("2026/10/13");

        service.createSaveReferralSetsSamplePatientEntry(List.of(request), data);

        var referral = ArgumentCaptor.forClass(Referral.class);
        var result = ArgumentCaptor.forClass(Result.class);
        var referralResult = ArgumentCaptor.forClass(ReferralResult.class);
        verify(referralService).insert(referral.capture());
        verify(resultService).insert(result.capture());
        verify(referralResultService).insert(referralResult.capture());
        assertSame(analysis, referral.getValue().getAnalysis());
        assertSame(organization, referral.getValue().getOrganization());
        assertEquals("901", referral.getValue().getReferralReasonId());
        assertEquals("演示申请医生", referral.getValue().getRequesterName());
        assertEquals("7", referral.getValue().getSysUserId());
        assertNotNull(referral.getValue().getFhirUuid());
        assertNotNull(referral.getValue().getSentDate());
        assertSame(analysis, result.getValue().getAnalysis());
        assertEquals("N", result.getValue().getResultType());
        assertEquals("701", referralResult.getValue().getReferralId());
        assertEquals("2", referralResult.getValue().getTestId());
        assertEquals("7", referralResult.getValue().getSysUserId());
        assertSame(result.getValue(), referralResult.getValue().getResult());
        verify(fhirReferralService, never()).referAnalysisesToOrganization(any(Referral.class));
    }

    @Test
    public void entryWithoutReferralsDoesNotWriteOrSynchronizeAnything() {
        service.createSaveReferralSetsSamplePatientEntry(List.of(), new SamplePatientUpdateData("7"));

        verifyZeroInteractions(referralService, referralResultService, resultService, fhirReferralService,
                organizationService, testService);
    }

    @Test
    public void repeatedSynchronizationUsesSavedReferralWithoutRecreatingLocalRecords() throws Exception {
        var savedReferral = new Referral();
        savedReferral.setId("701");
        savedReferral.setStatus(ReferralStatus.SENT);
        when(referralService.getReferralsBySampleId("301")).thenReturn(List.of(savedReferral));

        service.syncSavedEntryReferrals("301");
        service.syncSavedEntryReferrals("301");

        verify(referralService, times(2)).getReferralsBySampleId("301");
        verifyNoMoreInteractions(referralService);
        verify(fhirReferralService, times(2)).referAnalysisesToOrganization(savedReferral);
        verifyZeroInteractions(referralResultService, resultService, organizationService, testService);
    }

    @Test
    public void synchronizationDoesNotSendCanceledReferral() throws Exception {
        var canceledReferral = new Referral();
        canceledReferral.setId("701");
        canceledReferral.setStatus(ReferralStatus.CANCELED);
        when(referralService.getReferralsBySampleId("301")).thenReturn(List.of(canceledReferral));

        service.syncSavedEntryReferrals("301");

        verify(referralService).getReferralsBySampleId("301");
        verifyNoMoreInteractions(referralService);
        verifyZeroInteractions(fhirReferralService, referralResultService, resultService);
    }
}
