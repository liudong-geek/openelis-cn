package org.openelisglobal.testcatalog.service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Set;
import org.openelisglobal.audittrail.dao.AuditTrailService;
import org.openelisglobal.common.domain.Domain;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.common.services.DisplayListService.ListType;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.test.valueholder.Test;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.testcatalog.form.TestCatalogBasicInfo;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.openelisglobal.typeofsample.service.TypeOfSampleTestService;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.openelisglobal.typeofsample.valueholder.TypeOfSampleTest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** The existing basic-info write chain is committed or rolled back together. */
@Service
public class TestCatalogBasicInfoServiceImpl implements TestCatalogBasicInfoService {
    private final TestService tests;
    private final TestSectionService sections;
    private final TypeOfSampleService sampleTypes;
    private final TypeOfSampleTestService links;
    private final DisplayListService displayLists;
    private final CatalogHealthService health;
    private final AuditTrailService audit;

    public TestCatalogBasicInfoServiceImpl(TestService tests, TestSectionService sections,
            TypeOfSampleService sampleTypes, TypeOfSampleTestService links, DisplayListService displayLists,
            CatalogHealthService health, AuditTrailService audit) {
        this.tests = tests;
        this.sections = sections;
        this.sampleTypes = sampleTypes;
        this.links = links;
        this.displayLists = displayLists;
        this.health = health;
        this.audit = audit;
    }

    @Override
    @Transactional(readOnly = true)
    public TestCatalogBasicInfo read(String id) {
        return toForm(requiredTest(id));
    }

    @Override
    @Transactional
    public TestCatalogBasicInfo save(String id, TestCatalogBasicInfo body, String actor) {
        Test test = requiredTest(id);
        if (body == null || actor == null || actor.isBlank())
            throw new IllegalArgumentException("Invalid basic configuration request");
        if (body.domain != null
                && java.util.Arrays.stream(Domain.values()).noneMatch(d -> d.name().equals(body.domain)))
            throw new IllegalArgumentException("Invalid test domain");
        if (body.name != null && !body.name.equals(test.getName() == null ? "" : test.getName()))
            throw new IllegalArgumentException("Test name is edited through localization");
        LinkedHashSet<String> desired = new LinkedHashSet<>();
        if (body.sampleTypeIds != null) {
            for (String typeId : body.sampleTypeIds)
                if (!blank(typeId))
                    desired.add(typeId);
        } else if (!blank(body.sampleTypeId))
            desired.add(body.sampleTypeId);
        boolean reconcile = body.sampleTypeIds != null || !blank(body.sampleTypeId);
        if (reconcile) {
            boolean active = body.active != null ? body.active : test.isActive();
            boolean orderable = body.orderable != null ? body.orderable : Boolean.TRUE.equals(test.getOrderable());
            if (desired.isEmpty() && (active || orderable))
                throw new IllegalArgumentException("A sample type is required");
            String domain = body.domain != null ? body.domain : test.getDomain();
            for (String typeId : desired) {
                TypeOfSample type = sampleTypes.getTypeOfSampleById(typeId);
                Domain typeDomain = type == null ? null : Domain.fromRaw(type.getDomain());
                if (type == null || !blank(domain) && typeDomain != null && !domain.equals(typeDomain.name()))
                    throw new IllegalArgumentException("Sample type domain does not match");
            }
        }
        TestCatalogBasicInfo before = toForm(test);
        // Finish all guards before touching any managed entity.
        TestSection section = blank(body.labUnitId) ? null : sections.get(body.labUnitId);
        if (body.code != null && !body.code.isBlank())
            test.setLocalCode(body.code);
        if (body.description != null)
            test.setDescription(body.description);
        if (body.domain != null)
            test.setDomain(body.domain);
        if (body.antimicrobialResistance != null)
            test.setAntimicrobialResistance(body.antimicrobialResistance);
        if (body.orderable != null)
            test.setOrderable(body.orderable);
        if (section != null) {
            if ("N".equals(section.getIsActive())) {
                section.setIsActive("Y");
                section.setSysUserId(actor);
                sections.update(section);
            }
            test.setTestSection(section);
        }
        // Activation continues to require the separate coverage acknowledgment API.
        if (Boolean.FALSE.equals(body.active))
            test.setIsActive("N");
        test.setSysUserId(actor);
        Test updated = tests.update(test);
        if (reconcile) {
            Set<String> kept = new HashSet<>();
            for (TypeOfSampleTest link : links.getTypeOfSampleTestsForTest(id)) {
                if (!desired.contains(link.getTypeOfSampleId()) || !kept.add(link.getTypeOfSampleId()))
                    links.delete(link.getId(), actor);
            }
            for (String typeId : desired)
                if (!kept.contains(typeId)) {
                    TypeOfSampleTest link = new TypeOfSampleTest();
                    link.setTypeOfSampleId(typeId);
                    link.setTestId(id);
                    link.setSysUserId(actor);
                    links.insert(link);
                }
        }
        TestCatalogBasicInfo after = toForm(updated);
        Map<String, String> changes = changes(before, after);
        if (!changes.isEmpty()) {
            changes.put("configurationType", "testCatalog");
            changes.put("businessId", id);
            audit.saveNamedChanges(id, "TEST", actor, changes);
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                tests.invalidateTestNames();
                sampleTypes.invalidateCache();
                displayLists.invalidateLists(ListType.ALL_TESTS, ListType.ORDERABLE_TESTS, ListType.TEST_SECTION_ACTIVE,
                        ListType.TEST_SECTION_INACTIVE);
                health.invalidate();
            }
        });
        return after;
    }

    private Test requiredTest(String id) {
        if (id == null || !id.matches("[0-9]+"))
            throw new IllegalArgumentException("Invalid test ID");
        Test test = tests.getTestById(id);
        if (test == null)
            throw new NoSuchElementException("Test not found");
        return test;
    }

    private TestCatalogBasicInfo toForm(Test test) {
        TestCatalogBasicInfo info = new TestCatalogBasicInfo();
        info.testId = test.getId();
        info.testGuid = test.getGuid();
        info.name = test.getName();
        info.code = test.getLocalCode();
        info.description = test.getDescription();
        info.domain = test.getDomain();
        info.labUnitId = test.getTestSection() == null ? null : test.getTestSection().getId();
        info.sampleTypeIds = new ArrayList<>();
        for (TypeOfSampleTest link : links.getTypeOfSampleTestsForTest(test.getId()))
            info.sampleTypeIds.add(link.getTypeOfSampleId());
        info.sampleTypeId = info.sampleTypeIds.isEmpty() ? null : info.sampleTypeIds.get(0);
        info.antimicrobialResistance = Boolean.TRUE.equals(test.getAntimicrobialResistance());
        info.active = test.isActive();
        info.orderable = Boolean.TRUE.equals(test.getOrderable());
        return info;
    }

    private Map<String, String> changes(TestCatalogBasicInfo before, TestCatalogBasicInfo after) {
        Map<String, String> old = values(before), current = values(after), changes = new LinkedHashMap<>();
        current.forEach((key, value) -> {
            if (!Objects.equals(old.get(key), value)) {
                changes.put(key + "Before", old.get(key));
                changes.put(key + "After", value);
            }
        });
        return changes;
    }

    private Map<String, String> values(TestCatalogBasicInfo f) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("code", f.code);
        m.put("description", f.description);
        m.put("domain", f.domain);
        m.put("labUnitId", f.labUnitId);
        m.put("sampleTypeIds", String.join(",", f.sampleTypeIds));
        m.put("antimicrobialResistance", String.valueOf(f.antimicrobialResistance));
        m.put("active", String.valueOf(f.active));
        m.put("orderable", String.valueOf(f.orderable));
        return m;
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
