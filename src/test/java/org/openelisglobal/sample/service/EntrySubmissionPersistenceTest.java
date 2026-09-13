package org.openelisglobal.sample.service;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import jakarta.persistence.EntityManager;
import java.nio.file.Path;
import javax.xml.parsers.DocumentBuilderFactory;
import org.hibernate.cfg.Configuration;
import org.junit.Test;
import org.openelisglobal.sample.dao.EntrySubmissionReceiptDAO;
import org.openelisglobal.sample.valueholder.EntrySubmissionReceipt;
import org.springframework.test.util.ReflectionTestUtils;
import org.w3c.dom.Element;

/** No database: mapping bootstrap, DAO call ordering and migration structure only. */
public class EntrySubmissionPersistenceTest {
    private EntrySubmissionReceipt receipt() {
        return EntrySubmissionReceipt.claim("f3cdcd87-a1ef-4e67-b297-b26af08a36fc", "7",
                EntrySubmissionCommand.fingerprint(new byte[] {1, 2}));
    }

    @Test public void entityAndInheritedVersionBuildRealSessionFactoryWithoutDatabase() {
        var configuration = new Configuration().addAnnotatedClass(EntrySubmissionReceipt.class);
        configuration.setProperty("hibernate.dialect", "org.hibernate.dialect.PostgreSQLDialect");
        configuration.setProperty("hibernate.temp.use_jdbc_metadata_defaults", "false");
        configuration.setProperty("hibernate.connection.provider_class",
                "org.hibernate.engine.jdbc.connections.internal.UserSuppliedConnectionProviderImpl");
        try (var factory = configuration.buildSessionFactory()) {
            var mapping = ((org.hibernate.engine.spi.SessionFactoryImplementor) factory).getMetamodel()
                    .entityPersister(EntrySubmissionReceipt.class);
            assertTrue(mapping.isVersioned());
            assertEquals("lastupdated", mapping.getPropertyNames()[mapping.getVersionProperty()]);
            assertEquals("id", mapping.getIdentifierPropertyName());
        }
    }

    @Test public void daoClaimMustPersistThenFlushAndCompletionMustBeManaged() {
        var entityManager = mock(EntityManager.class); var dao = new EntrySubmissionReceiptDAO();
        ReflectionTestUtils.setField(dao, "entityManager", entityManager);
        var receipt = receipt(); dao.claim(receipt);
        assertEquals(0, receipt.getCreatedAt().getNano() % 1_000_000);
        var calls = inOrder(entityManager); calls.verify(entityManager).persist(receipt); calls.verify(entityManager).flush();
        assertThrows(IllegalStateException.class, () -> dao.complete(receipt, "SIM-snapshot"));
        when(entityManager.contains(receipt)).thenReturn(true); dao.complete(receipt, "SIM-snapshot");
        assertEquals("SIM-snapshot", receipt.getResponseJson()); verify(entityManager, times(2)).flush();
        assertThrows(IllegalStateException.class, () -> dao.complete(receipt, "SIM-replaced"));
        assertEquals("SIM-snapshot", receipt.getResponseJson());
    }

    @Test public void daoClaimFlushFailureEscapesWithoutRecoveryRead() {
        var entityManager = mock(EntityManager.class); var dao = new EntrySubmissionReceiptDAO();
        ReflectionTestUtils.setField(dao, "entityManager", entityManager);
        doThrow(new IllegalStateException("SIM unique conflict")).when(entityManager).flush();
        assertThrows(IllegalStateException.class, () -> dao.claim(receipt()));
        verify(entityManager, never()).find(any(), any());
    }

    @Test public void migrationUsesUniqueKeyVersionAndDeclaredRollback() throws Exception {
        var factory = DocumentBuilderFactory.newInstance(); factory.setNamespaceAware(true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        var document = factory.newDocumentBuilder().parse(Path.of(System.getProperty("lis.receipt.migration",
                "src/main/resources/liquibase/3.5.x.x/081-entry-submission-receipt.xml")).toFile());
        var tables = document.getElementsByTagNameNS("*", "createTable"); assertEquals(1, tables.getLength());
        var table = (Element) tables.item(0);
        assertEquals("clinlims", table.getAttribute("schemaName"));
        assertEquals("entry_submission_receipt", table.getAttribute("tableName"));
        var columns = table.getElementsByTagNameNS("*", "column");
        var byName = new java.util.HashMap<String, Element>();
        for (int index = 0; index < columns.getLength(); index++) {
            var column = (Element) columns.item(index); assertNull(byName.put(column.getAttribute("name"), column));
        }
        assertEquals(7, byName.size()); assertEquals("varchar(36)", byName.get("submission_id").getAttribute("type"));
        var key = (Element) byName.get("submission_id").getElementsByTagNameNS("*", "constraints").item(0);
        assertEquals("true", key.getAttribute("primaryKey")); assertEquals("false", key.getAttribute("nullable"));
        assertEquals("timestamp", byName.get("last_updated").getAttribute("type"));
        assertEquals("text", byName.get("response_json").getAttribute("type"));
        assertEquals(1, document.getElementsByTagNameNS("*", "rollback").getLength());
        assertEquals(1, document.getElementsByTagNameNS("*", "dropTable").getLength());
    }
}
