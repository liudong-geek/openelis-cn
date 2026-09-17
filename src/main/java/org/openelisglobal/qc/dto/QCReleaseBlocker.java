package org.openelisglobal.qc.dto;

import java.io.Serializable;
import java.sql.Timestamp;

/** Immutable release-gate evidence exposed with a result-review row. */
public record QCReleaseBlocker(String violationId, String ruleCode, String severity, String instrumentId,
        String testId, Timestamp violationDateTime, String resolutionStatus) implements Serializable {
}
