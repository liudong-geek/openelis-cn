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
import org.hibernate.jpa.event.spi.CallbackType;
import org.hibernate.mapping.Column;
import org.hibernate.mapping.UniqueKey;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;
import org.openelisglobal.sample.valueholder.SpecimenRecollection;
import org.w3c.dom.Element;

public class SpecimenRecollectionMappingTest {
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
                .applySetting("hibernate.cache.use_second_level_cache", false)
                .applySetting("hibernate.search.enabled", false)
                .addService(ConnectionProvider.class, new ConnectionProvider() {
                    public Connection getConnection() throws SQLException {
                        connections.incrementAndGet();
                        throw new SQLException("SIM: no database permitted");
                    }

                    public void closeConnection(Connection connection) {
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
        metadata = new MetadataSources(registry).addAnnotatedClass(SpecimenRecollection.class).buildMetadata();
        factory = (SessionFactoryImplementor) metadata.buildSessionFactory();
    }

    @AfterClass
    public static void close() {
        if (factory != null)
            factory.close();
        if (registry != null)
            StandardServiceRegistryBuilder.destroy(registry);
        assertEquals(0, connections.get());
    }

    @Test
    public void mapsImmutableAppendOnlyRelationWithThreeUniqueClaims() {
        var entity = metadata.getEntityBinding(SpecimenRecollection.class.getName());
        assertEquals("specimen_recollection", entity.getTable().getName());
        assertEquals("clinlims", entity.getTable().getSchema());
        assertEquals("lastupdated", entity.getVersion().getName());
        Set<Set<String>> unique = new HashSet<>();
        entity.getTable().getUniqueKeyIterator().forEachRemaining(key -> {
            var names = new HashSet<String>();
            ((UniqueKey) key).getColumnIterator().forEachRemaining(column -> names.add(((Column) column).getName()));
            unique.add(names);
        });
        assertEquals(Set.of(Set.of("operation_id"), Set.of("source_sample_item_id"), Set.of("request_id")), unique);
        entity.getPropertyIterator().forEachRemaining(value -> {
            var property = (org.hibernate.mapping.Property) value;
            if (!"lastupdated".equals(property.getName()))
                assertFalse(property.getName(), property.isUpdateable());
            assertFalse(property.getType().isAssociationType());
        });
        var callbacks = factory.getEventEngine().getCallbackRegistry();
        assertTrue(callbacks.hasRegisteredCallbacks(SpecimenRecollection.class, CallbackType.PRE_PERSIST));
        assertTrue(callbacks.hasRegisteredCallbacks(SpecimenRecollection.class, CallbackType.PRE_UPDATE));
        assertTrue(callbacks.hasRegisteredCallbacks(SpecimenRecollection.class, CallbackType.PRE_REMOVE));
    }

    @Test
    public void persistenceAndMigrationAreRegisteredExactlyOnce() throws Exception {
        String name = "org.openelisglobal.sample.valueholder.SpecimenRecollection";
        var persistence = xml("src/main/resources/persistence/persistence.xml");
        int found = 0;
        var classes = persistence.getElementsByTagNameNS("*", "class");
        for (int i = 0; i < classes.getLength(); i++)
            if (name.equals(classes.item(i).getTextContent()))
                found++;
        assertEquals(1, found);
        var includes = xml("src/main/resources/liquibase/3.5.x.x/base.xml").getElementsByTagNameNS("*", "include");
        found = 0;
        for (int i = 0; i < includes.getLength(); i++) {
            if ("088-specimen-recollection.xml".equals(((Element) includes.item(i)).getAttribute("file")))
                found++;
        }
        assertEquals(1, found);
    }

    @Test
    public void migrationKeepsOldTubeAndDecisionAndBlocksMutation() throws Exception {
        var document = xml("src/main/resources/liquibase/3.5.x.x/088-specimen-recollection.xml");
        assertEquals(1, document.getElementsByTagNameNS("*", "createTable").getLength());
        assertEquals(7, document.getElementsByTagNameNS("*", "addForeignKeyConstraint").getLength());
        var foreignKeys = document.getElementsByTagNameNS("*", "addForeignKeyConstraint");
        for (int i = 0; i < foreignKeys.getLength(); i++) {
            assertEquals("RESTRICT", ((Element) foreignKeys.item(i)).getAttribute("onDelete"));
            assertEquals("RESTRICT", ((Element) foreignKeys.item(i)).getAttribute("onUpdate"));
        }
        String sql = document.getDocumentElement().getTextContent();
        assertTrue(sql.contains("BEFORE UPDATE OR DELETE"));
        assertTrue(sql.contains("BEFORE TRUNCATE"));
        assertTrue(sql.contains("request_id <> source_request_id"));
        assertTrue(sql.contains("keep_history IS DISTINCT FROM 'Y'"));
        assertTrue(
                document.getElementsByTagNameNS("*", "rollback").item(0).getTextContent().contains("RAISE EXCEPTION"));
        assertEquals(0, document.getElementsByTagNameNS("*", "update").getLength());
    }

    private static org.w3c.dom.Document xml(String file) throws Exception {
        var builder = DocumentBuilderFactory.newInstance();
        builder.setNamespaceAware(true);
        builder.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        builder.setFeature("http://xml.org/sax/features/external-general-entities", false);
        builder.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        try (var input = Files.newInputStream(Path.of(file))) {
            return builder.newDocumentBuilder().parse(input);
        }
    }
}
