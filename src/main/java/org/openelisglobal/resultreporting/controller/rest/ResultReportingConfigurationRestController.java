package org.openelisglobal.resultreporting.controller.rest;

import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.InvocationTargetException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.apache.commons.validator.GenericValidator;
import org.openelisglobal.common.controller.BaseController;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.common.services.DisplayListService.ListType;
import org.openelisglobal.common.services.ExchangeConfigurationService;
import org.openelisglobal.common.services.ExchangeConfigurationService.ConfigurationDomain;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.dataexchange.resultreporting.beans.ReportingConfiguration;
import org.openelisglobal.resultreporting.form.ResultReportingConfigurationForm;
import org.openelisglobal.resultreporting.service.ResultReportingConfigurationService;
import org.openelisglobal.scheduler.SchedulerConfig;
import org.openelisglobal.scheduler.service.CronSchedulerService;
import org.openelisglobal.scheduler.valueholder.CronScheduler;
import org.openelisglobal.siteinformation.service.SiteInformationService;
import org.openelisglobal.siteinformation.valueholder.SiteInformation;
import org.openelisglobal.spring.util.SpringContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.BindingResult;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/rest")
@PreAuthorize("hasRole('ADMIN')")
public class ResultReportingConfigurationRestController extends BaseController {

    private static final String[] ALLOWED_FIELDS = new String[] { "reports*.enabledId", "reports*.enabled",
            "reports*.urlId", "reports*.url", "reports*.scheduleHours", "reports*.scheduleMin", "reports*.userName",
            "reports*.password", };

    @Autowired
    private SiteInformationService siteInformationService;
    @Autowired
    private CronSchedulerService schedulerService;
    @Autowired
    private ResultReportingConfigurationService resultReportingConfigurationService;
    private static final String NEVER = "never";

    @InitBinder
    public void initBinder(WebDataBinder binder) {
        binder.setAllowedFields(ALLOWED_FIELDS);
    }

    @GetMapping(value = "/ResultReportingConfiguration")
    public ResultReportingConfigurationForm showResultReportingConfiguration(HttpServletRequest request)
            throws IllegalAccessException, InvocationTargetException, NoSuchMethodException {
        ResultReportingConfigurationForm form = new ResultReportingConfigurationForm();

        request.setAttribute(ALLOW_EDITS_KEY, "true");
        request.setAttribute(PREVIOUS_DISABLED, "true");
        request.setAttribute(NEXT_DISABLED, "true");
        request.getSession().setAttribute(SAVE_DISABLED, "false");

        ExchangeConfigurationService configService = new ExchangeConfigurationService(ConfigurationDomain.REPORT);

        form.setReports(configService.getConfigurations());
        form.setHourList(DisplayListService.getInstance().getList(ListType.HOURS));
        form.setMinList(DisplayListService.getInstance().getList(ListType.MINS));

        addFlashMsgsToRequest(request);
        // return findForward(FWD_SUCCESS, form);
        return form;
    }

    @PostMapping(value = "/ResultReportingConfiguration")
    public ResultReportingConfigurationForm showUpdateResultReportingConfiguration(HttpServletRequest request,
            @RequestBody @Validated(ResultReportingConfigurationForm.ResultReportConfig.class) ResultReportingConfigurationForm form,
            BindingResult result) {
        if (result.hasErrors()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid report channel configuration");
        }
        if (form.getReports() == null || form.getReports().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Report channels are required");
        }
        List<SiteInformation> informationList = new ArrayList<>();
        List<CronScheduler> scheduleList = new ArrayList<>();
        List<ReportingConfiguration> reports = form.getReports();

        Set<String> identities = new HashSet<>();
        for (ReportingConfiguration config : reports) {
            if (config == null || config.getEnabledId() == null || !config.getEnabledId().matches("[1-9][0-9]*")
                    || config.getUrlId() == null || !config.getUrlId().matches("[1-9][0-9]*")
                    || !("enable".equals(config.getEnabled()) || "disable".equals(config.getEnabled()))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Required report channel fields are invalid");
            }
            if (!identities.add(config.getUrlId()) || !identities.add(config.getEnabledId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Duplicate report channel identity");
            }
            SiteInformation url = setSiteInformationFor(config.getUrl(), config.getUrlId(), "url");
            SiteInformation enabled = setSiteInformationFor(config.getEnabled(), config.getEnabledId(), "enable");
            if (url.getGroup() != enabled.getGroup()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mismatched report channel identity");
            }
            informationList.add(url);
            informationList.add(enabled);

            CronScheduler scheduler = setScheduleInformationFor(config, url, enabled);
            if (scheduler != null) {
                scheduleList.add(scheduler);
            }
        }

        try {
            resultReportingConfigurationService.updateInformationAndSchedulers(informationList, scheduleList);
        } catch (LIMSRuntimeException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Report channel configuration was not saved", e);
        }

        ConfigurationProperties.loadDBValuesIntoConfiguration();
        SpringContext.getBean(SchedulerConfig.class).reloadSchedules();

        // redirectAttributes.addFlashAttribute(FWD_SUCCESS, true);
        // return findForward(FWD_SUCCESS_INSERT, form);
        return form;
    }

    private CronScheduler setScheduleInformationFor(ReportingConfiguration config, SiteInformation url,
            SiteInformation enabled) {
        CronScheduler linked = url.getSchedule() == null ? enabled.getSchedule() : url.getSchedule();
        if (url.getSchedule() != null && enabled.getSchedule() != null
                && !url.getSchedule().getId().equals(enabled.getSchedule().getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Conflicting stored report channel schedules");
        }
        if (linked == null) {
            if (config.getIsScheduled() || !GenericValidator.isBlankOrNull(config.getSchedulerId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unexpected report channel schedule");
            }
            return null;
        }
        if (!config.getIsScheduled() || !linked.getId().equals(config.getSchedulerId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid report channel schedule identity");
        }
        CronScheduler scheduler = schedulerService.get(linked.getId());
        if (scheduler == null || !linked.getId().equals(scheduler.getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Report channel schedule was not found");
        }
        String cron = scheduler.getCronStatement();
        String hour = null;
        String minute = null;
        if (!NEVER.equals(cron)) {
            try {
                String[] parts = cron.trim().split("\\s+");
                hour = parts[2];
                minute = String.valueOf(Integer.parseInt(parts[1]));
            } catch (RuntimeException e) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Invalid stored report channel schedule", e);
            }
        }
        if (!sameScheduleTime(hour, config.getScheduleHours()) || !sameScheduleTime(minute, config.getScheduleMin())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Report channel schedule is read-only");
        }
        // Editing delivery enablement or URL must preserve the complete existing cron.
        scheduler.setActive("enable".equals(config.getEnabled()));
        scheduler.setSysUserId(getSysUserId(request));
        return scheduler;
    }

    private boolean sameScheduleTime(String expected, String supplied) {
        return expected == null ? GenericValidator.isBlankOrNull(supplied) : expected.equals(supplied);
    }

    private SiteInformation setSiteInformationFor(String value, String id, String tag) {
        SiteInformation siteInformation = siteInformationService.get(id);
        if (siteInformation == null || !id.equals(siteInformation.getId()) || siteInformation.getDomain() == null
                || !"resultReporting".equals(siteInformation.getDomain().getName())
                || !tag.equals(siteInformation.getTag())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid report channel identity");
        }
        if (siteInformation.getId() != null) {

            if ("boolean".equals(siteInformation.getValueType())) {
                siteInformation.setValue("enable".equals(value) ? "true" : "false");
            } else {
                siteInformation.setValue(value);
            }

            siteInformation.setSysUserId(getSysUserId(request));
        }
        return siteInformation;
    }

    @Override
    protected String findLocalForward(String forward) {
        if (FWD_SUCCESS.equals(forward)) {
            return "resultReportingConfigurationDefinition";
        } else if (FWD_SUCCESS_INSERT.equals(forward)) {
            return "redirect:/MasterListsPage";
        } else if (FWD_FAIL_INSERT.equals(forward)) {
            return "resultReportingConfigurationDefinition";
        } else {
            return "PageNotFound";
        }
    }

    @Override
    protected String getPageTitleKey() {
        return "resultreporting.browse.title";
    }

    @Override
    protected String getPageSubtitleKey() {
        return "resultreporting.browse.title";
    }
}
