package org.openelisglobal.esig;

import static org.junit.Assert.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.junit.Test;
import org.openelisglobal.esig.valueholder.ElectronicSignature;

public class ReviewSignatureEvidenceTest {
    @Test
    public void genericSignatureJsonDoesNotExposeClinicalSnapshot() throws Exception {
        ElectronicSignature signature = new ElectronicSignature();
        signature.setSignedContent("SIM private clinical evidence");
        signature.setContentSha256("SIM-content-hash");
        var json = new ObjectMapper().valueToTree(signature);
        assertFalse(json.has("signedContent"));
        assertEquals("SIM-content-hash", json.get("contentSha256").asText());
    }

    @Test
    public void snapshotMappingBuildsRealHibernateFactoryWithoutDatabase() {
        var registry = new StandardServiceRegistryBuilder()
                .applySetting("hibernate.dialect", "org.hibernate.dialect.PostgreSQLDialect")
                .applySetting("hibernate.temp.use_jdbc_metadata_defaults", "false")
                .applySetting("hibernate.hbm2ddl.auto", "none").applySetting("hibernate.search.enabled", "false")
                .applySetting("hibernate.connection.provider_class",
                        "org.hibernate.engine.jdbc.connections.internal.UserSuppliedConnectionProviderImpl")
                .build();
        try {
            var metadata = new MetadataSources(registry).addAnnotatedClass(ElectronicSignature.class).buildMetadata();
            assertNotNull(metadata.getEntityBinding(ElectronicSignature.class.getName()).getProperty("signedContent"));
            assertNotNull(metadata.getEntityBinding(ElectronicSignature.class.getName()).getProperty("contentSha256"));
            try (var factory = metadata.buildSessionFactory()) {
                assertTrue(factory.isOpen());
            }
        } finally {
            StandardServiceRegistryBuilder.destroy(registry);
        }
    }
}
