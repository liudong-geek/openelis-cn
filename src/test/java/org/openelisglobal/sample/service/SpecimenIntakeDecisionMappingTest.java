package org.openelisglobal.sample.service;

import static org.junit.Assert.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import javax.xml.parsers.DocumentBuilderFactory;
import org.hibernate.boot.Metadata;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistry;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.hibernate.engine.jdbc.connections.spi.ConnectionProvider;
import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.hibernate.jpa.event.spi.CallbackRegistry;
import org.hibernate.jpa.event.spi.CallbackType;
import org.hibernate.mapping.Column;
import org.hibernate.mapping.UniqueKey;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;
import org.openelisglobal.sample.valueholder.SpecimenIntakeDecision;
import org.w3c.dom.Element;

/**
 * Actual Hibernate bootstrap without any database; migration structure, not SQL
 * execution.
 */
public class SpecimenIntakeDecisionMappingTest {
    private static Metadata metadata;
    private static StandardServiceRegistry registry;
    private static SessionFactoryImplementor factory;
    private static final AtomicInteger connections = new AtomicInteger();

    @BeforeClass
    public static void boot() {
        registry = new StandardServiceRegistryBuilder()
                .applySetting("hibernate.dialect", "org.hibernate.dialect.PostgreSQLDialect")
                .applySetting("hibernate.temp.use_jdbc_metadata_defaults", false)
                .applySetting("hibernate.hbm2ddl.auto", "none")
                .applySetting("jakarta.persistence.schema-generation.database.action", "none")
                .applySetting("javax.persistence.schema-generation.database.action", "none")
                .applySetting("hibernate.cache.use_second_level_cache", false)
                .applySetting("hibernate.cache.use_query_cache", false).applySetting("hibernate.search.enabled", false)
                .addService(ConnectionProvider.class, new ConnectionProvider() {
                    public Connection getConnection() throws SQLException {
                        connections.incrementAndGet();
                        throw new SQLException("SIM: no DB permitted");
                    }

                    public void closeConnection(Connection c) {
                        fail("No connection exists");
                    }

                    public boolean supportsAggressiveRelease() {
                        return false;
                    }

                    public boolean isUnwrappableAs(Class type) {
                        return false;
                    }

                    public <T> T unwrap(Class<T> type) {
                        throw new UnsupportedOperationException();
                    }
                }).build();
        metadata = new MetadataSources(registry).addAnnotatedClass(SpecimenIntakeDecision.class).buildMetadata();
        factory = (SessionFactoryImplementor) metadata.buildSessionFactory();
    }

    @AfterClass
    public static void close() {
        if (factory != null) {
            factory.close();
        }
        if (registry != null) {
            StandardServiceRegistryBuilder.destroy(registry);
        }
        assertEquals(0, connections.get());
    }

    @Test
    public void buildsRealEntityWithOriginalVersionAndBoundedNumericAuditId() {
        var entity = metadata.getEntityBinding(SpecimenIntakeDecision.class.getName());
        assertEquals("specimen_intake_decision", entity.getTable().getName());
        assertEquals("clinlims", entity.getTable().getSchema());
        assertEquals(1, factory.getMetamodel().getEntities().size());
        assertEquals("lastupdated", entity.getVersion().getName());
        var column = (Column) entity.getIdentifier().getColumnIterator().next();
        assertEquals("id", column.getName());
        assertEquals(10, column.getPrecision());
        assertEquals(String.class, entity.getIdentifier().getType().getReturnedClass());
        assertTrue(factory.getMetamodel().entityPersister(SpecimenIntakeDecision.class)
                .getIdentifierGenerator() instanceof org.openelisglobal.hibernate.resources.StringSequenceGenerator);
    }

    @Test
    public void hasOneTubeAndOneOperationUniquenessAndNoCascades() {
        var entity = metadata.getEntityBinding(SpecimenIntakeDecision.class.getName());
        Set<Set<String>> unique = new HashSet<>();
        entity.getTable().getUniqueKeyIterator().forEachRemaining(key -> {
            var names = new HashSet<String>();
            ((UniqueKey) key).getColumnIterator().forEachRemaining(c -> names.add(((Column) c).getName()));
            unique.add(names);
        });
        assertEquals(Set.of(Set.of("operation_id"), Set.of("sample_item_id")), unique);
        entity.getPropertyIterator().forEachRemaining(value -> {
            var property = (org.hibernate.mapping.Property) value;
            if (!"lastupdated".equals(property.getName())) {
                assertFalse(property.getName(), property.isUpdateable());
            }
            assertFalse(property.getType().isAssociationType());
        });
    }

    @Test
    public void realHibernateCallbacksRefuseMutationAndValidateBeforeInsert() {
        CallbackRegistry callback = factory.getEventEngine().getCallbackRegistry();
        assertTrue(callback.hasRegisteredCallbacks(SpecimenIntakeDecision.class, CallbackType.PRE_PERSIST));
        assertTrue(callback.hasRegisteredCallbacks(SpecimenIntakeDecision.class, CallbackType.PRE_UPDATE));
        assertTrue(callback.hasRegisteredCallbacks(SpecimenIntakeDecision.class, CallbackType.PRE_REMOVE));
        var row = SpecimenIntakeDecisionTest.row("801", SpecimenIntakeDecision.Decision.ACCEPTED);
        callback.preCreate(row);
        assertThrows(IllegalStateException.class, () -> callback.preUpdate(row));
        assertThrows(IllegalStateException.class, () -> callback.preRemove(row));
    }

    @Test
    public void productionPersistenceAndChangelogRegisterExactlyOnce() throws Exception {
        String entity = "org.openelisglobal.sample.valueholder.SpecimenIntakeDecision";
        var persistence = xml("src/main/resources/persistence/persistence.xml");
        int found = 0;
        var classes = persistence.getElementsByTagNameNS("*", "class");
        for (int i = 0; i < classes.getLength(); i++) {
            if (entity.equals(classes.item(i).getTextContent())) {
                found++;
            }
        }
        assertEquals(1, found);
        var includes = xml("src/main/resources/liquibase/3.5.x.x/base.xml").getElementsByTagNameNS("*", "include");
        found = 0;
        for (int i = 0; i < includes.getLength(); i++) {
            if ("083-specimen-intake-decision.xml".equals(((Element) includes.item(i)).getAttribute("file"))) {
                found++;
            }
        }
        assertEquals(1, found);
    }

    @Test
    public void migrationPreservesEvidenceAndRestrictsExistingOwnerReferences() throws Exception {
        var doc = xml("src/main/resources/liquibase/3.5.x.x/083-specimen-intake-decision.xml");
        assertEquals(1, doc.getElementsByTagNameNS("*", "createTable").getLength());
        var sequence = (Element) doc.getElementsByTagNameNS("*", "createSequence").item(0);
        assertEquals("2147483647", sequence.getAttribute("maxValue"));
        var fks = doc.getElementsByTagNameNS("*", "addForeignKeyConstraint");
        assertEquals(5, fks.getLength());
        for (int i = 0; i < fks.getLength(); i++) {
            assertEquals("RESTRICT", ((Element) fks.item(i)).getAttribute("onDelete"));
            assertEquals("RESTRICT", ((Element) fks.item(i)).getAttribute("onUpdate"));
        }
        String sql = doc.getDocumentElement().getTextContent();
        assertTrue(sql.contains("BEFORE UPDATE OR DELETE"));
        assertTrue(sql.contains("BEFORE TRUNCATE"));
        assertTrue(sql.contains("reason_namespace IS NOT NULL"));
        assertTrue(sql.contains("keep_history IS DISTINCT FROM 'Y'"));
        assertTrue(sql.contains("nextval('clinlims.reference_tables_seq')"));
        assertTrue(doc.getElementsByTagNameNS("*", "rollback").item(0).getTextContent().contains("RAISE EXCEPTION"));
        assertEquals(0, doc.getElementsByTagNameNS("*", "update").getLength());
    }

    private static org.w3c.dom.Document xml(String file) throws Exception {
        var builder = DocumentBuilderFactory.newInstance();
        builder.setNamespaceAware(true);
        builder.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        builder.setFeature("http://xml.org/sax/features/external-general-entities", false);
        builder.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        try (var stream = Files
                .newInputStream(Path.of(System.getProperty("specimen.decision.sourceRoot", "."), file))) {
            return builder.newDocumentBuilder().parse(stream);
        }
    }
}
