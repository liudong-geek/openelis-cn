package org.openelisglobal.dataexchange.order.daoimpl;

import static org.junit.Assert.*;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.sql.Timestamp;
import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.dataexchange.order.dao.ElectronicOrderDAO;
import org.openelisglobal.dataexchange.order.valueholder.ElectronicOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

public class ElectronicOrderQueryIntegrationTest extends BaseWebContextSensitiveTest {
    @Autowired
    private ElectronicOrderDAO orders;
    @Autowired
    private PlatformTransactionManager transactions;
    @PersistenceContext
    private EntityManager em;

    @Before
    public void load() throws Exception {
        executeDataSetWithStateManagement("testdata/electronic-order.xml");
    }

    private List<String> ids(List<ElectronicOrder> list) {
        return list.stream().map(ElectronicOrder::getId).sorted().toList();
    }

    @Test
    public void realHqlCoversLastSecondMicrosecondsAndNextMidnight() {
        new TransactionTemplate(transactions).execute(tx -> {
            em.find(ElectronicOrder.class, "1").setOrderTimestamp(Timestamp.valueOf("2026-10-05 23:59:30"));
            em.find(ElectronicOrder.class, "2").setOrderTimestamp(Timestamp.valueOf("2026-10-05 23:59:59.999999"));
            em.find(ElectronicOrder.class, "3").setOrderTimestamp(Timestamp.valueOf("2026-10-06 00:00:00"));
            em.flush();
            em.clear();
            assertEquals(List.of("1", "2"),
                    ids(orders.searchElectronicOrderQuery(Timestamp.valueOf("2026-10-05 00:00:00"),
                            Timestamp.valueOf("2026-10-06 00:00:00"), "1", null, null)));
            assertEquals(List.of("2"), ids(orders.searchElectronicOrderQuery(Timestamp.valueOf("2026-10-05 00:00:00"),
                    Timestamp.valueOf("2026-10-06 00:00:00"), "1", List.of("ext654321"), "ext654321")));
            tx.setRollbackOnly();
            return null;
        });
    }

    @Test
    public void exactLocalKeywordCombinesStatusAndDatesAndAllowsMissingPatient() {
        new TransactionTemplate(transactions).execute(tx -> {
            var e = em.find(ElectronicOrder.class, "1");
            e.setPatient(null);
            em.flush();
            em.clear();
            assertEquals(List.of("1"),
                    ids(orders.searchElectronicOrderQuery(null, null, "1", List.of("ext123456"), "ext123456")));
            assertTrue(orders.searchElectronicOrderQuery(null, null, "3", List.of("ext123456"), "ext123456").isEmpty());
            assertEquals(List.of("3"),
                    ids(orders.searchElectronicOrderQuery(null, null, null, List.of("unused"), "faith")));
            assertEquals(List.of("1", "2", "3"), ids(orders.searchElectronicOrderQuery(null, null, null, null, null)));
            tx.setRollbackOnly();
            return null;
        });
    }
}
