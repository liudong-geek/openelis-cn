package org.openelisglobal.resultvalidation.dao;

import java.util.List;
import org.openelisglobal.result.valueholder.Result;

/** Persisted review evidence, read without flushing caller-prepared entities. */
public interface ReviewSaveStateDAO {
    record AnalysisState(String id, String testId, String itemId, String sampleId, String accession,
            String sectionId, String statusId, String version, boolean released, boolean printed) { }
    record Member(String id, String value, String type, String component, String parentId, int grouping,
            String version) { }
    AnalysisState analysis(String id);
    List<Result> lockResults(String analysisId);
    List<Member> members(String analysisId);
}
