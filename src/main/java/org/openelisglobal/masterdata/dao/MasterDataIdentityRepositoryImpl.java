package org.openelisglobal.masterdata.dao;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import javax.sql.DataSource;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class MasterDataIdentityRepositoryImpl implements MasterDataIdentityRepository {

    private static final Map<String, String> REFERENCE_COLUMNS = Map.of("TEST", "test_id", "SAMPLE_TYPE",
            "sample_type_id", "ORGANIZATION", "organization_id", "PROVIDER", "provider_id");
    private static final String SELECT = """
            SELECT id, entity_type,
                   COALESCE(test_id, sample_type_id, organization_id, provider_id)::text AS entity_id,
                   canonical_code, source_system, valid_from, valid_to, updated_by, last_updated
              FROM clinlims.master_data_identity
            """;

    private final JdbcTemplate jdbc;

    public MasterDataIdentityRepositoryImpl(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    @Override
    public List<Identity> findAll() {
        return jdbc.query(SELECT + " ORDER BY entity_type, canonical_code, id", this::mapIdentity);
    }

    @Override
    public Optional<Identity> find(String entityType, String entityId) {
        List<Identity> rows = jdbc.query(SELECT + " WHERE entity_type = ? AND " + referenceColumn(entityType) + " = ?",
                this::mapIdentity, entityType, Long.valueOf(entityId));
        return rows.stream().findFirst();
    }

    @Override
    public Optional<Identity> findForUpdate(String entityType, String entityId) {
        List<Identity> rows = jdbc.query(
                SELECT + " WHERE entity_type = ? AND " + referenceColumn(entityType) + " = ? FOR UPDATE",
                this::mapIdentity, entityType, Long.valueOf(entityId));
        return rows.stream().findFirst();
    }

    @Override
    public Identity insert(String entityType, String entityId, String canonicalCode, String sourceSystem,
            Date validFrom, Date validTo, int userId) {
        jdbc.update("INSERT INTO clinlims.master_data_identity (entity_type, " + referenceColumn(entityType)
                + ", canonical_code, source_system, valid_from, valid_to, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                entityType, Long.valueOf(entityId), canonicalCode, sourceSystem, validFrom, validTo, userId, userId);
        return find(entityType, entityId).orElseThrow();
    }

    @Override
    public Identity update(long id, String entityType, String entityId, String canonicalCode, String sourceSystem,
            Date validFrom, Date validTo, int userId, Timestamp expectedLastUpdated) {
        int changed = jdbc.update(
                "UPDATE clinlims.master_data_identity SET canonical_code = ?, source_system = ?, valid_from = ?, valid_to = ?, updated_by = ? WHERE id = ? AND last_updated = ?",
                canonicalCode, sourceSystem, validFrom, validTo, userId, id, expectedLastUpdated);
        if (changed != 1) {
            throw new OptimisticLockingFailureException("Master data identity changed since it was loaded");
        }
        return find(entityType, entityId).orElseThrow();
    }

    @Override
    public List<History> history(long identityId) {
        return jdbc.query(
                "SELECT canonical_code, source_system, valid_from, valid_to, changed_by, changed_at FROM clinlims.master_data_identity_history WHERE identity_id = ? ORDER BY changed_at DESC, id DESC",
                (rs, rowNum) -> new History(rs.getString("canonical_code"), rs.getString("source_system"),
                        rs.getDate("valid_from"), rs.getDate("valid_to"), rs.getInt("changed_by"),
                        rs.getTimestamp("changed_at")),
                identityId);
    }

    private String referenceColumn(String entityType) {
        String column = REFERENCE_COLUMNS.get(entityType);
        if (column == null) {
            throw new IllegalArgumentException("Unsupported master data type: " + entityType);
        }
        return column;
    }

    private Identity mapIdentity(ResultSet rs, int rowNum) throws SQLException {
        return new Identity(rs.getLong("id"), rs.getString("entity_type"), rs.getString("entity_id"),
                rs.getString("canonical_code"), rs.getString("source_system"), rs.getDate("valid_from"),
                rs.getDate("valid_to"), rs.getInt("updated_by"), rs.getTimestamp("last_updated"));
    }
}
