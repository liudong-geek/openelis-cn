package org.openelisglobal.resultvalidation.service;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Set;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.systemuser.service.UserService;
import org.springframework.web.server.ResponseStatusException;

public class ReviewScopeServiceTest {
    private IStatusService statuses;
    private UserService users;
    private DefaultConfigurationProperties config;
    private ReviewScopeService service;

    @Before
    public void setup() {
        statuses = mock(IStatusService.class);
        users = mock(UserService.class);
        config = mock(DefaultConfigurationProperties.class);
        when(statuses.getStatusID(AnalysisStatus.TechnicalAcceptance)).thenReturn("15");
        when(statuses.getStatusID(AnalysisStatus.TechnicalRejected)).thenReturn("16");
        when(config.getPropertyValue(Property.VALIDATE_REJECTED_TESTS)).thenReturn("false");
        when(config.getPropertyValue(Property.StatusRules)).thenReturn("NORMAL");
        when(config.getPropertyValue(Property.DEFAULT_DATE_LOCALE)).thenReturn("en");
        when(users.getAnalysisSectionIdsForLabUnitRole("7", Constants.ROLE_VALIDATION)).thenReturn(Set.of("101"));
        service = new ReviewScopeService(statuses, users, config, () -> false);
    }

    @Test
    public void statusesUseExactTrueAndActualAnalysisSectionRoleHelper() {
        assertEquals(List.of("15"), service.capture("7").statusIds());
        when(config.getPropertyValue(Property.VALIDATE_REJECTED_TESTS)).thenReturn("TRUE");
        assertEquals(List.of("15"), service.capture("7").statusIds());
        when(config.getPropertyValue(Property.VALIDATE_REJECTED_TESTS)).thenReturn("true");
        var snapshot = service.capture("7");
        assertEquals(List.of("15", "16"), snapshot.statusIds());
        assertEquals(Set.of("101"), snapshot.sectionIds());
        assertThrows(UnsupportedOperationException.class, () -> snapshot.sectionIds().add("102"));
        verify(users, times(3)).getAnalysisSectionIdsForLabUnitRole("7", Constants.ROLE_VALIDATION);
    }

    @Test
    public void unavailableSelectedStatusOrRecordPolicyDoesNotReturnFalseEmpty() {
        for (String invalid : new String[] { null, "", " ", "0", "bad" }) {
            when(statuses.getStatusID(AnalysisStatus.TechnicalAcceptance)).thenReturn(invalid);
            assertError(503, () -> service.capture("7"));
        }
        when(statuses.getStatusID(AnalysisStatus.TechnicalAcceptance)).thenReturn("15");
        when(config.getPropertyValue(Property.VALIDATE_REJECTED_TESTS)).thenReturn("true");
        for (String invalid : new String[] { null, "", "15", "0", "bad" }) {
            when(statuses.getStatusID(AnalysisStatus.TechnicalRejected)).thenReturn(invalid);
            assertError(503, () -> service.capture("7"));
        }
        when(config.getPropertyValue(Property.VALIDATE_REJECTED_TESTS)).thenReturn("false");
        assertEquals(List.of("15"), service.capture("7").statusIds());
        when(config.getPropertyValue(Property.StatusRules)).thenReturn(null);
        assertError(503, () -> service.capture("7"));
    }

    @Test
    public void configurationAndPermissionChangesInvalidateSnapshot() {
        var snapshot = service.capture("7");
        service.requireUnchanged(snapshot);
        when(config.getPropertyValue(Property.VALIDATE_REJECTED_TESTS)).thenReturn("true");
        assertError(409, () -> service.requireUnchanged(snapshot));
        when(config.getPropertyValue(Property.VALIDATE_REJECTED_TESTS)).thenReturn("false");
        when(users.getAnalysisSectionIdsForLabUnitRole("7", Constants.ROLE_VALIDATION)).thenReturn(Set.of());
        assertError(403, () -> service.requireUnchanged(snapshot));
        assertError(403, () -> service.capture(null));
    }

    private static void assertError(int code, Runnable operation) {
        assertEquals(code, assertThrows(ResponseStatusException.class, operation::run).getStatusCode().value());
    }
}
