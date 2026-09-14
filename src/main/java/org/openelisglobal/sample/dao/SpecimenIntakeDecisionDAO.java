package org.openelisglobal.sample.dao;

import java.util.List;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision;

/** Deliberately read-only: no inherited generic save, update, or delete API. */
public interface SpecimenIntakeDecisionDAO {
    List<SpecimenIntakeDecision> findForTubes(List<String> sampleItemIds);
}
