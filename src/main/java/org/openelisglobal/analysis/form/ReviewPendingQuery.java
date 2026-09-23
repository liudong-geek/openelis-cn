package org.openelisglobal.analysis.form;

import java.sql.Date;

/**
 * Server-owned criteria. Null fields mean no filter; never carries an actor id.
 */
public record ReviewPendingQuery(String sectionId, String accessionLowerBound, String exactSampleId, Date startedOn) {
    public static ReviewPendingQuery all() {
        return new ReviewPendingQuery(null, null, null, null);
    }
}
