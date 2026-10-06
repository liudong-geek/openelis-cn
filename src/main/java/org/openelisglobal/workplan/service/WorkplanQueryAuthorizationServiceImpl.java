package org.openelisglobal.workplan.service;

import jakarta.servlet.http.HttpServletRequest;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.login.dao.UserModuleService;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.systemmodule.service.SystemModuleUrlService;
import org.openelisglobal.systemmodule.valueholder.SystemModuleUrl;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.openelisglobal.systemusermodule.service.PermissionModuleService;
import org.openelisglobal.systemusermodule.valueholder.PermissionModule;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.test.service.TestService;
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
 * Resolves current actor and existing Workplan/Print read mappings. An unmapped
 * REST URL never creates permission.
 */
@Service
public class WorkplanQueryAuthorizationServiceImpl implements WorkplanQueryAuthorizationService {
    private final UserService userService;
    private final RoleService roleDefinitions;
    private final TestService tests;
    private final TestSectionService sections;
    private final UserModuleService userModules;
    private final UserRoleService roles;
    private final PermissionModuleService<PermissionModule> permissions;
    private final SystemUserService users;
    private final SystemModuleUrlService urls;

    public WorkplanQueryAuthorizationServiceImpl(UserModuleService userModules, UserRoleService roles,
            PermissionModuleService<PermissionModule> permissions, SystemUserService users, SystemModuleUrlService urls,
            UserService userService, RoleService roleDefinitions, TestService tests, TestSectionService sections) {
        this.roleDefinitions = roleDefinitions;
        this.tests = tests;
        this.sections = sections;
        this.userService = userService;
        this.userModules = userModules;
        this.roles = roles;
        this.permissions = permissions;
        this.users = users;
        this.urls = urls;
    }

    @Transactional(readOnly = true)
    public String requireRead(HttpServletRequest request, String type) {
        if (request == null || request.getSession(false) == null || !(request.getSession(false)
                .getAttribute(IActionConstants.USER_SESSION_DATA) instanceof UserSessionData actor)) {
            throw denied();
        }
        String id = Integer.toString(actor.getSystemUserId());
        if (!hasPermission(request, id, path(type), type))
            throw denied();
        return id;
    }

    @Override
    @Transactional(readOnly = true)
    public boolean canPrint(HttpServletRequest request, String actor, String type) {
        return hasPermission(request, actor, path(type), type)
                && hasPermission(request, actor, "/PrintWorkplanReport", type);
    }

    @Override
    @Transactional(readOnly = true)
    public Set<String> allowedTestIds(String actor) {
        try {
            var resultsRole = roleDefinitions.getRoleByName(Constants.ROLE_RESULTS);
            if (resultsRole == null || !resultsRole.isActive())
                throw denied();
            Set<String> ids = userService.getTestIdsForLabUnitRole(actor, Constants.ROLE_RESULTS);
            if (ids == null)
                throw denied();
            Set<String> visible = new HashSet<>();
            for (String id : ids) {
                var test = tests.get(id);
                if (test == null || !test.isActive() || test.getTestSection() == null)
                    continue;
                var unit = sections.get(test.getTestSection().getId());
                if (unit != null && "Y".equals(unit.getIsActive()))
                    visible.add(id);
            }
            return Set.copyOf(visible);
        } catch (IllegalArgumentException e) {
            throw denied();
        }
    }

    private String path(String type) {
        return switch (type) {
        case "test" -> "/WorkPlanByTest";
        case "panel" -> "/WorkPlanByPanel";
        case "unit" -> "/WorkPlanByTestSection";
        case "priority" -> "/WorkPlanByPriority";
        default -> throw denied();
        };
    }

    private boolean hasPermission(HttpServletRequest request, String actor, String path, String type) {
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
        List<SystemModuleUrl> mappings = urls.getByUrlPath(path);
        if (mappings == null || mappings.stream().noneMatch(mapping -> eligibleMapping(mapping, type)))
            return false;
        if (userModules.isUserAdmin(request)) {
            var administrator = roleDefinitions.getRoleByName(Constants.ROLE_GLOBAL_ADMIN);
            var assigned = roles.getRoleIdsForUser(actor);
            return administrator != null && administrator.isActive() && assigned != null
                    && assigned.contains(administrator.getId());
        }
        String mode = ConfigurationProperties.getInstance().getPropertyValue("permissions.agent");
        if ("USER".equalsIgnoreCase(mode)) {
            // The generic agent-ID method is hard-wired to role.id; USER uses
            // the actual many-to-one mapping, whose identifier type is String.
            return granted(permissions.getAllMatching("systemUser.id", actor), mappings, type);
        }
        if (!"ROLE".equalsIgnoreCase(mode)) {
            return false;
        }
        List<String> roleIds = roles.getRoleIdsForUser(actor);
        if (roleIds == null) {
            return false;
        }
        for (String roleId : roleIds) {
            var currentRole = roleId == null ? null : roleDefinitions.get(roleId);
            if (currentRole == null || !currentRole.isActive())
                continue;
            if (roleId != null && roleId.matches("[1-9][0-9]*") && granted(
                    permissions.getAllPermissionModulesByAgentId(Integer.parseInt(roleId)), mappings, type)) {
                return true;
            }
        }
        return false;
    }

    private boolean eligibleMapping(SystemModuleUrl mapping, String type) {
        return mapping != null && mapping.getSystemModule() != null
                && "Y".equalsIgnoreCase(mapping.getSystemModule().getHasSelectFlag())
                && (mapping.getParam() == null || ("type".equals(mapping.getParam().getName())
                        && Objects.equals(mapping.getParam().getValue(), type)));
    }

    private boolean granted(List<PermissionModule> modules, List<SystemModuleUrl> mappings, String type) {
        if (modules == null)
            return false;
        for (PermissionModule module : modules) {
            if (module == null || module.getSystemModule() == null || !"Y".equalsIgnoreCase(module.getHasSelect()))
                continue;
            for (SystemModuleUrl mapping : mappings) {
                if (eligibleMapping(mapping, type)
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
        return new AccessDeniedException("workplan.permissionDenied");
    }
}
