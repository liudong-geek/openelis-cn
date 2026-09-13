package org.openelisglobal.barcode.service;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.util.Set;
import java.util.TreeSet;
import org.openelisglobal.barcode.exception.BarcodeLabelGenerationException;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.login.dao.UserModuleService;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.login.service.LoginUserService;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.security.DaemonAuthenticationToken;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.systemusermodule.service.PermissionModuleService;
import org.openelisglobal.systemusermodule.valueholder.PermissionModule;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.RememberMeAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.saml2.provider.service.authentication.DefaultSaml2AuthenticatedPrincipal;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.transaction.annotation.Transactional;

/** Explicitly inherits the existing PrintBarcode module; unmapped REST is not permission. */
@Service
public class BarcodeLabelGenerationPermissionService {
    private final UserModuleService userModuleService;
    private final UserRoleService roles;
    private final PermissionModuleService<PermissionModule> permissions;
    @Autowired private SystemUserService systemUsers;
    @Autowired private LoginUserService loginUsers;
    @Autowired private RoleService roleDefinitions;

    public record BoundOperator(HttpServletRequest request, HttpSession session, Authentication authentication,
            Object principal, String userId, String login, int labUnit, Set<String> authorities) { }

    public BarcodeLabelGenerationPermissionService(UserModuleService userModuleService, UserRoleService roles,
            PermissionModuleService<PermissionModule> permissions) {
        this.userModuleService = userModuleService;
        this.roles = roles;
        this.permissions = permissions;
    }

    @Transactional(readOnly = true)
    public BoundOperator requirePrintPermission(HttpServletRequest request) {
        return resolve(request);
    }

    // Invoked inside the actual generation transaction, before any order/PDF/count access.
    public BoundOperator bindCurrent(BoundOperator operator) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isSynchronizationActive()
                || !(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes)) {
            throw denied();
        }
        requireUnchanged(operator);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void beforeCommit(boolean readOnly) { requireUnchanged(operator); }
        });
        return operator;
    }

    public void requireUnchanged(BoundOperator expected) {
        if (expected == null || !(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs)
                || attrs.getRequest().getSession(false) != expected.session()
                || expected.request().getSession(false) != expected.session()
                || !sameLegacy(expected.request().getAttribute(IActionConstants.USER_SESSION_DATA), expected.userId(), expected.login())) { throw denied(); }
        BoundOperator current = resolve(attrs.getRequest());
        if (current.session() != expected.session() || current.authentication() != expected.authentication()
                || current.principal() != expected.principal() || !current.userId().equals(expected.userId())
                || !current.login().equals(expected.login()) || current.labUnit() != expected.labUnit()
                || !current.authorities().equals(expected.authorities())) { throw denied(); }
    }

    private BoundOperator resolve(HttpServletRequest request) {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (request == null || !interactive(auth)) { throw denied(); }
            Object principal = auth.getPrincipal();
            String login = login(principal);
            if (!login.equals(auth.getName())) { throw denied(); }
            var match = systemUsers.getMatch("loginName", login);
            if (match == null || match.isEmpty()) { throw denied(); }
            var user = match.get();
            String id = user.getId();
            if (!org.openelisglobal.barcode.dto.BarcodeLabelGenerateRequest.positiveId(id)
                    || !login.equals(user.getLoginName()) || !"Y".equals(user.getIsActive())) { throw denied(); }
            if (auth.getPrincipal() instanceof UserDetails) {
                var local = loginUsers.getMatch("loginName", login);
                if (local == null || local.isEmpty() || !login.equals(local.get().getLoginName())
                        || !id.equals(String.valueOf(local.get().getSystemUserId()))
                        || !"N".equalsIgnoreCase(local.get().getAccountDisabled())
                        || !"N".equalsIgnoreCase(local.get().getAccountLocked())
                        || local.get().getPasswordExpiredDayNo() <= 0) { throw denied(); }
            }
            HttpSession session = request.getSession(false);
            if (session == null || !(session.getAttribute(IActionConstants.USER_SESSION_DATA) instanceof UserSessionData legacy)
                    || !id.equals(Integer.toString(legacy.getSystemUserId())) || !sameLegacy(legacy, id, login)
                    || !sameLegacy(request.getAttribute(IActionConstants.USER_SESSION_DATA), id, login)
                    || !(session.getAttribute("SPRING_SECURITY_CONTEXT") instanceof SecurityContext sc)
                    || !interactive(sc.getAuthentication()) || !login.equals(sc.getAuthentication().getName())
                    || !login.equals(login(sc.getAuthentication().getPrincipal()))
                    || !sc.getAuthentication().getPrincipal().getClass().equals(auth.getPrincipal().getClass())
                    || !authorities(sc.getAuthentication()).equals(authorities(auth))
                    || userModuleService.isSessionExpired(request)) { throw denied(); }
            Set<String> grants = authorities(auth);
            int labUnit = legacy.getLoginLabUnit();
            requireModule(request, id, auth);
            if (SecurityContextHolder.getContext().getAuthentication() != auth || auth.getPrincipal() != principal || !interactive(auth)
                    || request.getSession(false) != session || !login.equals(login(auth.getPrincipal()))
                    || !grants.equals(authorities(auth)) || legacy.getLoginLabUnit() != labUnit
                    || session.getAttribute(IActionConstants.USER_SESSION_DATA) != legacy
                    || !sameLegacy(legacy, id, login)
                    || !sameLegacy(request.getAttribute(IActionConstants.USER_SESSION_DATA), id, login)
                    || session.getAttribute("SPRING_SECURITY_CONTEXT") != sc
                    || !interactive(sc.getAuthentication()) || !login.equals(sc.getAuthentication().getName())
                    || !grants.equals(authorities(sc.getAuthentication()))) { throw denied(); }
            return new BoundOperator(request, session, auth, auth.getPrincipal(), id, login, labUnit, grants);
        } catch (BarcodeLabelGenerationException error) {
            throw error;
        } catch (RuntimeException error) {
            throw denied(); // No login, patient, SQL or exception details in errors.
        }
    }

    private void requireModule(HttpServletRequest request, String userId, Authentication authentication) {
        boolean local = authentication.getPrincipal() instanceof UserDetails;
        if (local && userModuleService.isUserAdmin(request)) {
            return;
        }
        String mode = ConfigurationProperties.getInstance().getPropertyValue("permissions.agent");
        boolean allowed = false;
        if ("USER".equalsIgnoreCase(mode)) {
            allowed = permissions.getAllPermittedPagesFromAgentId(Integer.parseInt(userId)).contains("PrintBarcode");
        } else if ("ROLE".equalsIgnoreCase(mode)) {
            Set<String> roleIds = new TreeSet<>();
            if (local) {
                roleIds.addAll(roles.getRoleIdsForUser(userId));
            } else {
                // Match the existing SSO handler's authority-to-role mapping, without
                // requiring a local password account or trusting cached permitted pages.
                for (String authority : authorities(authentication)) {
                    String[] parts = authority.split("-");
                    if (parts.length < 2) { continue; }
                    var role = roleDefinitions.getMatch("name", parts[1]);
                    if (role != null && role.isPresent() && role.get().isActive()
                            && parts[1].equals(role.get().getName())) {
                        roleIds.add(role.get().getId());
                    }
                }
            }
            for (String role : roleIds) {
                if (!org.openelisglobal.barcode.dto.BarcodeLabelGenerateRequest.positiveId(role)) { continue; }
                var currentRole = roleDefinitions.getMatch("id", role);
                if (currentRole != null && currentRole.isPresent() && currentRole.get().isActive()
                        && role.equals(currentRole.get().getId())
                        && permissions.getAllPermittedPagesFromAgentId(Integer.parseInt(role)).contains("PrintBarcode")) {
                    allowed = true;
                    break;
                }
            }
        }
        if (!allowed) {
            throw new BarcodeLabelGenerationException(403, "BARCODE_PERMISSION_DENIED");
        }
    }

    private static boolean interactive(Authentication auth) {
        return auth != null && auth.isAuthenticated() && !(auth instanceof AnonymousAuthenticationToken)
                && !(auth instanceof RememberMeAuthenticationToken) && !(auth instanceof DaemonAuthenticationToken);
    }

    private static boolean sameLegacy(Object value, String id, String login) {
        return value == null || value instanceof UserSessionData legacy
                && id.equals(Integer.toString(legacy.getSystemUserId()))
                && (legacy.getLoginName() == null || legacy.getLoginName().isBlank() || login.equals(legacy.getLoginName()));
    }

    private static String login(Object principal) {
        String name;
        if (principal instanceof UserDetails user) {
            if (!user.isEnabled() || !user.isAccountNonExpired() || !user.isCredentialsNonExpired() || !user.isAccountNonLocked()) { throw denied(); }
            name = user.getUsername();
        } else if (principal instanceof DefaultSaml2AuthenticatedPrincipal saml) { name = saml.getName();
        } else if (principal instanceof DefaultOAuth2User oauth) { name = oauth.getName();
        } else { throw denied(); }
        if (name == null || name.isBlank() || !name.equals(name.strip())) { throw denied(); }
        return name;
    }

    private static Set<String> authorities(Authentication auth) {
        Set<String> values = new TreeSet<>();
        if (auth.getAuthorities() == null) { throw denied(); }
        for (var grant : auth.getAuthorities()) {
            if (grant == null || grant.getAuthority() == null || grant.getAuthority().isBlank()) { throw denied(); }
            values.add(grant.getAuthority());
        }
        return Set.copyOf(values);
    }

    private static BarcodeLabelGenerationException denied() {
        return new BarcodeLabelGenerationException(401, "BARCODE_AUTH_REQUIRED");
    }
}
