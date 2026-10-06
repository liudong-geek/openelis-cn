package org.openelisglobal.qaevent.service;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.formfields.FormFields.Field;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.login.dao.UserModuleService;
import org.openelisglobal.qaevent.dao.NceWorkspaceDAO;
import org.openelisglobal.qaevent.form.NceWorkspaceResponse.EffectiveScope;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.systemmodule.service.SystemModuleUrlService;
import org.openelisglobal.systemmodule.valueholder.SystemModule;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.systemusermodule.service.PermissionModuleService;
import org.openelisglobal.systemusermodule.valueholder.PermissionModule;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Current module action grants and professional groups, never a menu or cached
 * permission list.
 */
@Service
public class NceWorkspaceAccess {
    public enum Action {
        SELECT, ADD, UPDATE
    }

    public record Scope(NceActorGuard.BoundActor actor, SystemModule module, Action action, List<String> roleIds,
            Set<String> sectionIds, boolean masked) {
        public EffectiveScope view() {
            return new EffectiveScope(roleIds, sectionIds.stream().sorted().toList());
        }
    }

    private final NceActorGuard actors;
    private final UserRoleService roles;
    private final RoleService definitions;
    private final SystemModuleUrlService urls;
    private final PermissionModuleService<PermissionModule> permissions;
    private final UserModuleService admin;
    private final UserService users;
    private final TestSectionService sections;
    private final NceWorkspaceDAO dao;

    public NceWorkspaceAccess(NceActorGuard actors, UserRoleService roles, RoleService definitions,
            SystemModuleUrlService urls, PermissionModuleService<PermissionModule> permissions, UserModuleService admin,
            UserService users, TestSectionService sections, NceWorkspaceDAO dao) {
        this.actors = actors;
        this.roles = roles;
        this.definitions = definitions;
        this.urls = urls;
        this.permissions = permissions;
        this.admin = admin;
        this.users = users;
        this.sections = sections;
        this.dao = dao;
    }

    public Scope bind(HttpServletRequest request, Action action) {
        var actor = actors.bind(request);
        var scope = resolve(request, actor, action);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void beforeCommit(boolean readOnly) {
                requireUnchanged(request, scope);
            }
        });
        return scope;
    }

    public void requireUnchanged(HttpServletRequest request, Scope before) {
        actors.requireUnchanged(request, before.actor());
        var now = resolve(request, before.actor(), before.action());
        if (!before.module().getId().equals(now.module().getId()) || !before.roleIds().equals(now.roleIds())
                || !before.sectionIds().equals(now.sectionIds()) || before.masked() != now.masked())
            throw denied();
    }

    public Scope forAction(HttpServletRequest request, Scope scope, Action action) {
        actors.requireUnchanged(request, scope.actor());
        return resolve(request, scope.actor(), action);
    }

    public boolean allowed(HttpServletRequest request, Scope scope, Action action) {
        try {
            var fresh = resolve(request, scope.actor(), action);
            return !fresh.sectionIds().isEmpty();
        } catch (AccessDeniedException e) {
            return false;
        }
    }

    private Scope resolve(HttpServletRequest request, NceActorGuard.BoundActor actor, Action action) {
        var mappings = urls.getByUrlPath("/NonConformity");
        if (mappings == null)
            throw denied();
        List<SystemModule> modules = new ArrayList<>();
        for (var mapping : mappings) {
            if (mapping == null)
                continue;
            dao.refresh(mapping);
            var mapped = mapping.getSystemModule();
            dao.refresh(mapped);
            if (mapping.getParam() == null && mapped != null && "NonConformity".equals(mapped.getSystemModuleName()))
                modules.add(mapped);
        }
        if (modules.isEmpty() || modules.stream().map(SystemModule::getId).distinct().count() != 1)
            throw denied();
        var module = modules.get(0);
        if (!moduleFlag(module, Action.SELECT) || !moduleFlag(module, action))
            throw denied();
        var assigned = roles.getRoleIdsForUser(actor.userId());
        if (assigned == null)
            throw denied();
        List<String> grantedRoles = new ArrayList<>();
        String mode = ConfigurationProperties.getInstance().getPropertyValue("permissions.agent");
        boolean userGrant = "USER".equalsIgnoreCase(mode)
                && grants(permissions.getAllMatching("systemUser.id", actor.userId()), module, action);
        for (String id : assigned) {
            var role = definitions.get(id);
            dao.refresh(role);
            if (role == null || !role.isActive())
                continue;
            boolean adminGrant = "Global Administrator".equals(role.getName()) && admin.isUserAdmin(request);
            if (userGrant || adminGrant || "ROLE".equalsIgnoreCase(mode)
                    && grants(permissions.getAllPermissionModulesByAgentId(Integer.parseInt(id)), module, action))
                grantedRoles.add(id);
        }
        if (grantedRoles.isEmpty())
            throw denied();
        // Refresh the existing lab-unit relationship before UserService applies
        // login-lab-unit semantics.
        var labRoles = users.getUserLabUnitRoles(actor.userId());
        dao.refresh(labRoles);
        if (labRoles != null && labRoles.getLabUnitRoleMap() != null)
            labRoles.getLabUnitRoleMap().forEach(dao::refresh);
        Set<String> scope = new TreeSet<>();
        for (String id : grantedRoles) {
            var values = users.getUserTestSections(actor.userId(), id);
            if (values != null)
                for (var value : values) {
                    if (value == null || value.getId() == null || !value.getId().matches("[1-9][0-9]*"))
                        continue;
                    var section = sections.get(value.getId());
                    dao.refresh(section);
                    if (section != null && "Y".equals(section.getIsActive()))
                        scope.add(value.getId());
                }
        }
        if (scope.isEmpty())
            throw denied();
        return new Scope(actor, module, action, grantedRoles.stream().distinct().sorted().toList(), Set.copyOf(scope),
                FormFields.getInstance().useField(Field.DepersonalizedResults));
    }

    private boolean grants(List<PermissionModule> values, SystemModule module, Action action) {
        if (values == null)
            return false;
        for (var p : values) {
            if (p == null)
                continue;
            dao.refresh(p);
            var m = p.getSystemModule();
            if (m != null && Objects.equals(m.getId(), module.getId())
                    && Objects.equals(m.getSystemModuleName(), module.getSystemModuleName())
                    && "Y".equalsIgnoreCase(p.getHasSelect()) && "Y".equalsIgnoreCase(switch (action) {
                    case SELECT -> p.getHasSelect();
                    case ADD -> p.getHasAdd();
                    case UPDATE -> p.getHasUpdate();
                    }))
                return true;
        }
        return false;
    }

    private boolean moduleFlag(SystemModule m, Action a) {
        return "Y".equalsIgnoreCase(switch (a) {
        case SELECT -> m.getHasSelectFlag();
        case ADD -> m.getHasAddFlag();
        case UPDATE -> m.getHasUpdateFlag();
        });
    }

    private AccessDeniedException denied() {
        return new AccessDeniedException("NCE_PERMISSION_DENIED");
    }
}
