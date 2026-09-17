package org.openelisglobal.masterdata.service;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.openelisglobal.masterdata.dao.MasterDataIdentityRepository;
import org.openelisglobal.masterdata.dao.MasterDataIdentityRepository.History;
import org.openelisglobal.masterdata.dao.MasterDataIdentityRepository.Identity;
import org.openelisglobal.masterdata.form.MasterDataIdentityForm;
import org.openelisglobal.organization.service.OrganizationService;
import org.openelisglobal.organization.valueholder.Organization;
import org.openelisglobal.person.valueholder.Person;
import org.openelisglobal.provider.service.ProviderService;
import org.openelisglobal.provider.valueholder.Provider;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.test.valueholder.Test;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class MasterDataIdentityServiceImpl implements MasterDataIdentityService {

    private static final Map<String, String> ENTITY_TYPES;
    static {
        Map<String, String> types = new LinkedHashMap<>();
        types.put("TEST", "检验项目");
        types.put("SAMPLE_TYPE", "样本类型");
        types.put("ORGANIZATION", "机构/科室");
        types.put("PROVIDER", "医生");
        ENTITY_TYPES = Map.copyOf(types);
    }

    private final MasterDataIdentityRepository repository;
    private final TestService testService;
    private final TypeOfSampleService sampleTypeService;
    private final OrganizationService organizationService;
    private final ProviderService providerService;
    private final Clock clock;

    @Autowired
    public MasterDataIdentityServiceImpl(MasterDataIdentityRepository repository, TestService testService,
            TypeOfSampleService sampleTypeService, OrganizationService organizationService,
            ProviderService providerService) {
        this(repository, testService, sampleTypeService, organizationService, providerService, Clock.systemUTC());
    }

    MasterDataIdentityServiceImpl(MasterDataIdentityRepository repository, TestService testService,
            TypeOfSampleService sampleTypeService, OrganizationService organizationService,
            ProviderService providerService, Clock clock) {
        this.repository = repository;
        this.testService = testService;
        this.sampleTypeService = sampleTypeService;
        this.organizationService = organizationService;
        this.providerService = providerService;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public Listing list(String entityType, String query) {
        String normalizedType = normalizeOptionalType(entityType);
        String normalizedQuery = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        Map<String, Identity> identities = repository.findAll().stream()
                .collect(Collectors.toMap(identity -> key(identity.entityType(), identity.entityId()), Function.identity()));
        List<NativeItem> nativeItems = loadNativeItems();
        LocalDate today = LocalDate.now(clock);
        List<Item> items = nativeItems.stream()
                .filter(item -> normalizedType == null || normalizedType.equals(item.entityType()))
                .map(item -> project(item, identities.get(key(item.entityType(), item.entityId())), today))
                .filter(item -> matches(item, normalizedQuery))
                .sorted(Comparator.comparing(Item::entityType).thenComparing(Item::name, String.CASE_INSENSITIVE_ORDER)
                        .thenComparing(Item::entityId))
                .toList();
        return new Listing(items, summarize(items), ENTITY_TYPES);
    }

    @Override
    @Transactional
    public Item save(String entityType, String entityId, MasterDataIdentityForm form, int userId) {
        String type = normalizeRequiredType(entityType);
        String id = normalizeEntityId(entityId);
        NativeItem nativeItem = findNativeItem(type, id);
        String code = form.getCanonicalCode().trim().toUpperCase(Locale.ROOT);
        String source = form.getSourceSystem().trim().toUpperCase(Locale.ROOT);
        Date validFrom = parseDate(form.getValidFrom(), "validFrom");
        Date validTo = parseDate(form.getValidTo(), "validTo");
        if (validFrom != null && validTo != null && validTo.before(validFrom)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "validTo must be on or after validFrom");
        }
        try {
            Identity saved = repository.findForUpdate(type, id)
                    .map(current -> repository.update(current.id(), type, id, code, source, validFrom, validTo, userId,
                            requireVersion(form.getExpectedLastUpdated(), current.lastUpdated())))
                    .orElseGet(() -> repository.insert(type, id, code, source, validFrom, validTo, userId));
            return project(nativeItem, saved, LocalDate.now(clock));
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Canonical code is already used by another " + ENTITY_TYPES.get(type), e);
        } catch (OptimisticLockingFailureException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Master data identity was changed by another user", e);
        }
    }

    @Override
    @Transactional(readOnly = true)
    public List<History> history(String entityType, String entityId) {
        String type = normalizeRequiredType(entityType);
        String id = normalizeEntityId(entityId);
        Identity identity = repository.find(type, id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Master data identity not found"));
        return repository.history(identity.id());
    }

    private List<NativeItem> loadNativeItems() {
        List<NativeItem> items = new ArrayList<>();
        for (Test test : testService.getAllTests(false)) {
            items.add(new NativeItem("TEST", test.getId(), nonblank(test.getDescription(), test.getId()),
                    test.getLocalCode(), test.isActive()));
        }
        for (TypeOfSample sampleType : sampleTypeService.getAllTypeOfSamples()) {
            items.add(new NativeItem("SAMPLE_TYPE", sampleType.getId(),
                    nonblank(sampleType.getDescription(), sampleType.getId()), sampleType.getLocalAbbreviation(),
                    sampleType.isActive()));
        }
        for (Organization organization : organizationService.getAllOrganizations()) {
            items.add(new NativeItem("ORGANIZATION", organization.getId(),
                    nonblank(organization.getOrganizationName(), organization.getId()), organization.getCode(),
                    "Y".equalsIgnoreCase(organization.getIsActive())));
        }
        for (Provider provider : providerService.getAllProviders()) {
            items.add(new NativeItem("PROVIDER", provider.getId(), providerName(provider), provider.getExternalId(),
                    provider.getActive()));
        }
        return items;
    }

    private NativeItem findNativeItem(String type, String id) {
        return loadNativeItems().stream().filter(item -> type.equals(item.entityType()) && id.equals(item.entityId()))
                .findFirst().orElseThrow(
                        () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Referenced master data does not exist"));
    }

    private Item project(NativeItem nativeItem, Identity identity, LocalDate today) {
        List<String> issues = new ArrayList<>();
        if (identity == null) {
            issues.add("MISSING_CODE");
        }
        if (!nativeItem.active()) {
            issues.add("INACTIVE");
        }
        LocalDate from = identity == null || identity.validFrom() == null ? null : identity.validFrom().toLocalDate();
        LocalDate to = identity == null || identity.validTo() == null ? null : identity.validTo().toLocalDate();
        if (from != null && from.isAfter(today)) {
            issues.add("NOT_YET_VALID");
        }
        if (to != null && to.isBefore(today)) {
            issues.add("EXPIRED");
        }
        String status = issues.isEmpty() ? "VALID" : issues.contains("MISSING_CODE") ? "MISSING" : "ATTENTION";
        OffsetDateTime updated = identity == null ? null : identity.lastUpdated().toInstant().atOffset(ZoneOffset.UTC);
        return new Item(nativeItem.entityType(), nativeItem.entityId(), nativeItem.name(), nativeItem.nativeCode(),
                nativeItem.active(), identity == null ? null : identity.canonicalCode(),
                identity == null ? null : identity.sourceSystem(), from, to, updated, status, List.copyOf(issues));
    }

    private Summary summarize(List<Item> items) {
        return new Summary(items.size(), (int) items.stream().filter(item -> item.canonicalCode() != null).count(),
                countIssue(items, "MISSING_CODE"), countIssue(items, "INACTIVE"), countIssue(items, "NOT_YET_VALID"),
                countIssue(items, "EXPIRED"));
    }

    private int countIssue(List<Item> items, String issue) {
        return (int) items.stream().filter(item -> item.issues().contains(issue)).count();
    }

    private boolean matches(Item item, String query) {
        if (query.isEmpty()) {
            return true;
        }
        return List.of(item.entityId(), item.name(), Objects.toString(item.nativeCode(), ""),
                Objects.toString(item.canonicalCode(), ""), Objects.toString(item.sourceSystem(), "")).stream()
                .anyMatch(value -> value.toLowerCase(Locale.ROOT).contains(query));
    }

    private String normalizeOptionalType(String type) {
        return type == null || type.isBlank() ? null : normalizeRequiredType(type);
    }

    private String normalizeRequiredType(String type) {
        String normalized = type == null ? "" : type.trim().toUpperCase(Locale.ROOT);
        if (!ENTITY_TYPES.containsKey(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported master data type");
        }
        return normalized;
    }

    private String normalizeEntityId(String entityId) {
        try {
            long id = Long.parseLong(entityId);
            if (id <= 0) {
                throw new NumberFormatException();
            }
            return Long.toString(id);
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid master data identifier");
        }
    }

    private Timestamp requireVersion(String supplied, Timestamp current) {
        if (supplied == null || supplied.isBlank()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Reload before changing an existing identity");
        }
        try {
            Timestamp expected = Timestamp.from(OffsetDateTime.parse(supplied).toInstant());
            if (!expected.equals(current)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Master data identity was changed by another user");
            }
            return expected;
        } catch (java.time.format.DateTimeParseException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid expectedLastUpdated timestamp");
        }
    }

    private Date parseDate(String value, String field) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Date.valueOf(value);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid " + field + " date");
        }
    }

    private String providerName(Provider provider) {
        Person person = provider.getPerson();
        if (person == null) {
            return provider.getId();
        }
        return nonblank((Objects.toString(person.getLastName(), "") + Objects.toString(person.getFirstName(), "")).trim(),
                provider.getId());
    }

    private String nonblank(String preferred, String fallback) {
        return preferred == null || preferred.isBlank() ? fallback : preferred;
    }

    private String key(String type, String id) {
        return type + ":" + id;
    }

    private record NativeItem(String entityType, String entityId, String name, String nativeCode, boolean active) {
    }
}
