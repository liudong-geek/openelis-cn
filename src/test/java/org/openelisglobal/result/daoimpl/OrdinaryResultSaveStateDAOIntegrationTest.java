package org.openelisglobal.result.daoimpl;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.sql.Timestamp;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.program.valueholder.cytology.CytologySample;
import org.openelisglobal.program.valueholder.immunohistochemistry.ImmunohistochemistrySample;
import org.openelisglobal.program.valueholder.pathology.PathologySample;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.ResultOwnerState;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.SpecialtyOwnerState;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.sample.valueholder.Sample;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * PostgreSQL coverage for the persisted-state queries used by result write
 * guards.
 */
public class OrdinaryResultSaveStateDAOIntegrationTest extends BaseWebContextSensitiveTest {

    private static final int PATHOLOGY_ID = 91001;
    private static final int CYTOLOGY_ID = 91002;
    private static final int IMMUNOHISTOCHEMISTRY_ID = 91003;

    @Autowired
    private OrdinaryResultSaveStateDAO states;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @PersistenceContext
    private EntityManager entityManager;

    @Test
    public void ordinaryOwnerAndVersionQueriesReadPersistedPostgreSqlStateWithoutFlushingTampering() throws Exception {
        executeDataSetWithStateManagement("testdata/logbook-db.xml");

        Boolean verified = new TransactionTemplate(transactionManager).execute(transaction -> {
            Result result = entityManager.find(Result.class, "3");
            Analysis analysis = entityManager.find(Analysis.class, "1");
            Analysis otherAnalysis = entityManager.find(Analysis.class, "2");
            assertNotNull(result);
            assertNotNull(analysis);
            assertNotNull(otherAnalysis);

            String persistedVersion = String.valueOf(analysis.getLastupdated().getTime());
            result.setAnalysis(otherAnalysis);
            analysis.setLastupdated(new Timestamp(analysis.getLastupdated().getTime() + 60_000));

            assertEquals(new ResultOwnerState("3", "1", "1", "601", "1"), states.findResultOwnerState("3"));
            assertEquals(persistedVersion, states.findAnalysisVersion("1"));
            assertNull(states.findResultOwnerState("999999"));
            assertNull(states.findAnalysisVersion("999999"));

            transaction.setRollbackOnly();
            return Boolean.TRUE;
        });

        assertTrue(Boolean.TRUE.equals(verified));
    }

    @Test
    public void allSpecialtyOwnerQueriesUseConcreteMappingsAndIgnoreUnflushedReassignment() throws Exception {
        executeDataSetWithStateManagement("testdata/ordinary-result-save-state-specialty.xml");

        Boolean verified = new TransactionTemplate(transactionManager).execute(transaction -> {
            PathologySample pathology = entityManager.find(PathologySample.class, PATHOLOGY_ID);
            CytologySample cytology = entityManager.find(CytologySample.class, CYTOLOGY_ID);
            ImmunohistochemistrySample immunohistochemistry = entityManager.find(ImmunohistochemistrySample.class,
                    IMMUNOHISTOCHEMISTRY_ID);
            Sample pathologyReplacement = entityManager.find(Sample.class, String.valueOf(CYTOLOGY_ID));
            Sample cytologyReplacement = entityManager.find(Sample.class, String.valueOf(PATHOLOGY_ID));
            assertNotNull(pathology);
            assertNotNull(cytology);
            assertNotNull(immunohistochemistry);
            assertNotNull(pathologyReplacement);
            assertNotNull(cytologyReplacement);

            pathology.setSample(pathologyReplacement);
            pathology.setStatus(PathologySample.PathologyStatus.GROSSING);
            cytology.setSample(cytologyReplacement);
            cytology.setStatus(CytologySample.CytologyStatus.SCREENING);
            immunohistochemistry.setSample(pathologyReplacement);
            immunohistochemistry.setStatus(ImmunohistochemistrySample.ImmunohistochemistryStatus.IN_PROGRESS);

            assertEquals(new SpecialtyOwnerState(PATHOLOGY_ID, "91001", "COMPLETED"),
                    states.findPathologyOwnerState(PATHOLOGY_ID));
            assertEquals(new SpecialtyOwnerState(CYTOLOGY_ID, "91002", "READY_FOR_CYTOPATHOLOGIST"),
                    states.findCytologyOwnerState(CYTOLOGY_ID));
            assertEquals(new SpecialtyOwnerState(IMMUNOHISTOCHEMISTRY_ID, "91003", "READY_PATHOLOGIST"),
                    states.findImmunohistochemistryOwnerState(IMMUNOHISTOCHEMISTRY_ID));
            assertNull(states.findPathologyOwnerState(91991));
            assertNull(states.findCytologyOwnerState(91992));
            assertNull(states.findImmunohistochemistryOwnerState(91993));

            transaction.setRollbackOnly();
            return Boolean.TRUE;
        });

        assertTrue(Boolean.TRUE.equals(verified));
    }
}
