package org.openelisglobal.testcalculated.service;

import org.openelisglobal.common.valueholder.BaseObject;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * Validation for configuration commands; no clinical decision rules are defined
 * here.
 */
public final class RuleConfigurationValidation {
    private RuleConfigurationValidation() {
    }

    public static void require(boolean valid) {
        if (!valid)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "INVALID_RULE");
    }

    public static int positiveId(String id) {
        require(id != null && id.matches("[1-9][0-9]*"));
        try {
            return Integer.parseInt(id);
        } catch (NumberFormatException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "INVALID_RULE");
        }
    }

    public static void version(String supplied, BaseObject<?> stored) {
        require(supplied != null && !supplied.isBlank());
        if (stored.getLastupdated() == null || !supplied.equals(stored.getLastupdated().toInstant().toString())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "RULE_CONFLICT");
        }
    }

    public static ResponseStatusException missing() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "RULE_NOT_FOUND");
    }
}
