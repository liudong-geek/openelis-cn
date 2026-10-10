package org.openelisglobal.result.service;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.formfields.FormFields.Field;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.config.ResultPermissionTransactionManager;
import org.openelisglobal.result.dao.ResultRestrictionDAO;
import org.openelisglobal.result.service.ResultRestrictionAccess.Action;
import org.openelisglobal.result.service.ResultRestrictionAccess.Phase;
import org.openelisglobal.result.service.ResultRestrictionAccess.Scope;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.systemmodule.service.SystemModuleUrlService;
import org.openelisglobal.systemmodule.valueholder.SystemModule;
import org.openelisglobal.systemmodule.valueholder.SystemModuleUrl;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.systemusermodule.service.PermissionModuleService;
import org.openelisglobal.systemusermodule.valueholder.PermissionModule;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Each invocation uses a separate committed permission snapshot, never the
 * clinical transaction's snapshot.
 */
@Service
public class ResultRestrictionPermissionReader {
    private final ResultRestrictionActorGuard actors;
    private final RoleService definitions;
    private final UserRoleService bindings;
    private final SystemModuleUrlService urls;
    private final PermissionModuleService<PermissionModule> permissions;
    private final UserService users;
    private final TestSectionService sections;
    private final ResultRestrictionDAO dao;

    public ResultRestrictionPermissionReader(ResultRestrictionActorGuard actors, RoleService definitions,
            UserRoleService bindings, SystemModuleUrlService urls,
            PermissionModuleService<PermissionModule> permissions, UserService users, TestSectionService sections,
            ResultRestrictionDAO dao) {
        this.actors = actors;
        this.definitions = definitions;
        this.bindings = bindings;
        this.urls = urls;
        this.permissions = permissions;
        this.users = users;
        this.sections = sections;
        this.dao = dao;
    }

    @Transactional(transactionManager = ResultPermissionTransactionManager.BEAN_NAME, propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED, readOnly = true, rollbackFor = Exception.class, timeout = 15)
    public Scope read(HttpServletRequest request, ResultRestrictionActorGuard.BoundActor previous, Phase phase,
            Action action) {
        // This read owns no clinical callbacks. The Access facade registers those
        // only after this separate read returns and the clinical transaction resumes.
        var actor = previous == null ? actors.readBinding(request) : previous;
        if (previous != null)
            actors.requireUnchanged(request, previous);
        var scope = resolve(request, actor, phase, action);
        actors.requireUnchanged(request, actor);
        return scope;
    }

    private Scope resolve(HttpServletRequest request, ResultRestrictionActorGuard.BoundActor actor, Phase phase,
            Action action) {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getAuthorities().stream()
                .noneMatch(a -> ("ROLE_" + phase.role.toUpperCase(java.util.Locale.ROOT)).equals(a.getAuthority())))
            throw denied();
        var definition = definitions.getRoleByName(phase.role);
        dao.refresh(definition);
        if (definition == null || !definition.isActive() || !numeric(definition.getId()) || definition.getName() == null
                || !phase.role.equals(definition.getName().trim()))
            throw denied();
        var assigned = bindings.getRoleIdsForUser(actor.userId());
        // Preserve existing SSO lab-role authorities; no local password/role binding is
        // manufactured.
        boolean local = auth.getPrincipal() instanceof UserDetails;
        if (local && (assigned == null || !assigned.contains(definition.getId())))
            throw denied();
        var mappings = urls.getByUrlPath(phase.path);
        List<SystemModuleUrl> matches = new ArrayList<>();
        if (mappings != null)
            for (var m : mappings) {
                if (m == null)
                    continue;
                dao.refresh(m);
                var module = m.getSystemModule();
                dao.refresh(module);
                var param = m.getParam();
                dao.refresh(param);
                if (phase.path.equals(m.getUrlPath()) && module != null
                        && phase.module.equals(module.getSystemModuleName())
                        && (phase.type == null ? param == null
                                : param != null && "type".equals(param.getName())
                                        && phase.type.equals(param.getValue())))
                    matches.add(m);
            }
        if (matches.isEmpty() || matches.stream().map(m -> m.getSystemModule().getId()).distinct().count() != 1)
            throw denied();
        var mapping = matches.get(0);
        var module = mapping.getSystemModule();
        String mode = ConfigurationProperties.getInstance().getPropertyValue("permissions.agent");
        boolean allowed = false;
        if ("USER".equalsIgnoreCase(mode)) {
            allowed = granted(permissions.getAllMatching("systemUser.id", actor.userId()), actor.userId(), module,
                    action, false);
        } else if ("ROLE".equalsIgnoreCase(mode)) {
            var sourceRoles = local ? assigned : List.of(definition.getId());
            if (sourceRoles != null)
                for (String id : sourceRoles) {
                    if (!numeric(id))
                        throw denied();
                    var role = definitions.get(id);
                    dao.refresh(role);
                    if (role != null && role.isActive()
                            && granted(permissions.getAllPermissionModulesByAgentId(Integer.parseInt(id)), id, module,
                                    action, true))
                        allowed = true;
                }
        }
        if (!allowed)
            throw denied();
        var lab = users.getUserLabUnitRoles(actor.userId());
        dao.refresh(lab);
        if (lab != null && lab.getLabUnitRoleMap() != null)
            lab.getLabUnitRoleMap().forEach(dao::refresh);
        Set<String> scope = new TreeSet<>();
        var values = users.getUserTestSections(actor.userId(), definition.getId());
        if (values != null)
            for (var value : values) {
                if (value == null || !numeric(value.getId()))
                    throw denied();
                var section = sections.get(value.getId());
                dao.refresh(section);
                if (section != null && "Y".equals(section.getIsActive()))
                    scope.add(value.getId());
            }
        if (scope.isEmpty())
            throw denied();
        String fingerprint = mapping.getId() + "|" + module.getId() + "|" + module.getSystemModuleName() + "|"
                + module.getHasSelectFlag() + "|" + module.getHasUpdateFlag() + "|"
                + (mapping.getParam() == null ? ""
                        : mapping.getParam().getId() + ":" + mapping.getParam().getName() + ":"
                                + mapping.getParam().getValue());
        return new Scope(actor, phase, action, definition.getId(), fingerprint, Set.copyOf(scope),
                FormFields.getInstance().useField(Field.DepersonalizedResults));
    }

    private boolean granted(List<PermissionModule> values, String agentId, SystemModule expected, Action action,
            boolean legacyRole) {
        if (values == null)
            return false;
        for (var grant : values) {
            if (grant == null)
                continue;
            dao.refresh(grant);
            var module = grant.getSystemModule();
            dao.refresh(module);
            var agent = grant.getPermissionAgent();
            dao.refresh(agent);
            if (agent == null || !Objects.equals(agentId, agent.getId()) || module == null
                    || !Objects.equals(expected.getId(), module.getId())
                    || !Objects.equals(expected.getSystemModuleName(), module.getSystemModuleName()))
                continue;
            // Legacy modules without operation flags use membership. Configured operations
            // require the actual grant; flags themselves are never an authorization.
            if (operation(module.getHasSelectFlag(), grant.getHasSelect(), legacyRole) && (action == Action.SELECT
                    || operation(module.getHasUpdateFlag(), grant.getHasUpdate(), legacyRole)))
                return true;
        }
        return false;
    }

    private boolean operation(String configured, String granted, boolean legacyRole) {
        if (legacyRole && (configured == null || "N".equalsIgnoreCase(configured)))
            return true;
        return "Y".equalsIgnoreCase(configured) && "Y".equalsIgnoreCase(granted);
    }

    private boolean numeric(String value) {
        try {
            return value != null && value.matches("[1-9][0-9]{0,9}") && Integer.parseInt(value) > 0;
        } catch (NumberFormatException invalid) {
            return false;
        }
    }

    private AccessDeniedException denied() {
        return new AccessDeniedException("RESULT_RESTRICTION_DENIED");
    }
}
