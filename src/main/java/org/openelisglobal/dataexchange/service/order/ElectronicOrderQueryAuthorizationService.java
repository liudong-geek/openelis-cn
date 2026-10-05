package org.openelisglobal.dataexchange.service.order;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Objects;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.login.dao.UserModuleService;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.systemmodule.service.SystemModuleUrlService;
import org.openelisglobal.systemmodule.valueholder.SystemModuleUrl;
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
 * Resolves current actor and existing ElectronicOrders read mappings. An
 * unmapped REST URL never creates permission.
 */
@Service
public class ElectronicOrderQueryAuthorizationService {
    private final UserModuleService userModules;
    private final UserRoleService roles;
    private final PermissionModuleService<PermissionModule> permissions;
    private final SystemUserService users;
    private final SystemModuleUrlService urls;

    public ElectronicOrderQueryAuthorizationService(UserModuleService userModules, UserRoleService roles,
            PermissionModuleService<PermissionModule> permissions, SystemUserService users,
            SystemModuleUrlService urls) {
        this.userModules = userModules;
        this.roles = roles;
        this.permissions = permissions;
        this.users = users;
        this.urls = urls;
    }

    @Transactional(readOnly = true)
    public String requireRead(HttpServletRequest request) {
        if (request == null || request.getSession(false) == null || !(request.getSession(false)
                .getAttribute(IActionConstants.USER_SESSION_DATA) instanceof UserSessionData actor)) {
            throw denied();
        }
        String id = Integer.toString(actor.getSystemUserId());
        if (!hasPermission(request, id))
            throw denied();
        return id;
    }

    private boolean hasPermission(HttpServletRequest request, String actor) {
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
        List<SystemModuleUrl> mappings = urls.getByUrlPath("/ElectronicOrders");
        if (mappings == null || mappings.stream().noneMatch(mapping -> eligibleMapping(mapping, request)))
            return false;
        if (userModules.isUserAdmin(request)) {
            return true;
        }
        String mode = ConfigurationProperties.getInstance().getPropertyValue("permissions.agent");
        if ("USER".equalsIgnoreCase(mode)) {
            // The generic agent-ID method is hard-wired to role.id; USER uses
            // the actual many-to-one mapping, whose identifier type is String.
            return granted(permissions.getAllMatching("systemUser.id", actor), mappings, request);
        }
        if (!"ROLE".equalsIgnoreCase(mode)) {
            return false;
        }
        List<String> roleIds = roles.getRoleIdsForUser(actor);
        if (roleIds == null) {
            return false;
        }
        for (String roleId : roleIds) {
            if (roleId != null && roleId.matches("[1-9][0-9]*") && granted(
                    permissions.getAllPermissionModulesByAgentId(Integer.parseInt(roleId)), mappings, request)) {
                return true;
            }
        }
        return false;
    }

    private boolean eligibleMapping(SystemModuleUrl mapping, HttpServletRequest request) {
        return mapping != null && mapping.getSystemModule() != null
                && "Y".equalsIgnoreCase(mapping.getSystemModule().getHasSelectFlag())
                && (mapping.getParam() == null || Objects.equals(mapping.getParam().getValue(),
                        request.getParameter(mapping.getParam().getName())));
    }

    private boolean granted(List<PermissionModule> modules, List<SystemModuleUrl> mappings,
            HttpServletRequest request) {
        if (modules == null)
            return false;
        for (PermissionModule module : modules) {
            if (module == null || module.getSystemModule() == null || !"Y".equalsIgnoreCase(module.getHasSelect()))
                continue;
            for (SystemModuleUrl mapping : mappings) {
                if (eligibleMapping(mapping, request)
                        && Objects.equals(mapping.getSystemModule().getId(), module.getSystemModule().getId())
                        && Objects.equals(mapping.getSystemModule().getSystemModuleName(),
                                module.getSystemModule().getSystemModuleName()))
                    return true;
            }
        }
        return false;
    }

    private boolean interactive(Authentication auth) {
        return auth != null && auth.isAuthenticated() && !(auth instanceof AnonymousAuthenticationToken);
    }

    private AccessDeniedException denied() {
        return new AccessDeniedException("eorder.permissionDenied");
    }
}
