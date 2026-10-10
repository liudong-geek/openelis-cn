package org.openelisglobal.result.service;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.result.dao.ResultRestrictionDAO;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Local clinical module grants and actual phase scope; no cached menu
 * permissions.
 */
@Service
public class ResultRestrictionAccess {
    public enum Action {
        SELECT, UPDATE
    }

    public enum Phase {
        RESULTS(Constants.ROLE_RESULTS, "/LogbookResults", "LogbookResults", null),
        RECEPTION(Constants.ROLE_RECEPTION, "/SamplePatientEntry", "SamplePatientEntry", null),
        VALIDATION(Constants.ROLE_VALIDATION, "/AccessionValidation", "ResultsValidationGeneral", null),
        REPORTS(Constants.ROLE_REPORTS, "/ReportPrint", "Report:patient", "patient");

        final String role, path, module, type;

        Phase(String role, String path, String module, String type) {
            this.role = role;
            this.path = path;
            this.module = module;
            this.type = type;
        }
    }

    public record Scope(ResultRestrictionActorGuard.BoundActor actor, Phase phase, Action action, String roleId,
            String moduleSnapshot, Set<String> sectionIds, boolean masked) {
    }

    private final ResultRestrictionPermissionReader permissions;
    private final ResultRestrictionDAO dao;

    public ResultRestrictionAccess(ResultRestrictionPermissionReader permissions, ResultRestrictionDAO dao) {
        this.permissions = permissions;
        this.dao = dao;
    }

    public Scope bind(HttpServletRequest request, Phase phase, Action action) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isSynchronizationActive())
            throw new IllegalStateException("Result access binding requires its clinical service transaction");
        var scope = permissions.read(request, null, phase, action);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void beforeCommit(boolean readOnly) {
                requireUnchanged(request, scope);
            }
        });
        return scope;
    }

    /** Bind only the actual interactive actor of the existing typed write. */
    public Scope bindForActor(HttpServletRequest request, Phase phase, Action action, String expectedActor) {
        var scope = bind(request, phase, action);
        if (!Objects.equals(expectedActor, scope.actor().userId()))
            throw denied();
        return scope;
    }

    public Scope bindCurrentRequest(Phase phase, Action action, String expectedActor) {
        if (!(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes))
            throw denied();
        return bindForActor(attributes.getRequest(), phase, action, expectedActor);
    }

    /**
     * Current selected analyses only; existing complete-group/clinical guards
     * remain authoritative.
     */
    public void requireAnalysisIds(Scope scope, java.util.Collection<String> ids) {
        if (ids == null || ids.isEmpty() || ids.size() > 5000 || ids.stream().anyMatch(id -> !numeric(id)))
            throw denied();
        var selected = List.copyOf(ids);
        verifyAnalysisIds(scope, selected);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void beforeCommit(boolean readOnly) {
                verifyAnalysisIds(scope, selected);
            }
        });
    }

    private void verifyAnalysisIds(Scope scope, List<String> ids) {
        for (String id : ids) {
            var current = dao.findAnalysis(id).orElseThrow(this::denied);
            if (!Objects.equals(id, current.analysisId()) || !scope.sectionIds().contains(current.sectionId()))
                throw denied();
        }
    }

    public Scope forPhase(HttpServletRequest request, Scope before, Phase phase, Action action) {
        return permissions.read(request, before.actor(), phase, action);
    }

    public void requireUnchanged(HttpServletRequest request, Scope before) {
        var now = permissions.read(request, before.actor(), before.phase(), before.action());
        if (!before.equals(now))
            throw denied();
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
