package org.openelisglobal.sample.service;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.login.service.LoginUserService;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.security.DaemonAuthenticationToken;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.userrole.service.UserRoleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.RememberMeAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.saml2.provider.service.authentication.DefaultSaml2AuthenticatedPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Binds explicit first-entry writes to the current operator, not legacy session
 * defaults. This is not an authorization substitute for individual tests or a
 * persistent submission receipt. Keep the existing login/SSO identity models.
 */
@Service
public class OrderEntryActorGuard {
    public static final String DENIED_MESSAGE = "登录身份或登记权限已变化，请重新登录后再保存。";

    @Autowired
    private SystemUserService systemUserService;
    @Autowired
    private LoginUserService loginUserService;
    @Autowired
    private UserRoleService userRoleService;

    private enum PermissionSource {
        LOCAL, SAML, OAUTH
    }

    public static final class BoundActor {
        private final Authentication authentication;
        private final Object principal;
        private final String login;
        private final String userId;
        private final HttpSession session;
        private final int loginLabUnit;
        private final Set<String> authorities;

        private BoundActor(Authentication authentication, Object principal, String login, String userId,
                HttpSession session, int loginLabUnit, Set<String> authorities) {
            this.authentication = authentication;
            this.principal = principal;
            this.login = login;
            this.userId = userId;
            this.session = session;
            this.loginLabUnit = loginLabUnit;
            this.authorities = Set.copyOf(authorities);
        }

        public String userId() {
            return userId;
        }
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public BoundActor bind(HttpServletRequest request) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isSynchronizationActive()) {
            throw new IllegalStateException("Entry identity binding requires the entry transaction");
        }
        BoundActor actor = resolve(request);
        // Also covers an outer transaction that continues after saveEntry returns.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void beforeCommit(boolean readOnly) {
                requireUnchanged(request, actor);
            }
        });
        return actor;
    }

    public void requireUnchanged(HttpServletRequest request, BoundActor actor) {
        if (actor == null || SecurityContextHolder.getContext().getAuthentication() != actor.authentication
                || actor.authentication.getPrincipal() != actor.principal) {
            throw denied();
        }
        BoundActor current = resolve(request);
        if (current.authentication != actor.authentication || current.principal != actor.principal
                || !current.login.equals(actor.login) || !current.userId.equals(actor.userId)
                || current.session != actor.session || current.loginLabUnit != actor.loginLabUnit
                || !current.authorities.equals(actor.authorities)) {
            throw denied();
        }
    }

    private BoundActor resolve(HttpServletRequest request) {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (request == null || auth == null || !auth.isAuthenticated()
                    || auth instanceof AnonymousAuthenticationToken || auth instanceof RememberMeAuthenticationToken
                    || auth instanceof DaemonAuthenticationToken || auth.getAuthorities() == null
                    || auth.getAuthorities().stream().anyMatch(Objects::isNull)
                    || auth.getAuthorities().stream().noneMatch(authority ->
                            "ROLE_RECEPTION".equals(authority.getAuthority())
                                    || "ROLE_GLOBAL_ADMIN".equals(authority.getAuthority()))) {
                throw denied();
            }
            Object principal = auth.getPrincipal();
            PermissionSource source = permissionSource(principal);
            String login = loginName(principal);
            Set<String> authorities = authorityNames(auth);
            if (!login.equals(auth.getName())) {
                throw denied();
            }
            permissionRequest(request);
            var match = systemUserService.getMatch("loginName", login);
            if (match == null || match.isEmpty()) {
                throw denied();
            }
            var user = match.get();
            String id = user.getId();
            if (id == null || !id.matches("[1-9][0-9]*") || !login.equals(user.getLoginName())
                    || !"Y".equals(user.getIsActive())) {
                throw denied();
            }
            if (source == PermissionSource.LOCAL) {
                var local = loginUserService.getMatch("loginName", login);
                if (local == null || local.isEmpty()) {
                    throw denied();
                }
                var account = local.get();
                if (!login.equals(account.getLoginName()) || !id.equals(String.valueOf(account.getSystemUserId()))
                        || !"N".equalsIgnoreCase(account.getAccountDisabled())
                        || !"N".equalsIgnoreCase(account.getAccountLocked()) || account.getPasswordExpiredDayNo() <= 0) {
                    throw denied();
                }
            }
            HttpSession session = validateSession(request, id, login, authorities, source);
            int labUnit = ((UserSessionData) session.getAttribute(IActionConstants.USER_SESSION_DATA)).getLoginLabUnit();
            // Local login uses DB roles; the existing SSO login uses IdP authorities
            // and does not create local password accounts or local role records.
            if (source == PermissionSource.LOCAL && !(userRoleService.userInRole(id, Constants.ROLE_RECEPTION)
                    || userRoleService.userInRole(id, Constants.ROLE_GLOBAL_ADMIN))) {
                throw denied();
            }
            if (SecurityContextHolder.getContext().getAuthentication() != auth || !auth.isAuthenticated()
                    || auth.getPrincipal() != principal || !login.equals(loginName(principal))
                    || !login.equals(auth.getName()) || !authorities.equals(authorityNames(auth))) {
                throw denied();
            }
            if (validateSession(request, id, login, authorities, source) != session
                    || validateSession(permissionRequest(request), id, login, authorities, source) != session
                    || ((UserSessionData) session.getAttribute(IActionConstants.USER_SESSION_DATA)).getLoginLabUnit()
                            != labUnit) {
                throw denied();
            }
            return new BoundActor(auth, principal, login, id, session, labUnit, authorities);
        } catch (RuntimeException failure) {
            // No fallback to a session/daemon user, and no account or DB details in
            // the response. Throwing exits the caller's transaction.
            throw denied();
        }
    }

    private HttpSession validateSession(HttpServletRequest request, String id, String login, Set<String> authorities,
            PermissionSource source) {
        validateLegacyIdentity(request.getAttribute(IActionConstants.USER_SESSION_DATA), id, login);
        // PatientManagementUpdate and UserService still require these session
        // objects. Reject an incomplete login here, before either service writes.
        HttpSession session = request.getSession(false);
        if (session == null || session.getAttribute(IActionConstants.USER_SESSION_DATA) == null) {
            throw denied();
        }
        validateLegacyIdentity(session.getAttribute(IActionConstants.USER_SESSION_DATA), id, login);
        if (!(session.getAttribute("SPRING_SECURITY_CONTEXT") instanceof SecurityContext securityContext)) {
            throw denied();
        }
        Authentication sessionAuth = securityContext.getAuthentication();
        if (sessionAuth == null || !sessionAuth.isAuthenticated()
                || sessionAuth instanceof AnonymousAuthenticationToken
                || sessionAuth instanceof RememberMeAuthenticationToken || sessionAuth instanceof DaemonAuthenticationToken
                || permissionSource(sessionAuth.getPrincipal()) != source
                || !login.equals(sessionAuth.getName()) || !login.equals(loginName(sessionAuth.getPrincipal()))
                || !authorities.equals(authorityNames(sessionAuth))) {
            throw denied();
        }
        return session;
    }

    private HttpServletRequest permissionRequest(HttpServletRequest request) {
        // UserService resolves test-section permissions from this request. Permit
        // normal wrappers, but never mix two sessions or create one as a fallback.
        if (!(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes)
                || request.getSession(false) == null
                || attributes.getRequest().getSession(false) != request.getSession(false)) {
            throw denied();
        }
        return attributes.getRequest();
    }

    private PermissionSource permissionSource(Object principal) {
        // Match the principal types actually handled by UserService.
        if (principal instanceof UserDetails) {
            return PermissionSource.LOCAL;
        }
        if (principal instanceof DefaultSaml2AuthenticatedPrincipal) {
            return PermissionSource.SAML;
        }
        if (principal instanceof DefaultOAuth2User) {
            return PermissionSource.OAUTH;
        }
        throw denied();
    }

    private Set<String> authorityNames(Authentication authentication) {
        if (authentication.getAuthorities() == null) {
            throw denied();
        }
        Set<String> names = new TreeSet<>();
        for (var authority : authentication.getAuthorities()) {
            if (authority == null || authority.getAuthority() == null || authority.getAuthority().isBlank()) {
                throw denied();
            }
            names.add(authority.getAuthority());
        }
        return names;
    }

    private void validateLegacyIdentity(Object value, String id, String login) {
        if (value == null) {
            return;
        }
        if (!(value instanceof UserSessionData sessionUser)
                || !id.equals(String.valueOf(sessionUser.getSystemUserId()))
                || (sessionUser.getLoginName() != null && !sessionUser.getLoginName().isBlank()
                        && !login.equals(sessionUser.getLoginName()))) {
            throw denied();
        }
    }

    private String loginName(Object principal) {
        String login;
        if (principal instanceof UserDetails user) {
            if (!user.isEnabled() || !user.isAccountNonExpired() || !user.isCredentialsNonExpired()
                    || !user.isAccountNonLocked()) {
                throw denied();
            }
            login = user.getUsername();
        } else if (principal instanceof DefaultSaml2AuthenticatedPrincipal saml) {
            login = saml.getName();
        } else if (principal instanceof DefaultOAuth2User oauth) {
            login = oauth.getName();
        } else {
            throw denied();
        }
        if (login == null || login.isBlank() || !login.equals(login.strip())) {
            throw denied();
        }
        return login;
    }

    private AccessDeniedException denied() {
        return new AccessDeniedException(DENIED_MESSAGE);
    }
}
