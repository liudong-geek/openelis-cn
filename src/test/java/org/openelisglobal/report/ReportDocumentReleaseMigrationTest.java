package org.openelisglobal.report;

import static org.junit.Assert.*;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.xml.XMLConstants;
import javax.xml.transform.stream.StreamSource;
import javax.xml.validation.SchemaFactory;
import org.junit.Test;

/**
 * Offline structural checks. PostgreSQL execution/rollback still requires an
 * isolated database.
 */
public class ReportDocumentReleaseMigrationTest {
    private static final Path MIGRATION = Path
            .of("src/main/resources/liquibase/3.5.x.x/085-report-document-release-scope.xml");

    @Test
    public void scopedReleaseMigrationValidatesAgainstBundledLiquibaseSchema() throws Exception {
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
    public void existingUnassignedReleasesRemainUnchangedAndKeepLegacyUniqueGuards() throws Exception {
        String sql = Files.readString(MIGRATION);
        assertFalse(sql.contains("<update"));
        assertFalse(sql.contains("<delete"));
        assertFalse(sql.contains("MARK_RAN"));
        assertTrue(sql.contains("report_document_id,report_version"));
        assertTrue(sql.contains("uq_patient_report_release_legacy_version"));
        assertTrue(sql.contains("uq_patient_report_release_legacy_number"));
        assertTrue(sql.contains("uq_patient_report_release_legacy_draft"));
        assertTrue(sql.contains("status = 'ISSUED' AND report_document_id IS NOT NULL"));
    }

    @Test
    public void rollbackRefusesToEraseDocumentBoundHistory() throws Exception {
        String sql = Files.readString(MIGRATION);
        String rollback = sql.substring(sql.indexOf("<rollback>"));
        assertTrue(rollback.contains("LOCK TABLE clinlims.patient_report_release IN ACCESS EXCLUSIVE MODE"));
        assertTrue(rollback.contains("WHERE report_document_id IS NOT NULL"));
        assertTrue(rollback.indexOf("RAISE EXCEPTION") < rollback.indexOf("DROP COLUMN"));
        assertFalse(rollback.contains("CASCADE"));
    }
}
