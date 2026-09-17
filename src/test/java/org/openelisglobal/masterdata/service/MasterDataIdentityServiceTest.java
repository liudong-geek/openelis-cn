package org.openelisglobal.masterdata.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.masterdata.dao.MasterDataIdentityRepository;
import org.openelisglobal.masterdata.dao.MasterDataIdentityRepository.Identity;
import org.openelisglobal.masterdata.form.MasterDataIdentityForm;
import org.openelisglobal.organization.service.OrganizationService;
import org.openelisglobal.provider.service.ProviderService;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.server.ResponseStatusException;

public class MasterDataIdentityServiceTest {

    private MasterDataIdentityRepository repository;
    private TestService testService;
    private TypeOfSampleService sampleTypeService;
    private OrganizationService organizationService;
    private ProviderService providerService;
    private MasterDataIdentityServiceImpl service;

    @Before
    public void setUp() {
        repository = mock(MasterDataIdentityRepository.class);
        testService = mock(TestService.class);
        sampleTypeService = mock(TypeOfSampleService.class);
        organizationService = mock(OrganizationService.class);
        providerService = mock(ProviderService.class);
        service = new MasterDataIdentityServiceImpl(repository, testService, sampleTypeService, organizationService,
                providerService, Clock.fixed(Instant.parse("2026-09-17T00:00:00Z"), ZoneOffset.UTC));
        when(testService.getAllTests(false)).thenReturn(List.of());
        when(sampleTypeService.getAllTypeOfSamples()).thenReturn(List.of());
        when(organizationService.getAllOrganizations()).thenReturn(List.of());
        when(providerService.getAllProviders()).thenReturn(List.of());
        when(repository.findAll()).thenReturn(List.of());
    }

    @Test
    public void listProjectsMissingExpiredAndInactiveStatusesAcrossDictionaries() {
        org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
        test.setId("11");
        test.setDescription("血糖");
        test.setLocalCode("GLU");
        test.setIsActive("Y");
        TypeOfSample sampleType = new TypeOfSample();
        sampleType.setId("21");
        sampleType.setDescription("血清");
        sampleType.setLocalAbbreviation("SER");
        sampleType.setActive(false);
        when(testService.getAllTests(false)).thenReturn(List.of(test));
        when(sampleTypeService.getAllTypeOfSamples()).thenReturn(List.of(sampleType));
        when(repository.findAll()).thenReturn(List.of(identity("SAMPLE_TYPE", "21", "SER", "2026-01-01", "2026-09-16")));

        var listing = service.list(null, null);

        assertEquals(2, listing.summary().total());
        assertEquals(1, listing.summary().registered());
        assertEquals(1, listing.summary().missingCode());
        assertEquals(1, listing.summary().inactive());
        assertEquals(1, listing.summary().expired());
        assertTrue(listing.items().stream().filter(item -> item.entityId().equals("11")).findFirst().orElseThrow()
                .issues().contains("MISSING_CODE"));
        assertTrue(listing.items().stream().filter(item -> item.entityId().equals("21")).findFirst().orElseThrow()
                .issues().containsAll(List.of("INACTIVE", "EXPIRED")));
    }

    @Test
    public void saveNormalizesCodeAndRequiresExistingReferencedEntity() {
        org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
        test.setId("11");
        test.setDescription("血糖");
        test.setIsActive("Y");
        when(testService.getAllTests(false)).thenReturn(List.of(test));
        when(repository.findForUpdate("TEST", "11")).thenReturn(Optional.empty());
        Identity saved = identity("TEST", "11", "GLU-01", null, null);
        when(repository.insert("TEST", "11", "GLU-01", "HIS", null, null, 9)).thenReturn(saved);
        MasterDataIdentityForm form = form(" glu-01 ", "his", "", "");

        var result = service.save("test", "11", form, 9);

        assertEquals("GLU-01", result.canonicalCode());
        verify(repository).insert("TEST", "11", "GLU-01", "HIS", null, null, 9);
        ResponseStatusException missing = assertThrows(ResponseStatusException.class,
                () -> service.save("TEST", "99", form, 9));
        assertEquals(404, missing.getStatusCode().value());
    }

    @Test
    public void saveRejectsBackwardsDatesAndDuplicateCodes() {
        org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
        test.setId("11");
        test.setDescription("血糖");
        test.setIsActive("Y");
        when(testService.getAllTests(false)).thenReturn(List.of(test));
        MasterDataIdentityForm backwards = form("GLU", "LIS", "2026-10-01", "2026-09-01");
        ResponseStatusException invalid = assertThrows(ResponseStatusException.class,
                () -> service.save("TEST", "11", backwards, 9));
        assertEquals(400, invalid.getStatusCode().value());

        when(repository.findForUpdate("TEST", "11")).thenReturn(Optional.empty());
        when(repository.insert(eq("TEST"), eq("11"), eq("GLU"), eq("LIS"), any(), any(), eq(9)))
                .thenThrow(new DataIntegrityViolationException("duplicate"));
        MasterDataIdentityForm duplicate = form("GLU", "LIS", "2026-01-01", "2026-12-31");
        ResponseStatusException conflict = assertThrows(ResponseStatusException.class,
                () -> service.save("TEST", "11", duplicate, 9));
        assertEquals(409, conflict.getStatusCode().value());
    }

    @Test
    public void updateRequiresMatchingVersionAndRetainsHistoryTarget() {
        org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
        test.setId("11");
        test.setDescription("血糖");
        test.setIsActive("Y");
        when(testService.getAllTests(false)).thenReturn(List.of(test));
        Identity current = identity("TEST", "11", "GLU", null, null);
        when(repository.findForUpdate("TEST", "11")).thenReturn(Optional.of(current));
        MasterDataIdentityForm stale = form("GLU2", "LIS", "", "");
        stale.setExpectedLastUpdated("2026-09-16T00:00:00Z");

        ResponseStatusException conflict = assertThrows(ResponseStatusException.class,
                () -> service.save("TEST", "11", stale, 9));
        assertEquals(409, conflict.getStatusCode().value());
    }

    @Test
    public void updateAcceptsTheExactUtcVersionReturnedByTheApi() {
        org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
        test.setId("11");
        test.setDescription("血糖");
        test.setIsActive("Y");
        when(testService.getAllTests(false)).thenReturn(List.of(test));
        Identity current = identity("TEST", "11", "GLU", null, null);
        Identity updated = identity("TEST", "11", "GLU2", null, null);
        when(repository.findForUpdate("TEST", "11")).thenReturn(Optional.of(current));
        when(repository.update(7L, "TEST", "11", "GLU2", "LIS", null, null, 9, current.lastUpdated()))
                .thenReturn(updated);
        MasterDataIdentityForm form = form("GLU2", "LIS", "", "");
        form.setExpectedLastUpdated("2026-09-17T00:00:00Z");

        var result = service.save("TEST", "11", form, 9);

        assertEquals("GLU2", result.canonicalCode());
    }

    private Identity identity(String type, String id, String code, String from, String to) {
        return new Identity(7L, type, id, code, "LEGACY_IMPORT", from == null ? null : Date.valueOf(from),
                to == null ? null : Date.valueOf(to), 1, Timestamp.from(Instant.parse("2026-09-17T00:00:00Z")));
    }

    private MasterDataIdentityForm form(String code, String source, String from, String to) {
        MasterDataIdentityForm form = new MasterDataIdentityForm();
        form.setCanonicalCode(code);
        form.setSourceSystem(source);
        form.setValidFrom(from);
        form.setValidTo(to);
        return form;
    }
}
