package org.openelisglobal.referral.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;
import static org.mockito.Mockito.*;

import java.sql.Timestamp;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.referral.dao.ReferralDAO;
import org.openelisglobal.referral.form.ReferredOutTestsForm;
import org.openelisglobal.referral.form.ReferredOutTestsForm.ReferDateType;
import org.openelisglobal.referral.form.ReferredOutTestsForm.SearchType;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.spring.util.SpringContext;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

public class ReferralQueryContractTest {
    private Object previousFactory;
    private ReferralServiceImpl service;
    private ReferralDAO dao;
    private SampleService samples;
    private SampleHumanService humans;
    private final AtomicReference<String> dateLocale = new AtomicReference<>("zh-CN");

    @Before
    public void setup() {
        previousFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        var factory = mock(AutowireCapableBeanFactory.class);
        var configuration = mock(DefaultConfigurationProperties.class);
        when(factory.getBean(DefaultConfigurationProperties.class)).thenReturn(configuration);
        when(configuration.getPropertyValue(Property.DEFAULT_DATE_LOCALE)).thenAnswer(ignored -> dateLocale.get());
        when(configuration.getPropertyValue(Property.AmbiguousDateHolder)).thenReturn("X");
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        service = new ReferralServiceImpl();
        dao = mock(ReferralDAO.class);
        samples = mock(SampleService.class);
        humans = mock(SampleHumanService.class);
        ReflectionTestUtils.setField(service, "baseObjectDAO", dao);
        ReflectionTestUtils.setField(service, "sampleService", samples);
        ReflectionTestUtils.setField(service, "sampleHumanService", humans);
        ReflectionTestUtils.setField(service, "analysisService", mock(AnalysisService.class));
    }

    @After
    public void restore() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", previousFactory);
    }

    @Test
    public void sentDatesIncludeTheWholeLastDayAndPassBothFilters() {
        var form = dateQuery(ReferDateType.SENT, "2026/10/05", "2026/10/05");
        form.setTestIds(List.of("11", "12"));
        form.setTestUnitIds(List.of("3"));
        service.getReferralItems(form, "7");
        verify(dao).getReferralsByTestAndDate(ReferDateType.SENT, timestamp("2026-10-05 00:00:00"),
                timestamp("2026-10-06 00:00:00"), List.of("3"), List.of("11", "12"));
    }

    @Test
    public void resultDatesUseTheSameExclusiveNextDayBoundary() {
        service.getReferralItems(dateQuery(ReferDateType.RESULT, "2026/10/04", "2026/10/05"), "7");
        verify(dao).getReferralsByTestAndDate(ReferDateType.RESULT, timestamp("2026-10-04 00:00:00"),
                timestamp("2026-10-06 00:00:00"), null, null);
    }

    @Test
    public void oneDateMeansThatWholeDayForBothDirections() {
        service.getReferralItems(dateQuery(ReferDateType.SENT, "2026/10/05", ""), "7");
        service.getReferralItems(dateQuery(ReferDateType.SENT, "", "2026/10/05"), "7");
        verify(dao, times(2)).getReferralsByTestAndDate(ReferDateType.SENT, timestamp("2026-10-05 00:00:00"),
                timestamp("2026-10-06 00:00:00"), null, null);
    }

    @Test
    public void configuredFrenchAndUsFormatsKeepTheirOwnDayMonthMeaning() {
        dateLocale.set("fr-FR");
        service.getReferralItems(dateQuery(ReferDateType.SENT, "05/10/2026", "05/10/2026"), "7");
        dateLocale.set("en-US");
        service.getReferralItems(dateQuery(ReferDateType.SENT, "10/05/2026", "10/05/2026"), "7");
        verify(dao, times(2)).getReferralsByTestAndDate(ReferDateType.SENT, timestamp("2026-10-05 00:00:00"),
                timestamp("2026-10-06 00:00:00"), null, null);
    }

    @Test
    public void blankDatesKeepTheExistingFilterOnlyQuery() {
        var form = dateQuery(ReferDateType.SENT, "", "");
        form.setTestIds(List.of("11"));
        service.getReferralItems(form, "7");
        verify(dao).getReferralsByTestAndDate(ReferDateType.SENT, null, null, null, List.of("11"));
    }

    @Test
    public void leapDayCrossesIntoTheCorrectNextMonth() {
        service.getReferralItems(dateQuery(ReferDateType.RESULT, "2024/02/29", "2024/02/29"), "7");
        verify(dao).getReferralsByTestAndDate(ReferDateType.RESULT, timestamp("2024-02-29 00:00:00"),
                timestamp("2024-03-01 00:00:00"), null, null);
    }

    @Test
    public void invalidAndPartiallyParsedDatesAreRejectedBeforeAnyQuery() {
        for (String invalid : List.of("2026/02/30", "2026/10/05 junk", "2026%2F10%2F05", "garbage")) {
            assertBadQuery(dateQuery(ReferDateType.SENT, invalid, "2026/10/05"));
        }
        verifyZeroInteractions(dao, samples, humans);
    }

    @Test
    public void reversedDatesAreRejectedBeforeAnyQuery() {
        assertBadQuery(dateQuery(ReferDateType.RESULT, "2026/10/06", "2026/10/05"));
        verifyZeroInteractions(dao, samples, humans);
    }

    @Test
    public void missingDateTypeIsRejectedBeforeAnyQuery() {
        assertBadQuery(dateQuery(null, "2026/10/05", "2026/10/05"));
        verifyZeroInteractions(dao, samples, humans);
    }

    @Test
    public void missingSearchTypeIsRejectedBeforeAnyQuery() {
        assertBadQuery(new ReferredOutTestsForm());
        verifyZeroInteractions(dao, samples, humans);
    }

    @Test
    public void invalidAndOverflowingNumericFilterIdsAreRejectedBeforeAnyQuery() {
        var form = dateQuery(ReferDateType.SENT, "", "");
        form.setTestIds(List.of("not-an-id"));
        assertBadQuery(form);
        form.setTestIds(List.of("2147483648"));
        assertBadQuery(form);
        form.setTestIds(List.of("11"));
        form.setTestUnitIds(List.of("3;DROP"));
        assertBadQuery(form);
        verifyZeroInteractions(dao, samples, humans);
    }

    @Test
    public void patientModeUsesSelectedPatientAndRejectsMissingOrMalformedSelection() {
        var form = new ReferredOutTestsForm();
        form.setSearchType(SearchType.PATIENT);
        form.setSelPatient("42");
        service.getReferralItems(form, "7");
        verify(humans).getSamplesForPatient("42");
        verify(dao).getReferralsByAnalysisIds(List.of());
        reset(humans, dao);
        for (String invalid : List.of("", "not-an-id", "2147483648")) {
            form.setSelPatient(invalid);
            assertBadQuery(form);
        }
        verifyZeroInteractions(dao, samples, humans);
    }

    @Test
    public void labNumberModeUsesTheExactNumberAndRejectsBlank() {
        var form = new ReferredOutTestsForm();
        form.setSearchType(SearchType.LAB_NUMBER);
        form.setLabNumber("20261005-00042");
        service.getReferralItems(form, "7");
        verify(samples).getSampleByAccessionNumber("20261005-00042");
        reset(samples);
        form.setLabNumber("");
        assertBadQuery(form);
        verifyZeroInteractions(dao, samples, humans);
    }

    private void assertBadQuery(ReferredOutTestsForm form) {
        try {
            service.getReferralItems(form, "7");
            fail("Expected a bad query response");
        } catch (ResponseStatusException failure) {
            assertEquals(HttpStatus.BAD_REQUEST, failure.getStatusCode());
        }
    }

    private ReferredOutTestsForm dateQuery(ReferDateType type, String start, String end) {
        var form = new ReferredOutTestsForm();
        form.setSearchType(SearchType.TEST_AND_DATES);
        form.setDateType(type);
        form.setStartDate(start);
        form.setEndDate(end);
        return form;
    }

    private Timestamp timestamp(String value) {
        return Timestamp.valueOf(value);
    }
}
