package org.openelisglobal.common.management.service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import org.openelisglobal.audittrail.dao.AuditTrailService;
import org.openelisglobal.common.domain.Domain;
import org.openelisglobal.common.management.form.SampleTypeBasicInfoForm;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.common.services.DisplayListService.ListType;
import org.openelisglobal.localization.service.LocalizationService;
import org.openelisglobal.localization.service.LocalizationValueService;
import org.openelisglobal.localization.valueholder.Localization;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class SampleTypeManagementServiceImpl implements SampleTypeManagementService {
    private final TypeOfSampleService types;
    private final TestService tests;
    private final DisplayListService display;
    private final AuditTrailService audit;
    private final LocalizationService localizations;
    private final LocalizationValueService translations;

    public SampleTypeManagementServiceImpl(TypeOfSampleService types, TestService tests, DisplayListService display,
            AuditTrailService audit, LocalizationService localizations, LocalizationValueService translations) {
        this.types = types;
        this.tests = tests;
        this.display = display;
        this.audit = audit;
        this.localizations = localizations;
        this.translations = translations;
    }

    @Override
    @Transactional(readOnly = true)
    public SampleTypeBasicInfoForm read(String id) {
        return snapshot(requiredType(id));
    }

    @Override
    @Transactional
    public SampleTypeBasicInfoForm save(String id, SampleTypeBasicInfoForm form, String actor) {
        TypeOfSample type = requiredType(id);
        if (form == null || actor == null || actor.isBlank() || form.getNameZh() != null && form.getNameZh().isBlank())
            throw new IllegalArgumentException("Invalid sample type update");
        checkLength(form.getDescription(), 40);
        checkLength(form.getAbbreviation(), 10);
        checkLength(form.getWhonetCode(), 5);
        String domain = form.getDomain() == null ? null : Domain.normalize(form.getDomain());
        SampleTypeBasicInfoForm before = snapshot(type);
        Localization name = type.getLocalization();
        Map<String, String> beforeNames = name == null ? new LinkedHashMap<>() : name.getValuesAsMap();
        if (form.getDescription() != null && !form.getDescription().trim().isEmpty())
            type.setDescription(form.getDescription().trim());
        if (form.getDomain() != null && !form.getDomain().equals(Domain.normalize(type.getDomain())))
            type.setDomain(domain);
        if (form.getAbbreviation() != null)
            type.setLocalAbbreviation(form.getAbbreviation().trim());
        if (form.getWhonetCode() != null)
            type.setWhonetCode(emptyToNull(form.getWhonetCode()));
        if (form.getDisposalInstructions() != null)
            type.setDisposalInstructions(emptyToNull(form.getDisposalInstructions()));
        if (form.getSortOrder() > 0)
            type.setSortOrder(form.getSortOrder());
        if (form.getIsActive() != null)
            type.setIsActive(form.getIsActive());
        boolean updateName = form.getNameZh() != null || form.getName() != null && !form.getName().trim().isEmpty();
        if (updateName && name == null) {
            name = new Localization();
            name.setDescription("type of sample name");
            name.setSysUserId(actor);
            localizations.insert(name);
            type.setLocalization(name);
        }
        type.setSysUserId(actor);
        // The legacy audited type save evicts its graph before merge. Persist names
        // afterwards so a new locale never leaves an insert queued on an evicted child.
        type = types.save(type);
        name = type.getLocalization();
        if (updateName) {
            if (form.getNameZh() != null)
                setTranslation(name, "zh", form.getNameZh(), actor);
            // The legacy name field retains its historical English meaning.
            if (form.getName() != null && !form.getName().trim().isEmpty())
                setTranslation(name, "en", form.getName(), actor);
        }
        SampleTypeBasicInfoForm after = snapshot(type);
        Map<String, String> metadata = diff(values(before), values(after));
        if (!metadata.isEmpty()) {
            metadata.put("configurationType", "sampleType");
            metadata.put("businessId", id);
            audit.saveNamedChanges(id, "TYPE_OF_SAMPLE", actor, metadata);
        }
        Map<String, String> names = diff(beforeNames, name == null ? new LinkedHashMap<>() : name.getValuesAsMap());
        if (!names.isEmpty()) {
            names.put("configurationType", "sampleType");
            names.put("businessId", id);
            audit.saveNamedChanges(name.getId(), "LOCALIZATION", actor, names);
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                types.invalidateCache();
                tests.invalidateTestNames();
                display.invalidateLists(ListType.SAMPLE_TYPE, ListType.SAMPLE_TYPE_ACTIVE,
                        ListType.SAMPLE_TYPE_INACTIVE);
            }
        });
        return after;
    }

    private TypeOfSample requiredType(String id) {
        if (id == null || !id.matches("[0-9]+"))
            throw new IllegalArgumentException("Invalid sample type ID");
        TypeOfSample type = types.getTypeOfSampleById(id);
        if (type == null)
            throw new NoSuchElementException("Sample type not found");
        return type;
    }

    private SampleTypeBasicInfoForm snapshot(TypeOfSample type) {
        SampleTypeBasicInfoForm form = new SampleTypeBasicInfoForm(type);
        form.setTestCount(types.getAllTestsBySampleTypeId(type.getId()).size());
        return form;
    }

    private static void checkLength(String value, int maximum) {
        if (value != null && value.trim().length() > maximum)
            throw new IllegalArgumentException("Sample type field is too long");
    }

    private static String emptyToNull(String value) {
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private void setTranslation(Localization name, String locale, String value, String actor) {
        name.getValues().put(locale, translations.setTranslation(name.getId(), locale, value.trim(), actor));
    }

    private static Map<String, String> values(SampleTypeBasicInfoForm f) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("description", f.getDescription());
        m.put("domain", f.getDomain());
        m.put("abbreviation", f.getAbbreviation());
        m.put("whonetCode", f.getWhonetCode());
        m.put("disposalInstructions", f.getDisposalInstructions());
        m.put("isActive", String.valueOf(f.getIsActive()));
        m.put("sortOrder", String.valueOf(f.getSortOrder()));
        return m;
    }

    private static Map<String, String> diff(Map<String, String> old, Map<String, String> after) {
        Map<String, String> result = new LinkedHashMap<>();
        after.forEach((key, value) -> {
            if (!Objects.equals(old.get(key), value)) {
                result.put(key + "Before", old.get(key));
                result.put(key + "After", value);
            }
        });
        return result;
    }
}
