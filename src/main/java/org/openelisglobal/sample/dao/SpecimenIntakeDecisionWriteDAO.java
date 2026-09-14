package org.openelisglobal.sample.dao;

import java.util.List;
import org.openelisglobal.dictionary.valueholder.Dictionary;
import org.openelisglobal.dictionarycategory.valueholder.DictionaryCategory;
import org.openelisglobal.referencetables.valueholder.ReferenceTables;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.test.valueholder.Test;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;

/**
 * Narrow insert-only contract; does not expose generic replacement/deletion.
 */
public interface SpecimenIntakeDecisionWriteDAO {
    List<SpecimenIntakeDecision> lockClaims(String operationId, String sampleItemId);

    TypeOfSample lockType(String id);

    List<Test> lockTests(List<String> ids);

    Dictionary lockReason(String id);

    DictionaryCategory lockReasonCategory(String id);

    List<org.openelisglobal.statusofsample.valueholder.StatusOfSample> lockRejectedStatuses();

    List<ReferenceTables> lockAuditReferences();

    List<ReferenceTables> auditReferences();

    SpecimenIntakeDecision insert(SpecimenIntakeDecision value);

    SampleItem currentItem(String id);

    void requireManaged(List<?> entities);
}
