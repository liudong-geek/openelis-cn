package org.openelisglobal.report.dao;

import java.util.List;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.report.form.ReportReleaseScope;
import org.openelisglobal.result.valueholder.Result;

public interface ReportClinicalSourceDAO {
    record LockedSource(Patient patient, List<Analysis> analyses, List<Result> results) {
    }

    LockedSource loadAndLock(ReportReleaseScope scope);
}
