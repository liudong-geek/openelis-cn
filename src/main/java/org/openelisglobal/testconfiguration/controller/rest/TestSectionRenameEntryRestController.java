package org.openelisglobal.testconfiguration.controller.rest;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.NoSuchElementException;
import org.openelisglobal.common.controller.BaseController;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.testconfiguration.form.TestSectionRenameEntryForm;
import org.openelisglobal.testconfiguration.service.ConfigurationNameService;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.BindingResult;
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
public class TestSectionRenameEntryRestController extends BaseController {

    private static final String[] ALLOWED_FIELDS = new String[] { "testSectionId", "nameEnglish", "nameFrench",
            "nameChinese" };

    private final ConfigurationNameService names;
    private final DisplayListService displayLists;

    public TestSectionRenameEntryRestController(ConfigurationNameService names, DisplayListService displayLists) {
        this.names = names;
        this.displayLists = displayLists;
    }

    @InitBinder
    public void initBinder(WebDataBinder binder) {
        binder.setAllowedFields(ALLOWED_FIELDS);
    }

    @GetMapping(value = "/TestSectionRenameEntry")
    public TestSectionRenameEntryForm showTestSectionRenameEntry(HttpServletRequest request) {
        TestSectionRenameEntryForm form = new TestSectionRenameEntryForm();

        form.setTestSectionList(displayLists.getList(DisplayListService.ListType.TEST_SECTION_ACTIVE));

        // return findForward(FWD_SUCCESS, form);
        return form;
    }

    @Override
    protected String findLocalForward(String forward) {
        if (FWD_SUCCESS.equals(forward)) {
            return "testSectionRenameDefinition";
        } else if (FWD_SUCCESS_INSERT.equals(forward)) {
            return "redirect:/TestSectionRenameEntry";
        } else if (FWD_FAIL_INSERT.equals(forward)) {
            return "testSectionRenameDefinition";
        } else {
            return "PageNotFound";
        }
    }

    @PostMapping(value = "/TestSectionRenameEntry")
    public TestSectionRenameEntryForm updateTestSectionRenameEntry(HttpServletRequest request,
            @RequestBody @Valid TestSectionRenameEntryForm form, BindingResult result) {
        if (result.hasErrors()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid configuration rename request");
        }
        try {
            names.renameTestSection(form, getSysUserId(request));
        } catch (NoSuchElementException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Configuration name not found", e);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid configuration rename request", e);
        } catch (AccessDeniedException e) {
            throw e;
        } catch (RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Unable to save configuration name", e);
        }
        return form;
    }

    @Override
    protected String getPageTitleKey() {
        return null;
    }

    @Override
    protected String getPageSubtitleKey() {
        return null;
    }
}
