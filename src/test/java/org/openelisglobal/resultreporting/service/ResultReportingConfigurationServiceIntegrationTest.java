package org.openelisglobal.resultreporting.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.util.Collections;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.scheduler.service.CronSchedulerService;
import org.openelisglobal.scheduler.valueholder.CronScheduler;
import org.openelisglobal.siteinformation.service.SiteInformationService;
import org.openelisglobal.siteinformation.valueholder.SiteInformation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

public class ResultReportingConfigurationServiceIntegrationTest extends BaseWebContextSensitiveTest {

    private static final String RESULT_REPORTING_ENABLED_ID = "9025";
    private static final String RESULT_REPORTING_URL_ID = "9026";
    private static final String MALARIA_SCHEDULER_ID = "9003";

    @Autowired
    private ResultReportingConfigurationService resultReportingConfigurationService;

    @Autowired
    private SiteInformationService siteInformationService;

    @Autowired
    private CronSchedulerService cronSchedulerService;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Before
    public void setUp() throws Exception {
        super.setUp();
        executeDataSetWithStateManagement("testdata/result-reporting-configuration.xml");
        executeDataSetWithStateManagement("testdata/system-user.xml");
        ConfigurationProperties.loadDBValuesIntoConfiguration();
    }

    @After
    public void tearDown() throws Exception {
        ConfigurationProperties.getInstance().setPropertyValue(Property.reportResults, "false");
        ConfigurationProperties.getInstance().setPropertyValue(Property.resultReportingURL, "");
    }

    @Test
    public void updateInformationAndSchedulers_updatesSiteInformationAndScheduler() {
        SiteInformation enabled = siteInformationService.get(RESULT_REPORTING_ENABLED_ID);
        enabled.setValue("true");
        enabled.setSysUserId(TEST_SYS_USER_ID);

        SiteInformation url = siteInformationService.get(RESULT_REPORTING_URL_ID);
        url.setValue("https://example.org/results");
        url.setSysUserId(TEST_SYS_USER_ID);

        CronScheduler scheduler = cronSchedulerService.get(MALARIA_SCHEDULER_ID);
        scheduler.setCronStatement("0 30 14 ? * *");
        scheduler.setActive(true);
        scheduler.setSysUserId(TEST_SYS_USER_ID);

        resultReportingConfigurationService.updateInformationAndSchedulers(List.of(enabled, url), List.of(scheduler));

        SiteInformation updatedEnabled = siteInformationService.get(RESULT_REPORTING_ENABLED_ID);
        SiteInformation updatedUrl = siteInformationService.get(RESULT_REPORTING_URL_ID);
        CronScheduler updatedScheduler = cronSchedulerService.get(MALARIA_SCHEDULER_ID);

        assertEquals("true", updatedEnabled.getValue());
        assertEquals("https://example.org/results", updatedUrl.getValue());
        assertEquals("0 30 14 ? * *", updatedScheduler.getCronStatement());
        assertTrue(updatedScheduler.getActive());
    }

    @Test
    public void updateInformationAndSchedulers_withEmptySchedulerList_updatesSiteInformationOnly() {
        SiteInformation enabled = siteInformationService.get(RESULT_REPORTING_ENABLED_ID);
        enabled.setValue("true");
        enabled.setSysUserId(TEST_SYS_USER_ID);

        SiteInformation url = siteInformationService.get(RESULT_REPORTING_URL_ID);
        url.setValue("https://lab.example.org/report");
        url.setSysUserId(TEST_SYS_USER_ID);

        CronScheduler schedulerBefore = cronSchedulerService.get(MALARIA_SCHEDULER_ID);

        resultReportingConfigurationService.updateInformationAndSchedulers(List.of(enabled, url),
                Collections.emptyList());

        assertEquals("true", siteInformationService.get(RESULT_REPORTING_ENABLED_ID).getValue());
        assertEquals("https://lab.example.org/report", siteInformationService.get(RESULT_REPORTING_URL_ID).getValue());

        CronScheduler schedulerAfter = cronSchedulerService.get(MALARIA_SCHEDULER_ID);
        assertEquals(schedulerBefore.getCronStatement(), schedulerAfter.getCronStatement());
        assertEquals(schedulerBefore.getActive(), schedulerAfter.getActive());
    }

    @Test
    public void updateInformationAndSchedulers_defersConfigurationReloadToCommittedCaller() {
        String originalEnabled = ConfigurationProperties.getInstance().getPropertyValue(Property.reportResults);
        String originalUrl = ConfigurationProperties.getInstance().getPropertyValue(Property.resultReportingURL);
        SiteInformation enabled = siteInformationService.get(RESULT_REPORTING_ENABLED_ID);
        enabled.setValue("true");
        enabled.setSysUserId(TEST_SYS_USER_ID);

        SiteInformation url = siteInformationService.get(RESULT_REPORTING_URL_ID);
        url.setValue("https://example.org/results");
        url.setSysUserId(TEST_SYS_USER_ID);

        resultReportingConfigurationService.updateInformationAndSchedulers(List.of(enabled, url),
                Collections.emptyList());

        assertEquals(originalEnabled, ConfigurationProperties.getInstance().getPropertyValue(Property.reportResults));
        assertEquals(originalUrl, ConfigurationProperties.getInstance().getPropertyValue(Property.resultReportingURL));
        // Both controllers perform this reload after the service has committed.
        ConfigurationProperties.loadDBValuesIntoConfiguration();
        assertEquals("true", ConfigurationProperties.getInstance().getPropertyValue(Property.reportResults));
        assertEquals("https://example.org/results",
                ConfigurationProperties.getInstance().getPropertyValue(Property.resultReportingURL));
    }

    @Test
    public void failedOuterTransactionRollsBackChannelsWithoutPublishingUncommittedRuntimeValues() {
        String originalEnabled = ConfigurationProperties.getInstance().getPropertyValue(Property.reportResults);
        String originalUrl = ConfigurationProperties.getInstance().getPropertyValue(Property.resultReportingURL);
        String storedEnabled = siteInformationService.get(RESULT_REPORTING_ENABLED_ID).getValue();
        String storedUrl = siteInformationService.get(RESULT_REPORTING_URL_ID).getValue();
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        assertThrows(IllegalStateException.class, () -> transaction.execute(status -> {
            SiteInformation enabled = siteInformationService.get(RESULT_REPORTING_ENABLED_ID);
            enabled.setValue("true");
            enabled.setSysUserId(TEST_SYS_USER_ID);
            SiteInformation url = siteInformationService.get(RESULT_REPORTING_URL_ID);
            url.setValue("https://uncommitted.example.org/results");
            url.setSysUserId(TEST_SYS_USER_ID);
            resultReportingConfigurationService.updateInformationAndSchedulers(List.of(enabled, url),
                    Collections.emptyList());
            assertEquals("true", siteInformationService.get(RESULT_REPORTING_ENABLED_ID).getValue());
            assertEquals(originalEnabled,
                    ConfigurationProperties.getInstance().getPropertyValue(Property.reportResults));
            assertEquals(originalUrl,
                    ConfigurationProperties.getInstance().getPropertyValue(Property.resultReportingURL));
            throw new IllegalStateException("simulated failure after the channel writes before commit");
        }));
        assertEquals(storedEnabled, siteInformationService.get(RESULT_REPORTING_ENABLED_ID).getValue());
        assertEquals(storedUrl, siteInformationService.get(RESULT_REPORTING_URL_ID).getValue());
        assertEquals(originalEnabled, ConfigurationProperties.getInstance().getPropertyValue(Property.reportResults));
        assertEquals(originalUrl, ConfigurationProperties.getInstance().getPropertyValue(Property.resultReportingURL));
    }

}
