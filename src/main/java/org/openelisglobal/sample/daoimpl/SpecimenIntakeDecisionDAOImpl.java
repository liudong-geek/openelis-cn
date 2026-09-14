package org.openelisglobal.sample.daoimpl;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.List;
import org.openelisglobal.sample.dao.SpecimenIntakeDecisionDAO;
import org.openelisglobal.sample.form.SpecimenIntakeEvidence;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Repository
@Transactional(propagation = Propagation.MANDATORY, readOnly = true)
public class SpecimenIntakeDecisionDAOImpl implements SpecimenIntakeDecisionDAO {
    @PersistenceContext
    private EntityManager entityManager;

    @Override
    public List<SpecimenIntakeDecision> findForTubes(List<String> sampleItemIds) {
        if (sampleItemIds == null || sampleItemIds.size() > 5000) {
            throw SpecimenIntakeEvidence.invalid();
        }
        sampleItemIds.forEach(SpecimenIntakeEvidence::requireId);
        if (sampleItemIds.isEmpty()) {
            return List.of();
        }
        // Query by real tube, not old sample ownership: moved evidence must be
        // reported as requiring review, never mistaken for a missing first decision.
        return entityManager.createQuery("FROM SpecimenIntakeDecision d WHERE d.sampleItemId IN :ids ORDER BY d.id",
                SpecimenIntakeDecision.class).setParameter("ids", sampleItemIds).getResultList();
    }
}
