package org.openelisglobal.sample.service;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Objects;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.login.dao.UserModuleService;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.systemmodule.service.SystemModuleUrlService;
import org.openelisglobal.systemmodule.valueholder.SystemModuleUrl;
import org.openelisglobal.systemusermodule.service.PermissionModuleService;
import org.openelisglobal.systemusermodule.valueholder.PermissionModule;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

/**
 * Current reception actor, existing SELECT mappings and current laboratory
 * scope.
 */
@Service
public class SavedOrderReadAccess {
    private final OrderDashboardAccess dashboard;
    private final RoleService definitions;
    private final UserRoleService roles;
    private final SystemModuleUrlService urls;
    private final PermissionModuleService<PermissionModule> permissions;
    private final UserModuleService userModules;
    private final SampleEditAuthorizationService editing;

    public SavedOrderReadAccess(OrderDashboardAccess dashboard, RoleService definitions, UserRoleService roles,
            SystemModuleUrlService urls, PermissionModuleService<PermissionModule> permissions,
            UserModuleService userModules, SampleEditAuthorizationService editing) {
        this.dashboard = dashboard;
        this.definitions = definitions;
        this.roles = roles;
        this.urls = urls;
        this.permissions = permissions;
        this.userModules = userModules;
        this.editing = editing;
    }

    public OrderDashboardAccess.Scope bind(HttpServletRequest request) {
        var scope = dashboard.bind(request);
        requireRead(request, scope.actor().userId());
        return scope;
    }

    public void requireUnchanged(HttpServletRequest request, OrderDashboardAccess.Scope scope) {
        dashboard.requireUnchanged(request, scope);
        requireRead(request, scope.actor().userId());
    }

    public boolean canModify(HttpServletRequest request, String actor) {
        try {
            editing.requireRead(request, actor);
            return editing.canWrite(request, actor) && activeModifyGrant(request, actor);
        } catch (AccessDeniedException e) {
            return false;
        }
    }

    private void requireRead(HttpServletRequest request, String actor) {
        var reception = definitions.getRoleByName(Constants.ROLE_RECEPTION);
        var assigned = roles.getRoleIdsForUser(actor);
        if (reception == null || !reception.isActive() || assigned == null)
            throw denied();
        var mappings = urls.getByUrlPath("/SamplePatientEntry");
        if (mappings == null || mappings.stream().noneMatch(this::readMapping))
            throw denied();
        if (activeAdmin(request, assigned))
            return;
        if (!assigned.contains(reception.getId()))
            throw denied();
        String mode = ConfigurationProperties.getInstance().getPropertyValue("permissions.agent");
        if ("USER".equalsIgnoreCase(mode) && granted(permissions.getAllMatching("systemUser.id", actor), mappings))
            return;
        if ("ROLE".equalsIgnoreCase(mode))
            for (String roleId : assigned) {
                var role = definitions.get(roleId);
                if (role != null && role.isActive() && numeric(roleId)
                        && granted(permissions.getAllPermissionModulesByAgentId(Integer.parseInt(roleId)), mappings))
                    return;
            }
        throw denied();
    }

    private boolean readMapping(SystemModuleUrl mapping) {
        return mapping != null && mapping.getSystemModule() != null && mapping.getParam() == null
                && "Y".equalsIgnoreCase(mapping.getSystemModule().getHasSelectFlag());
    }

    private boolean granted(List<PermissionModule> grants, List<SystemModuleUrl> mappings) {
        if (grants == null)
            return false;
        return grants.stream().filter(Objects::nonNull)
                .filter(p -> p.getSystemModule() != null && "Y".equalsIgnoreCase(p.getHasSelect()))
                .anyMatch(p -> mappings.stream()
                        .anyMatch(m -> readMapping(m)
                                && Objects.equals(m.getSystemModule().getId(), p.getSystemModule().getId())
                                && Objects.equals(m.getSystemModule().getSystemModuleName(),
                                        p.getSystemModule().getSystemModuleName())));
    }

    private boolean activeAdmin(HttpServletRequest request, List<String> assigned) {
        var admin = definitions.getRoleByName(Constants.ROLE_GLOBAL_ADMIN);
        return userModules.isUserAdmin(request) && admin != null && admin.isActive()
                && assigned.contains(admin.getId());
    }

    private boolean activeModifyGrant(HttpServletRequest request, String actor) {
        var assigned = roles.getRoleIdsForUser(actor);
        if (assigned == null)
            return false;
        if (activeAdmin(request, assigned))
            return true;
        String mode = ConfigurationProperties.getInstance().getPropertyValue("permissions.agent");
        if ("USER".equalsIgnoreCase(mode))
            return modifyGrant(permissions.getAllMatching("systemUser.id", actor));
        if ("ROLE".equalsIgnoreCase(mode))
            for (String roleId : assigned) {
                var role = definitions.get(roleId);
                if (role != null && role.isActive() && numeric(roleId)
                        && modifyGrant(permissions.getAllPermissionModulesByAgentId(Integer.parseInt(roleId))))
                    return true;
            }
        return false;
    }

    private boolean modifyGrant(List<PermissionModule> grants) {
        if (grants == null)
            return false;
        return grants.stream().filter(Objects::nonNull).filter(p -> p.getSystemModule() != null).anyMatch(p -> {
            var name = p.getSystemModule().getSystemModuleName();
            return "SampleEdit:readwrite".equals(name) || "SampleEdit".equals(name)
                    && "Y".equalsIgnoreCase(p.getHasSelect()) && "Y".equalsIgnoreCase(p.getHasUpdate());
        });
    }

    private boolean numeric(String id) {
        try {
            return id != null && id.matches("[1-9][0-9]*") && Integer.parseInt(id) > 0;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    private AccessDeniedException denied() {
        return new AccessDeniedException("SAVED_ORDER_PERMISSION_DENIED");
    }
}
