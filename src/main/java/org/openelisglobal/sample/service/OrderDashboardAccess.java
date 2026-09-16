package org.openelisglobal.sample.service;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Objects;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.formfields.FormFields.Field;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.systemuser.service.UserService;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

/**
 * Bind list/count to the same current reception actor, laboratory grants and
 * privacy policy.
 */
@Service
public class OrderDashboardAccess {
    private final OrderEntryActorGuard actors;
    private final UserService users;
    private final RoleService roles;

    public OrderDashboardAccess(OrderEntryActorGuard actors, UserService users, RoleService roles) {
        this.actors = actors;
        this.users = users;
        this.roles = roles;
    }

    public record Scope(OrderEntryActorGuard.BoundActor actor, List<String> testIds, List<String> sectionIds,
            boolean masked) {
    }

    public Scope bind(HttpServletRequest request) {
        var actor = actors.bind(request);
        var role = roles.getRoleByName(Constants.ROLE_RECEPTION);
        if (role == null || role.getId() == null)
            throw new AccessDeniedException("dashboard.access.changed");
        return new Scope(actor, ids(users.getAllDisplayUserTestsByLabUnit(actor.userId(), Constants.ROLE_RECEPTION)),
                ids(users.getUserTestSections(actor.userId(), role.getId())), masked());
    }

    public void requireUnchanged(HttpServletRequest request, Scope before) {
        actors.requireUnchanged(request, before.actor());
        var role = roles.getRoleByName(Constants.ROLE_RECEPTION);
        if (role == null
                || !before.testIds().equals(
                        ids(users.getAllDisplayUserTestsByLabUnit(before.actor().userId(), Constants.ROLE_RECEPTION)))
                || !before.sectionIds().equals(ids(users.getUserTestSections(before.actor().userId(), role.getId())))
                || before.masked() != masked())
            throw new AccessDeniedException("dashboard.access.changed");
    }

    private boolean masked() {
        return FormFields.getInstance().useField(Field.DepersonalizedResults);
    }

    private List<String> ids(List<IdValuePair> values) {
        if (values == null)
            return List.of();
        return values.stream().filter(Objects::nonNull).map(IdValuePair::getId)
                .filter(id -> id != null && id.matches("[1-9][0-9]*")).distinct().sorted().toList();
    }
}
