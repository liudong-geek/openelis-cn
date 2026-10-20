package org.openelisglobal.analyzer.service;

import java.util.Map;
import org.openelisglobal.analyzerresults.valueholder.AnalyzerResults;

/**
 * Durable processing of one instrument QC original. Creation is not QC release.
 */
public interface QCStagingService {
    String stage(AnalyzerResults original, String userId);

    QCProcessingResult process(String id, String userId);

    QCProcessingResult readOutcome(String id);

    QCProcessingResult markUnknown(String id, String userId);

    Map<String, Object> list(String status, int limit, int offset);

    Map<String, Object> get(String id);
}
