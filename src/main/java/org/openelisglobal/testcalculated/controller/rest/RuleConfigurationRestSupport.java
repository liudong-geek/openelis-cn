package org.openelisglobal.testcalculated.controller.rest;

import jakarta.persistence.OptimisticLockException;
import java.util.Map;
import org.hibernate.ObjectNotFoundException;
import org.hibernate.StaleStateException;
import org.slf4j.LoggerFactory;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.server.ResponseStatusException;

public abstract class RuleConfigurationRestSupport {
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> configurationError(ResponseStatusException exception) {
        return ResponseEntity.status(exception.getStatusCode()).body(Map.of("error", exception.getReason()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> invalidDefinition(IllegalArgumentException exception) {
        return ResponseEntity.badRequest().body(Map.of("error", "INVALID_RULE"));
    }

    @ExceptionHandler(ObjectNotFoundException.class)
    public ResponseEntity<Map<String, String>> missingDefinition(ObjectNotFoundException exception) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "RULE_NOT_FOUND"));
    }

    @ExceptionHandler({ OptimisticLockException.class, OptimisticLockingFailureException.class,
            StaleStateException.class })
    public ResponseEntity<Map<String, String>> concurrentDefinition(RuntimeException exception) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "RULE_CONFLICT"));
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, String>> failedDefinition(RuntimeException exception) {
        // DAO adapters wrap Hibernate exceptions. Preserve the conflict status through
        // those wrappers without returning database messages to the client.
        java.util.Set<Throwable> seen = java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<>());
        for (Throwable cause = exception; cause != null && seen.add(cause); cause = cause.getCause()) {
            if (cause instanceof org.springframework.security.access.AccessDeniedException) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "FORBIDDEN"));
            }
            if (cause instanceof OptimisticLockException || cause instanceof OptimisticLockingFailureException
                    || cause instanceof StaleStateException) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "RULE_CONFLICT"));
            }
        }
        LoggerFactory.getLogger(getClass()).error("Rule configuration request failed", exception);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", "RULE_SAVE_FAILED"));
    }
}
