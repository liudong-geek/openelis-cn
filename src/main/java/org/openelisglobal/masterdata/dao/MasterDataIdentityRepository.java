package org.openelisglobal.masterdata.dao;

import java.sql.Date;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;

public interface MasterDataIdentityRepository {

    record Identity(Long id, String entityType, String entityId, String canonicalCode, String sourceSystem,
            Date validFrom, Date validTo, Integer updatedBy, Timestamp lastUpdated) {
    }

    record History(String canonicalCode, String sourceSystem, Date validFrom, Date validTo, Integer changedBy,
            Timestamp changedAt) {
    }

    List<Identity> findAll();

    Optional<Identity> find(String entityType, String entityId);

    Optional<Identity> findForUpdate(String entityType, String entityId);

    Identity insert(String entityType, String entityId, String canonicalCode, String sourceSystem, Date validFrom,
            Date validTo, int userId);

    Identity update(long id, String entityType, String entityId, String canonicalCode, String sourceSystem,
            Date validFrom, Date validTo, int userId, Timestamp expectedLastUpdated);

    List<History> history(long identityId);
}
