package org.openelisglobal.qaevent;

import jakarta.servlet.http.HttpSession;
import java.util.List;
import java.util.Set;
import org.openelisglobal.qaevent.form.NceRegistrationCommand;
import org.openelisglobal.qaevent.service.NceActorGuard;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.User;

/**
 * Real immutable binding for service fixtures; access tests exercise the
 * complete actor guard.
 */
final class NceWorkspaceTestSupport {
    static final String KEY = "bf9a6f45-6630-4716-9d81-838d4b6b7f80";
    static final String VERSION = "2024-01-01 00:00:00.0";

    static NceRegistrationCommand command(String date, List<NceRegistrationCommand.LinkedSpecimen> links) {
        return new NceRegistrationCommand(KEY, "7", date, "1", "Title", "Description", "Immediate", "Cause", "Proposed",
                "MAJOR", "1", null, links);
    }

    static NceActorGuard.BoundActor actor(MockHttpServletRequest request) {
        return actor(request, "7");
    }

    static NceActorGuard.BoundActor actor(MockHttpServletRequest request, String id) {
        try {
            var principal = User.withUsername("operator7").password("unused-test").roles("RESULTS").build();
            var auth = new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
            var constructor = NceActorGuard.BoundActor.class.getDeclaredConstructor(Authentication.class, Object.class,
                    String.class, String.class, HttpSession.class, int.class, Set.class);
            constructor.setAccessible(true);
            return constructor.newInstance(auth, principal, "operator7", id, request.getSession(), 1,
                    Set.of("ROLE_RESULTS"));
        } catch (ReflectiveOperationException e) {
            throw new AssertionError(e);
        }
    }
}
