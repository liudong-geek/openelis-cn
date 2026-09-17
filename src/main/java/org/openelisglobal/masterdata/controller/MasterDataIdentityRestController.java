package org.openelisglobal.masterdata.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import org.openelisglobal.common.util.ControllerUtills;
import org.openelisglobal.masterdata.dao.MasterDataIdentityRepository.History;
import org.openelisglobal.masterdata.form.MasterDataIdentityForm;
import org.openelisglobal.masterdata.service.MasterDataIdentityService;
import org.openelisglobal.masterdata.service.MasterDataIdentityService.Item;
import org.openelisglobal.masterdata.service.MasterDataIdentityService.Listing;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/rest/master-data-identities")
@PreAuthorize("hasRole('ADMIN')")
public class MasterDataIdentityRestController {

    private final MasterDataIdentityService service;

    public MasterDataIdentityRestController(MasterDataIdentityService service) {
        this.service = service;
    }

    @GetMapping
    public Listing list(@RequestParam(required = false) String entityType,
            @RequestParam(required = false) String query) {
        return service.list(entityType, query);
    }

    @PutMapping("/{entityType}/{entityId}")
    public Item save(@PathVariable String entityType, @PathVariable String entityId,
            @Valid @RequestBody MasterDataIdentityForm form, HttpServletRequest request) {
        String userId = ControllerUtills.getSysUserId(request);
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        return service.save(entityType, entityId, form, Integer.parseInt(userId));
    }

    @GetMapping("/{entityType}/{entityId}/history")
    public List<History> history(@PathVariable String entityType, @PathVariable String entityId) {
        return service.history(entityType, entityId);
    }
}
