package org.openelisglobal.report;

import static org.junit.Assert.*;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.xml.XMLConstants;
import javax.xml.transform.stream.StreamSource;
import javax.xml.validation.SchemaFactory;
import org.junit.Test;

/** Offline structure validation, not PostgreSQL migration execution. */
public class ReportFrozenContentMigrationTest {
    private static final Path MIGRATION = Path.of("src/main/resources/liquibase/3.5.x.x/087-report-frozen-content.xml");

    @Test
    public void migrationConformsToBundledLiquibaseSchemaWithoutNetwork() throws Exception {
        SchemaFactory factory = SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI);
        factory.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        try (InputStream xsd = getClass().getClassLoader()
                .getResourceAsStream("www.liquibase.org/xml/ns/dbchangelog/dbchangelog-3.8.xsd")) {
            assertNotNull(xsd);
            factory.newSchema(new StreamSource(xsd)).newValidator().validate(new StreamSource(MIGRATION.toFile()));
        }
    }

    @Test
    public void migrationNeverBackfillsHistoricalMembershipAndRunsAfterDocumentScope() throws Exception {
        String sql = Files.readString(MIGRATION);
        assertFalse(sql.contains("<update"));
        assertFalse(sql.contains("<delete"));
        assertFalse(sql.contains("MARK_RAN"));
        assertTrue(sql.contains("frozen_content_json IS NULL AND frozen_content_sha256 IS NULL AND frozen_at IS NULL"));
        assertTrue(sql.contains("member_scope_json IS NOT NULL"));
        String base = Files.readString(Path.of("src/main/resources/liquibase/3.5.x.x/base.xml"));
        assertTrue(base.indexOf("086-report-release-member-scope.xml") < base.indexOf("087-report-frozen-content.xml"));
    }

    @Test
    public void rollbackCannotDropStoredMembershipEvidence() throws Exception {
        String sql = Files.readString(MIGRATION);
        String rollback = sql.substring(sql.indexOf("<rollback>"));
        assertTrue(rollback.contains(
                "LOCK TABLE clinlims.report_document, clinlims.patient_report_release IN ACCESS EXCLUSIVE MODE"));
        assertTrue(rollback.contains("group_rules_json IS NOT NULL OR group_rules_sha256 IS NOT NULL"));
        assertTrue(rollback.indexOf("RAISE EXCEPTION") < rollback.indexOf("DROP COLUMN"));
        assertFalse(rollback.contains("CASCADE"));
    }
}
