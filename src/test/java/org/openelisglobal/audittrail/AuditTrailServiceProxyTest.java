package org.openelisglobal.audittrail;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.lang.reflect.Method;
import java.sql.Timestamp;
import java.time.Instant;
import org.hibernate.proxy.HibernateProxy;
import org.hibernate.proxy.LazyInitializer;
import org.junit.Test;
import org.openelisglobal.audittrail.daoimpl.AuditTrailServiceImpl;
import org.openelisglobal.common.valueholder.BaseObject;
import org.openelisglobal.sampleitem.valueholder.SampleItem;

public class AuditTrailServiceProxyTest {

    @Test
    public void receiptAuditUsesPersistentSampleItemRatherThanProxyFields() throws Exception {
        SampleItem oldItem = new SampleItem();
        oldItem.setId("26");
        oldItem.setCollectionDate(Timestamp.from(Instant.parse("2026-09-26T03:21:00Z")));
        SampleItem updated = new SampleItem();
        updated.setId("26");
        updated.setCollectionDate(oldItem.getCollectionDate());
        updated.setReceivedDate(Timestamp.from(Instant.parse("2026-09-26T03:25:00Z")));

        LazyInitializer initializer = mock(LazyInitializer.class);
        when(initializer.getImplementation()).thenReturn(oldItem);
        Method changes = AuditTrailServiceImpl.class.getDeclaredMethod("getChanges", BaseObject.class,
                BaseObject.class, String.class);
        changes.setAccessible(true);
        String xml = (String) changes.invoke(new AuditTrailServiceImpl(), updated,
                new ProxySampleItem(initializer), "SAMPLE_ITEM");

        assertNotNull(xml);
        assertTrue(xml.contains("<receivedDate></receivedDate>"));
        assertFalse(xml.contains("hibernate_interceptor"));
    }

    private static final class ProxySampleItem extends SampleItem implements HibernateProxy {
        private static final long serialVersionUID = 1L;
        @SuppressWarnings("unused")
        private final Object $$_hibernate_interceptor = new Object();
        private final LazyInitializer initializer;

        private ProxySampleItem(LazyInitializer initializer) {
            this.initializer = initializer;
        }

        @Override
        public LazyInitializer getHibernateLazyInitializer() {
            return initializer;
        }

        @Override
        public Object writeReplace() {
            return this;
        }
    }
}
