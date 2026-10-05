package org.openelisglobal.patient.service;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Objects;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.login.dao.UserModuleService;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.systemusermodule.service.PermissionModuleService;
import org.openelisglobal.systemusermodule.valueholder.PermissionModule;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Resolves current patient-maintenance grants from the existing
 * SamplePatientEntry module, without changing ordinary patient read access.
 */
@Service
public class PatientManagementAuthorizationService {
    private final UserModuleService userModules;
    private final UserRoleService roles;
    private final PermissionModuleService<PermissionModule> permissions;
    private final SystemUserService users;

    public PatientManagementAuthorizationService(UserModuleService userModules, UserRoleService roles,
            PermissionModuleService<PermissionModule> permissions, SystemUserService users) {
        this.userModules = userModules;
        this.roles = roles;
        this.permissions = permissions;
        this.users = users;
    }

    private enum Operation {
        CREATE, EDIT
    }

    @Transactional(readOnly = true)
    public boolean canCreate(HttpServletRequest request, String actor) {
        return hasPermission(request, actor, Operation.CREATE);
    }

    @Transactional(readOnly = true)
    public boolean canEdit(HttpServletRequest request, String actor) {
        return hasPermission(request, actor, Operation.EDIT);
    }

    @Transactional(readOnly = true)
    public void requireCreate(HttpServletRequest request, String actor) {
        if (!canCreate(request, actor))
            throw denied();
    }

    @Transactional(readOnly = true)
    public void requireEdit(HttpServletRequest request, String actor) {
        if (!canEdit(request, actor))
            throw denied();
    }

    private boolean hasPermission(HttpServletRequest request, String actor, Operation operation) {
        if (request == null || actor == null || !actor.matches("[1-9][0-9]*") || request.getSession(false) == null) {
            return false;
        }
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (!interactive(auth)
                || !(request.getSession(false)
                        .getAttribute(IActionConstants.USER_SESSION_DATA) instanceof UserSessionData sessionUser)
                || !actor.equals(Integer.toString(sessionUser.getSystemUserId()))
                || !(request.getSession(false).getAttribute(
                        HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY) instanceof SecurityContext sessionContext)
                || !interactive(sessionContext.getAuthentication())
                || !Objects.equals(auth.getName(), sessionContext.getAuthentication().getName())) {
            return false;
        }
        SystemUser currentUser = users.getMatch("id", actor).orElse(null);
        if (currentUser == null || !actor.equals(currentUser.getId()) || !"Y".equals(currentUser.getIsActive())
                || !Objects.equals(auth.getName(), currentUser.getLoginName())) {
            return false;
        }
        if (userModules.isUserAdmin(request)) {
            return true;
        }
        String mode = ConfigurationProperties.getInstance().getPropertyValue("permissions.agent");
        if ("USER".equalsIgnoreCase(mode)) {
            // The generic agent-ID method is hard-wired to role.id; USER uses
            // the actual many-to-one mapping, whose identifier type is String.
            return granted(permissions.getAllMatching("systemUser.id", actor), operation);
        }
        if (!"ROLE".equalsIgnoreCase(mode)) {
            return false;
        }
        List<String> roleIds = roles.getRoleIdsForUser(actor);
        if (roleIds == null) {
            return false;
        }
        for (String roleId : roleIds) {
            if (roleId != null && roleId.matches("[1-9][0-9]*")
                    && granted(permissions.getAllPermissionModulesByAgentId(Integer.parseInt(roleId)), operation)) {
                return true;
            }
        }
        return false;
    }

    private boolean granted(List<PermissionModule> modules, Operation operation) {
        if (modules == null) {
            return false;
        }
        for (PermissionModule module : modules) {
            if (module == null || module.getSystemModule() == null) {
                continue;
            }
            String name = module.getSystemModule().getSystemModuleName();
            if (!"SamplePatientEntry".equals(name))
                continue;
            if (operation == Operation.CREATE && "Y".equalsIgnoreCase(module.getHasAdd())
                    && "Y".equalsIgnoreCase(module.getSystemModule().getHasAddFlag()))
                return true;
            if (operation == Operation.EDIT && "Y".equalsIgnoreCase(module.getHasUpdate())
                    && "Y".equalsIgnoreCase(module.getSystemModule().getHasUpdateFlag()))
                return true;
        }
        return false;
    }

    private boolean interactive(Authentication auth) {
        return auth != null && auth.isAuthenticated() && !(auth instanceof AnonymousAuthenticationToken);
    }

    private AccessDeniedException denied() {
        return new AccessDeniedException("patient.maintenance.permissionDenied");
    }
}
