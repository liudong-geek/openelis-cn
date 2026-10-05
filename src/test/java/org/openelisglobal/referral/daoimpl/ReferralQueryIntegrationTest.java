package org.openelisglobal.referral.daoimpl;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.sql.Timestamp;
import java.util.List;
import java.util.stream.Collectors;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.referral.dao.ReferralDAO;
import org.openelisglobal.referral.form.ReferredOutTestsForm.ReferDateType;
import org.openelisglobal.referral.valueholder.Referral;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Real HQL and timestamp coverage on BaseTestConfig's disposable PostgreSQL.
 */
public class ReferralQueryIntegrationTest extends BaseWebContextSensitiveTest {
    @Autowired
    private ReferralDAO referrals;
    @Autowired
    private PlatformTransactionManager transactions;
    @PersistenceContext
    private EntityManager entityManager;

    @Before
    public void loadReferralFixture() throws Exception {
        executeDataSetWithStateManagement("testdata/referral.xml");
    }

    @Test
    public void sentDatesIncludeSecondsAndMicrosecondsAndExcludeNextMidnight() {
        verifyDatabaseBoundaries(ReferDateType.SENT);
    }

    @Test
    public void resultDatesIncludeSecondsAndMicrosecondsAndExcludeNextMidnight() {
        verifyDatabaseBoundaries(ReferDateType.RESULT);
    }

    private void verifyDatabaseBoundaries(ReferDateType type) {
        Boolean verified = new TransactionTemplate(transactions).execute(transaction -> {
            setDate("1", type, "2026-10-05 23:59:30");
            setDate("2", type, "2026-10-05 23:59:59.999999");
            entityManager.flush();
            entityManager.clear();
            var start = Timestamp.valueOf("2026-10-05 00:00:00");
            var nextDay = Timestamp.valueOf("2026-10-06 00:00:00");

            assertEquals(List.of("1", "2"), ids(referrals.getReferralsByTestAndDate(type, start, nextDay, null, null)));
            assertEquals(List.of("1"),
                    ids(referrals.getReferralsByTestAndDate(type, start, nextDay, List.of("1"), List.of("1"))));
            assertTrue(referrals.getReferralsByTestAndDate(type, start, nextDay, List.of("1"), List.of("2")).isEmpty());

            setDate("2", type, "2026-10-06 00:00:00");
            entityManager.flush();
            entityManager.clear();
            assertEquals(List.of("1"), ids(referrals.getReferralsByTestAndDate(type, start, nextDay, null, null)));

            setDate("1", type, "2026-10-05 00:00:00");
            setDate("2", type, "2026-10-04 23:59:59.999999");
            entityManager.flush();
            entityManager.clear();
            assertEquals(List.of("1"), ids(referrals.getReferralsByTestAndDate(type, start, nextDay, null, null)));
            transaction.setRollbackOnly();
            return true;
        });
        assertTrue(Boolean.TRUE.equals(verified));
    }

    private void setDate(String id, ReferDateType type, String timestamp) {
        Referral referral = entityManager.find(Referral.class, id);
        assertNotNull(referral);
        if (type == ReferDateType.SENT) {
            referral.setSentDate(Timestamp.valueOf(timestamp));
        } else {
            referral.getAnalysis().setCompletedDate(Timestamp.valueOf(timestamp));
        }
    }

    private List<String> ids(List<Referral> rows) {
        return rows.stream().map(Referral::getId).sorted().collect(Collectors.toList());
    }
}
