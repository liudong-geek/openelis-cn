package org.openelisglobal.common.services;

import static org.junit.Assert.*;

import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.scheduler.service.CronSchedulerService;
import org.openelisglobal.siteinformation.service.SiteInformationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
public class ExchangeConfigurationScheduleContractTest extends BaseWebContextSensitiveTest {
    @Autowired
    private SiteInformationService information;
    @Autowired
    private CronSchedulerService schedules;

    @Before
    public void setup() throws Exception {
        super.setUp();
        executeDataSetWithStateManagement("testdata/result-reporting-configuration.xml");
        executeDataSetWithStateManagement("testdata/system-user.xml");
    }

    @Test
    public void exactMinuteAndHourRoundTripWithoutTenMinuteRounding() {
        var schedule = schedules.get("9003");
        schedule.setCronStatement("0 37 14 ? * *");
        schedule.setSysUserId(TEST_SYS_USER_ID);
        schedules.update(schedule);
        var url = information.get("9026");
        url.setSchedule(schedule);
        url.setSysUserId(TEST_SYS_USER_ID);
        information.update(url);
        var rows = new ExchangeConfigurationService(ExchangeConfigurationService.ConfigurationDomain.REPORT)
                .getConfigurations();
        var row = rows.stream().filter(r -> "9026".equals(r.getUrlId())).findFirst().orElseThrow();
        assertEquals("14", row.getScheduleHours());
        assertEquals("37", row.getScheduleMin());
        assertEquals("9003", row.getSchedulerId());
    }

    @Test
    public void neverScheduleRemainsUnsetWithoutInventedTime() {
        var url = information.get("9026");
        url.setSchedule(schedules.get("9003"));
        url.setSysUserId(TEST_SYS_USER_ID);
        information.update(url);
        var rows = new ExchangeConfigurationService(ExchangeConfigurationService.ConfigurationDomain.REPORT)
                .getConfigurations();
        var row = rows.stream().filter(r -> "9026".equals(r.getUrlId())).findFirst().orElseThrow();
        assertTrue(row.getIsScheduled());
        assertNull(row.getScheduleHours());
        assertNull(row.getScheduleMin());
    }
}
