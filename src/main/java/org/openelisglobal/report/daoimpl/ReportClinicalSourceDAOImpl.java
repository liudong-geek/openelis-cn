package org.openelisglobal.report.daoimpl;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.util.List;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.provider.valueholder.Provider;
import org.openelisglobal.report.dao.ReportClinicalSourceDAO;
import org.openelisglobal.report.form.ReportReleaseScope;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.samplehuman.valueholder.SampleHuman;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.sampleorganization.valueholder.SampleOrganization;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
@Transactional
public class ReportClinicalSourceDAOImpl implements ReportClinicalSourceDAO {
    @PersistenceContext
    private EntityManager entityManager;

    @Override
    public LockedSource loadAndLock(ReportReleaseScope scope) {
        // Parent document/release locks are acquired by the caller first. Application
        // and specimen locks also prevent new child members while content is captured.
        Sample sample = entityManager.find(Sample.class, scope.sampleId(), LockModeType.PESSIMISTIC_WRITE);
        if (sample == null)
            throw new IllegalStateException("Report application disappeared");
        refresh(sample, LockModeType.PESSIMISTIC_WRITE);
        List<SampleItem> specimens = entityManager
                .createQuery("FROM SampleItem s WHERE s.sample.id = :id ORDER BY s.id", SampleItem.class)
                .setParameter("id", scope.sampleId()).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
        for (SampleItem specimen : specimens) {
            refresh(specimen, LockModeType.PESSIMISTIC_WRITE);
            refresh(specimen.getTypeOfSample(), LockModeType.PESSIMISTIC_READ);
        }
        Patient patient = entityManager.find(Patient.class, scope.patientId(), LockModeType.PESSIMISTIC_READ);
        if (patient == null)
            throw new IllegalStateException("Report patient disappeared");
        refresh(patient, LockModeType.PESSIMISTIC_READ);
        refresh(patient.getPerson(), LockModeType.PESSIMISTIC_READ);
        for (SampleHuman human : entityManager
                .createQuery("FROM SampleHuman h WHERE h.sampleId = :id", SampleHuman.class)
                .setParameter("id", scope.sampleId()).setLockMode(LockModeType.PESSIMISTIC_READ).getResultList()) {
            refresh(human, LockModeType.PESSIMISTIC_READ);
            if (human.getProviderId() != null) {
                Provider provider = entityManager.find(Provider.class, human.getProviderId(),
                        LockModeType.PESSIMISTIC_READ);
                refresh(provider, LockModeType.PESSIMISTIC_READ);
                if (provider != null)
                    refresh(provider.getPerson(), LockModeType.PESSIMISTIC_READ);
            }
        }
        for (SampleOrganization organization : entityManager
                .createQuery("FROM SampleOrganization o WHERE o.sample.id = :id", SampleOrganization.class)
                .setParameter("id", scope.sampleId()).setLockMode(LockModeType.PESSIMISTIC_READ).getResultList()) {
            refresh(organization, LockModeType.PESSIMISTIC_READ);
            refresh(organization.getOrganization(), LockModeType.PESSIMISTIC_READ);
        }
        List<Analysis> analyses = entityManager
                .createQuery("FROM Analysis a WHERE a.id IN (:ids) ORDER BY a.id", Analysis.class)
                .setParameter("ids", scope.analysisIds()).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
        for (Analysis analysis : analyses) {
            refresh(analysis, LockModeType.PESSIMISTIC_WRITE);
            refresh(analysis.getTest(), LockModeType.PESSIMISTIC_READ);
            refresh(analysis.getTestSection(), LockModeType.PESSIMISTIC_READ);
        }
        List<Result> results = entityManager
                .createQuery("FROM Result r WHERE r.analysis.id IN (:ids) ORDER BY r.id", Result.class)
                .setParameter("ids", scope.analysisIds()).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
        for (Result result : results) {
            refresh(result, LockModeType.PESSIMISTIC_WRITE);
            refresh(result.getTestResult(), LockModeType.PESSIMISTIC_READ);
            refresh(result.getAnalyte(), LockModeType.PESSIMISTIC_READ);
        }
        return new LockedSource(patient, analyses, results);
    }

    private void refresh(Object entity, LockModeType lock) {
        if (entity != null)
            entityManager.refresh(entity, lock);
    }
}
