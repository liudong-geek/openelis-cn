package org.openelisglobal.masterdata.service;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import org.openelisglobal.masterdata.dao.MasterDataIdentityRepository.History;
import org.openelisglobal.masterdata.form.MasterDataIdentityForm;

public interface MasterDataIdentityService {

    record Item(String entityType, String entityId, String name, String nativeCode, boolean nativeActive,
            String canonicalCode, String sourceSystem, LocalDate validFrom, LocalDate validTo,
            OffsetDateTime lastUpdated, String status, List<String> issues) {
    }

    record Summary(int total, int registered, int missingCode, int inactive, int notYetValid, int expired) {
    }

    record Listing(List<Item> items, Summary summary, Map<String, String> entityTypes) {
    }

    Listing list(String entityType, String query);

    Item save(String entityType, String entityId, MasterDataIdentityForm form, int userId);

    List<History> history(String entityType, String entityId);
}
