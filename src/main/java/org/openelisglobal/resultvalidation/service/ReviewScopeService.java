package org.openelisglobal.resultvalidation.service;

import java.util.List;
import java.util.Objects;
import java.util.function.BooleanSupplier;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.formfields.FormFields.Field;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.systemuser.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Captures live policy once and detects request/context policy changes. */
@Service
public class ReviewScopeService {
    private final IStatusService statuses;
    private final UserService users;
    private final DefaultConfigurationProperties configuration;
    private final BooleanSupplier depersonalized;

    @Autowired
    public ReviewScopeService(IStatusService statuses, UserService users,
            DefaultConfigurationProperties configuration) {
        this(statuses, users, configuration, () -> FormFields.getInstance().useField(Field.DepersonalizedResults));
    }

    ReviewScopeService(IStatusService statuses, UserService users, DefaultConfigurationProperties configuration,
            BooleanSupplier depersonalized) {
        this.statuses = statuses;
        this.users = users;
        this.configuration = configuration;
        this.depersonalized = depersonalized;
    }

    public ReviewScopeSnapshot capture(String actor) {
        if (actor == null || actor.isBlank())
            throw forbidden();
        boolean rejected = "true".equals(configuration.getPropertyValue(Property.VALIDATE_REJECTED_TESTS));
        String acceptedId = statuses.getStatusID(AnalysisStatus.TechnicalAcceptance);
        String rejectedId = rejected ? statuses.getStatusID(AnalysisStatus.TechnicalRejected) : null;
        if (!positive(acceptedId) || rejected && (!positive(rejectedId) || acceptedId.equals(rejectedId))) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Review status configuration is unavailable");
        }
        String mode = configuration.getPropertyValue(Property.StatusRules);
        if (mode == null || mode.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Review record policy is unavailable");
        }
        java.util.Set<String> sectionIds;
        try {
            sectionIds = users.getAnalysisSectionIdsForLabUnitRole(actor, Constants.ROLE_VALIDATION);
        } catch (org.openelisglobal.common.exception.LIMSRuntimeException error) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Review permissions are unavailable",
                    error);
        }
        return new ReviewScopeSnapshot(actor, sectionIds,
                rejected ? List.of(acceptedId, rejectedId) : List.of(acceptedId), rejected,
                mode.toUpperCase(java.util.Locale.ROOT), configuration.getPropertyValue(Property.DEFAULT_DATE_LOCALE),
                depersonalized.getAsBoolean());
    }

    public void requireUnchanged(ReviewScopeSnapshot expected) {
        ReviewScopeSnapshot current = capture(expected.actor());
        if (!Objects.equals(expected.sectionIds(), current.sectionIds()))
            throw forbidden();
        if (!expected.equals(current))
            throw stale();
    }

    static boolean positive(String id) {
        return id != null && id.matches("[1-9][0-9]{0,9}");
    }

    static ResponseStatusException stale() {
        return new ResponseStatusException(HttpStatus.CONFLICT, "Review policy changed; search again");
    }

    static ResponseStatusException forbidden() {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, "Review permission changed; search again");
    }
}
