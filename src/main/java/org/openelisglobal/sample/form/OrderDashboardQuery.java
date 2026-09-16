package org.openelisglobal.sample.form;

/** Untrusted HTTP query values. Validation belongs to the dashboard service. */
public record OrderDashboardQuery(int page, int pageSize, String search, String status, String specimenIntakeStatus,
        String priority, boolean includeExternal, String startDate, String endDate) {
}
