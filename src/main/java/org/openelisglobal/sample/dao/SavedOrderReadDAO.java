package org.openelisglobal.sample.dao;

import java.util.List;
import java.util.Optional;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.provider.valueholder.Provider;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampletyperequest.valueholder.SampleTypeRequest;

/**
 * One saved order, including both physical specimens and uncollected requests.
 */
public interface SavedOrderReadDAO {
    record Graph(Sample sample, List<SampleItem> items, List<Analysis> analyses, List<SampleTypeRequest> requests,
            List<Patient> patients, List<Provider> providers) {
    }

    Optional<Graph> loadExact(String labNumber);

    /**
     * Detach only the dedicated read transaction before current authorization is
     * re-read.
     */
    void refreshReadContext();
}
