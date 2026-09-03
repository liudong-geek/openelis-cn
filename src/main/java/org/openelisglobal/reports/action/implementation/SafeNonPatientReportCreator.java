package org.openelisglobal.reports.action.implementation;

/**
 * Explicit capability for reports proven to contain neither patient-level data
 * nor laboratory results. Unclassified creators are denied by ReportPrint until
 * they receive either this capability or a result-scoped authorization strategy.
 */
public interface SafeNonPatientReportCreator extends IReportCreator {
}
