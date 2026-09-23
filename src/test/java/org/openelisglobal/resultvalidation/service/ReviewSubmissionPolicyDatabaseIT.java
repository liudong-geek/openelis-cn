package org.openelisglobal.resultvalidation.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;
import org.openelisglobal.analysis.daoimpl.ReviewPendingDatabaseIT.IsolatedConnectionProvider;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.services.registration.interfaces.IResultUpdate;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.dataexchange.fhir.service.FhirTransformService;
import org.openelisglobal.esig.service.ElectronicSignatureService;
import org.openelisglobal.esig.valueholder.ElectronicSignature;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.note.service.NoteService;
import org.openelisglobal.note.valueholder.Note;
import org.openelisglobal.notification.service.TestNotificationService;
import org.openelisglobal.qc.service.QCReleaseGateService;
import org.openelisglobal.resultvalidation.form.ResultValidationForm.ReviewSignature;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.datasource.AbstractDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

/**
 * Real Spring/PG rollback of synthetic side effects; domain lock reads use
 * existing SIM guard fixtures.
 */
public class ReviewSubmissionPolicyDatabaseIT {
    @Test
    public void configurationChangeDuringSaveRollsBackAllSyntheticWritesAndDoesNotDispatch() throws Exception {
        try (Connection connection = new IsolatedConnectionProvider().getConnection();
                var sql = connection.createStatement()) {
            sql.executeUpdate("create table public.a02_review_transaction_probe(kind varchar(20) not null)");
            connection.commit();
        }
        var fixture = new ReviewWriteGuardTest();
        fixture.setup();
        try {
            TransactionSynchronizationManager.clear();
            var dataSource = new AbstractDataSource() {
                public Connection getConnection() throws SQLException {
                    return new IsolatedConnectionProvider().getConnection();
                }

                public Connection getConnection(String user, String password) throws SQLException {
                    throw new SQLException("Explicit credentials prohibited");
                }
            };
            var scopes = new ReviewScopeService(fixture.statuses, fixture.users, fixture.configuration, () -> false);
            when(fixture.users.getAnalysisSectionIdsForLabUnitRole("801", Constants.ROLE_VALIDATION))
                    .thenReturn(Set.of("501"));
            when(fixture.configuration.getPropertyValue(Property.StatusRules)).thenReturn("NORMAL");
            when(fixture.configuration.getPropertyValue(Property.VALIDATE_REJECTED_TESTS)).thenReturn("false");
            when(fixture.statuses.getStatusID(org.openelisglobal.common.services.StatusService.AnalysisStatus.Canceled))
                    .thenReturn("22");
            when(fixture.statuses.getStatusID(
                    org.openelisglobal.common.services.StatusService.AnalysisStatus.NonConforming_depricated))
                    .thenReturn("23");
            var policy = scopes.capture("801");
            var analyses = mock(AnalysisService.class);
            var notes = mock(NoteService.class);
            var signatures = mock(ElectronicSignatureService.class);
            var users = mock(SystemUserService.class);
            var user = new SystemUser();
            user.setId("801");
            user.setLoginName("synthetic-reviewer");
            user.setIsActive("Y");
            when(users.get("801")).thenReturn(user);
            var fhir = mock(FhirTransformService.class);
            var notifications = mock(TestNotificationService.class);
            var updater = mock(IResultUpdate.class);
            var target = spy(new ReviewSubmissionService(fixture.guard, analyses, fixture.statuses, notes,
                    mock(SampleService.class), mock(SampleHumanService.class), signatures, users, fixture.specimens,
                    fhir, notifications, mock(QCReleaseGateService.class), scopes));
            doReturn(List.of(updater)).when(target).registeredUpdaters();
            AtomicInteger observedWrites = new AtomicInteger();
            java.util.function.Consumer<String> write = kind -> {
                Connection c = DataSourceUtils.getConnection(dataSource);
                try (var sql = c.prepareStatement("insert into public.a02_review_transaction_probe(kind) values(?)")) {
                    assertEquals(Connection.TRANSACTION_SERIALIZABLE, c.getTransactionIsolation());
                    sql.setString(1, kind);
                    sql.executeUpdate();
                    observedWrites.incrementAndGet();
                } catch (SQLException e) {
                    throw new IllegalStateException(e);
                } finally {
                    DataSourceUtils.releaseConnection(c, dataSource);
                }
            };
            doAnswer(call -> {
                write.accept("analysis");
                return call.getArgument(0);
            }).when(analyses).update(any());
            when(notes.createSavableNote(any(), any(), anyString(), anyString(), eq("801"))).thenAnswer(call -> {
                var note = new Note();
                note.setText(call.getArgument(2));
                return note;
            });
            doAnswer(call -> {
                write.accept("note");
                return "1";
            }).when(notes).insert(any());
            when(signatures.isEsigEnabled()).thenReturn(true);
            when(signatures.executeSignatureForSnapshot(anyString(), anyString(), any(), anyString(), anyLong(), any(),
                    any(), any(), anyString())).thenAnswer(call -> {
                        write.accept("signature");
                        var signature = new ElectronicSignature();
                        signature.setId(901L);
                        return signature;
                    });
            doAnswer(call -> {
                when(fixture.configuration.getPropertyValue(Property.VALIDATE_REJECTED_TESTS)).thenReturn("true");
                return null;
            }).when(updater).transactionalUpdate(any());
            var proxy = new ProxyFactory(target);
            proxy.setProxyTargetClass(true);
            proxy.addAdvice(new TransactionInterceptor(new DataSourceTransactionManager(dataSource),
                    new AnnotationTransactionAttributeSource()));
            var service = (ReviewSubmissionService) proxy.getProxy();
            var request = new MockHttpServletRequest();
            var actor = new UserSessionData();
            actor.setSytemUserId(801);
            request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, actor);
            var credentials = new ReviewSignature();
            credentials.setUsername("synthetic-reviewer");
            credentials.setPassword("synthetic-only");
            assertEquals(409,
                    assertThrows(ResponseStatusException.class,
                            () -> service.save(request, "801", List.of(fixture.row), credentials, policy))
                            .getStatusCode().value());
            assertEquals(3, observedWrites.get());
            assertNull(credentials.getPassword());
            try (Connection c = new IsolatedConnectionProvider().getConnection();
                    var sql = c.createStatement();
                    var result = sql.executeQuery("select count(*) from public.a02_review_transaction_probe")) {
                assertTrue(result.next());
                assertEquals(0, result.getLong(1));
            }
            verifyZeroInteractions(fhir, notifications);
            verify(updater, never()).postTransactionalCommitUpdate(any());
            verify(signatures, times(1)).executeSignatureForSnapshot(anyString(), anyString(), any(), anyString(),
                    anyLong(), any(), any(), any(), anyString());
        } finally {
            fixture.cleanup();
        }
    }
}
