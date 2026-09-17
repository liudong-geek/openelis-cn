package org.openelisglobal.config;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import javax.sql.DataSource;
import org.hibernate.FlushMode;
import org.hibernate.Session;
import org.hibernate.SessionBuilder;
import org.hibernate.SessionFactory;
import org.hibernate.cfg.Configuration;
import org.hibernate.engine.spi.SessionImplementor;
import org.hibernate.resource.jdbc.spi.PhysicalConnectionHandlingMode;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.sample.service.EntrySubmissionService;
import org.openelisglobal.sample.service.OrderEntryActorGuard;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.orm.jpa.EntityManagerHolder;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaDialect;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Real Spring/Hibernate transaction lifecycle; SIM connections only, no SQL/database. */
public class EntryRecoveryTransactionManagerTest {
    private DataSource dataSource;
    private SessionFactory factory;
    private JpaTransactionManager ordinary;
    private EntryRecoveryTransactionManager recovery;
    private final List<Connection> connections = new ArrayList<>();
    private boolean failNextCommit;
    private JpaTransactionManager previousManager;
    private LocalContainerEntityManagerFactoryBean previousFactory;

    @Before
    public void setUp() throws Exception {
        previousManager = HibernateConfig.transactionManager;
        previousFactory = HibernateConfig.emf;
        HibernateConfig.transactionManager = null;
        HibernateConfig.emf = null;
        dataSource = mock(DataSource.class);
        when(dataSource.getConnection()).thenAnswer(call -> {
            Connection connection = mock(Connection.class);
            AtomicBoolean autoCommit = new AtomicBoolean(true);
            AtomicBoolean readOnly = new AtomicBoolean(false);
            AtomicInteger isolation = new AtomicInteger(Connection.TRANSACTION_READ_COMMITTED);
            when(connection.getAutoCommit()).thenAnswer(ignored -> autoCommit.get());
            doAnswer(ignored -> { autoCommit.set(ignored.getArgument(0)); return null; })
                    .when(connection).setAutoCommit(anyBoolean());
            when(connection.isReadOnly()).thenAnswer(ignored -> readOnly.get());
            doAnswer(ignored -> { readOnly.set(ignored.getArgument(0)); return null; })
                    .when(connection).setReadOnly(anyBoolean());
            when(connection.getTransactionIsolation()).thenAnswer(ignored -> isolation.get());
            doAnswer(ignored -> { isolation.set(ignored.getArgument(0)); return null; })
                    .when(connection).setTransactionIsolation(anyInt());
            if (failNextCommit) {
                failNextCommit = false;
                doThrow(new SQLException("SIM commit failure")).when(connection).commit();
            }
            connections.add(connection);
            return connection;
        });
        Configuration configuration = new Configuration();
        configuration.setProperty("hibernate.dialect", "org.hibernate.dialect.PostgreSQLDialect");
        configuration.setProperty("hibernate.temp.use_jdbc_metadata_defaults", "false");
        configuration.setProperty("hibernate.hbm2ddl.auto", "none");
        configuration.setProperty("hibernate.connection.handling_mode", "DELAYED_ACQUISITION_AND_HOLD");
        configuration.getProperties().put("hibernate.connection.datasource", dataSource);
        factory = configuration.buildSessionFactory();
        assertTrue("Bootstrap must not connect to any database", connections.isEmpty());
        HibernateConfig config = new HibernateConfig();
        ReflectionTestUtils.setField(config, "dataSource", dataSource);
        ordinary = (JpaTransactionManager) config.getTransactionManager(factory);
        ordinary.setDataSource(dataSource);
        ordinary.afterPropertiesSet();
        recovery = config.entryRecoveryTransactionManager(factory);
        recovery.afterPropertiesSet();
    }

    @After
    public void tearDown() {
        try {
            assertFalse(TransactionSynchronizationManager.hasResource(factory));
            assertFalse(TransactionSynchronizationManager.hasResource(dataSource));
            assertFalse(TransactionSynchronizationManager.isSynchronizationActive());
            if (factory != null) { factory.close(); }
        } finally {
            TransactionSynchronizationManager.clear();
            HibernateConfig.transactionManager = previousManager;
            HibernateConfig.emf = previousFactory;
        }
    }

    private TransactionTemplate recoveryRead() {
        TransactionTemplate template = new TransactionTemplate(recovery);
        template.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        template.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        template.setReadOnly(true);
        template.setTimeout(20);
        return template;
    }

    private EntityManager current() {
        return ((EntityManagerHolder) TransactionSynchronizationManager.getResource(factory)).getEntityManager();
    }

    private void assertRecoveryContext() {
        SessionImplementor session = current().unwrap(SessionImplementor.class);
        assertEquals(PhysicalConnectionHandlingMode.DELAYED_ACQUISITION_AND_HOLD,
                session.getJdbcCoordinator().getLogicalConnection().getConnectionHandlingMode());
        assertTrue(TransactionSynchronizationManager.isActualTransactionActive());
        assertTrue(TransactionSynchronizationManager.isCurrentTransactionReadOnly());
        assertEquals(Integer.valueOf(Connection.TRANSACTION_REPEATABLE_READ),
                TransactionSynchronizationManager.getCurrentTransactionIsolationLevel());
        assertEquals(FlushMode.MANUAL, session.getHibernateFlushMode());
        assertTrue(session.isDefaultReadOnly());
    }

    @Test
    public void commitUsesHeldFreshContextAndRestoresConnection() throws Exception {
        AtomicReference<EntityManager> used = new AtomicReference<>();
        recoveryRead().execute(status -> { assertRecoveryContext(); used.set(current()); return null; });
        assertFalse(used.get().isOpen());
        Connection connection = connections.get(0);
        var sequence = inOrder(connection);
        sequence.verify(connection).setReadOnly(true);
        sequence.verify(connection).setTransactionIsolation(Connection.TRANSACTION_REPEATABLE_READ);
        sequence.verify(connection).setAutoCommit(false);
        sequence.verify(connection).commit();
        sequence.verify(connection).setTransactionIsolation(Connection.TRANSACTION_READ_COMMITTED);
        sequence.verify(connection).setReadOnly(false);
        sequence.verify(connection).close();
        verify(connection, never()).prepareStatement(anyString());
        assertEquals(1, connections.size());
    }

    @Test
    public void rollbackAlsoRestoresAndClosesTheNewContext() throws Exception {
        AtomicReference<EntityManager> used = new AtomicReference<>();
        assertThrows(SimFailure.class, () -> recoveryRead().execute(status -> {
            assertRecoveryContext(); used.set(current()); throw new SimFailure();
        }));
        assertFalse(used.get().isOpen());
        Connection connection = connections.get(0);
        verify(connection).rollback(); verify(connection, never()).commit();
        verify(connection).setTransactionIsolation(Connection.TRANSACTION_READ_COMMITTED);
        verify(connection).setReadOnly(false); verify(connection).close();
    }

    @Test
    public void ordinaryConfigurationSupportsCustomIsolationAndRestoresConnectionState() throws Exception {
        assertEquals(HibernateJpaDialect.class, ordinary.getJpaDialect().getClass());
        assertNull("The default factory must not acquire a global Hibernate dialect",
                new HibernateConfig().entityManagerFactory().getJpaDialect());
        TransactionTemplate supported = new TransactionTemplate(ordinary);
        supported.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        supported.setReadOnly(true);
        supported.execute(status -> {
            SessionImplementor session = current().unwrap(SessionImplementor.class);
            assertEquals(PhysicalConnectionHandlingMode.DELAYED_ACQUISITION_AND_HOLD,
                    session.getJdbcCoordinator().getLogicalConnection().getConnectionHandlingMode());
            return null;
        });
        Connection connection = connections.get(0);
        verify(connection).setTransactionIsolation(Connection.TRANSACTION_REPEATABLE_READ);
        verify(connection).setTransactionIsolation(Connection.TRANSACTION_READ_COMMITTED);
        verify(connection).setReadOnly(true);
        verify(connection).setReadOnly(false);
        verify(connection).close();
    }

    @Test
    public void ordinaryWriteStillUsesItsOriginalConnectionAndFlushPolicies() throws Exception {
        new TransactionTemplate(ordinary).execute(status -> {
            SessionImplementor session = current().unwrap(SessionImplementor.class);
            assertEquals(PhysicalConnectionHandlingMode.DELAYED_ACQUISITION_AND_HOLD,
                    session.getJdbcCoordinator().getLogicalConnection().getConnectionHandlingMode());
            assertEquals(FlushMode.AUTO, session.getHibernateFlushMode());
            assertFalse(session.isDefaultReadOnly());
            return null;
        });
        Connection connection = connections.get(0);
        verify(connection).commit(); verify(connection).close();
        verify(connection, never()).setReadOnly(true);
        verify(connection, never()).setTransactionIsolation(anyInt());
    }

    @Test
    public void recoverySuspendsAndRestoresOuterWriteIncludingItsConnection() throws Exception {
        new TransactionTemplate(ordinary).execute(outer -> {
            EntityManager previous = current();
            Object previousConnection = TransactionSynchronizationManager.getResource(dataSource);
            recoveryRead().execute(inner -> {
                assertNotSame(previous, current()); assertRecoveryContext();
                assertNotSame(previousConnection, TransactionSynchronizationManager.getResource(dataSource));
                return null;
            });
            assertSame(previous, current()); assertTrue(previous.isOpen());
            assertSame(previousConnection, TransactionSynchronizationManager.getResource(dataSource));
            assertFalse(TransactionSynchronizationManager.isCurrentTransactionReadOnly());
            return null;
        });
        assertEquals(2, connections.size());
        verify(connections.get(0)).commit(); verify(connections.get(1)).commit();
        verify(connections.get(0), never()).setTransactionIsolation(anyInt());
    }

    @Test
    public void failedRecoveryDoesNotRollbackOrReplaceOuterTransaction() throws Exception {
        new TransactionTemplate(ordinary).execute(outer -> {
            EntityManager previous = current();
            assertThrows(SimFailure.class, () -> recoveryRead().execute(inner -> { throw new SimFailure(); }));
            assertSame(previous, current()); assertFalse(outer.isRollbackOnly()); return null;
        });
        verify(connections.get(0)).commit(); verify(connections.get(1)).rollback();
        verify(connections.get(0), never()).rollback();
    }

    @Test
    public void defaultRequiredDaoParticipatesInSameRecoveryTransaction() throws Exception {
        recoveryRead().execute(status -> {
            EntityManager previous = current();
            new TransactionTemplate(ordinary).execute(inner -> {
                assertFalse(inner.isNewTransaction()); assertSame(previous, current());
                assertRecoveryContext(); return null;
            });
            assertTrue(previous.isOpen()); return null;
        });
        assertEquals(1, connections.size()); verify(connections.get(0), times(1)).commit();
    }

    @Test
    public void preboundNontransactionalContextIsRejectedWithoutTouchingIt() {
        EntityManager unrelated = mock(EntityManager.class);
        when(unrelated.isOpen()).thenReturn(true);
        EntityManagerHolder holder = new EntityManagerHolder(unrelated);
        TransactionSynchronizationManager.bindResource(factory, holder);
        try {
            assertThrows(CannotCreateTransactionException.class, () -> recoveryRead().execute(status -> {
                fail("An old persistence context must not enter recovery"); return null;
            }));
            assertSame(holder, TransactionSynchronizationManager.getResource(factory));
            verify(unrelated, never()).clear(); verify(unrelated, never()).close();
            assertTrue(connections.isEmpty());
        } finally {
            TransactionSynchronizationManager.unbindResource(factory);
        }
    }

    @Test
    public void namedManagerCannotBeUsedAsAnOrdinaryWriteManager() {
        assertThrows(CannotCreateTransactionException.class, () -> new TransactionTemplate(recovery)
                .execute(status -> { fail("Unsafe definition ran"); return null; }));
        assertTrue(connections.isEmpty());
    }

    @Test
    public void failedIsolationSetupClosesTheNewContextBeforeAnyBusinessCode() throws Exception {
        Connection broken = mock(Connection.class);
        when(broken.getTransactionIsolation()).thenReturn(Connection.TRANSACTION_READ_COMMITTED);
        doThrow(new SQLException("SIM isolation failure")).when(broken).setTransactionIsolation(Connection.TRANSACTION_REPEATABLE_READ);
        when(dataSource.getConnection()).thenReturn(broken);
        assertThrows(CannotCreateTransactionException.class, () -> recoveryRead().execute(status -> {
            fail("Isolation failure must prevent business code"); return null;
        }));
        verify(broken).close(); verify(broken, never()).setAutoCommit(false); verify(broken, never()).commit();
    }

    @Test
    public void failedBeginClosesConnectionWithoutEnteringRecovery() throws Exception {
        Connection broken = mock(Connection.class);
        when(broken.getAutoCommit()).thenReturn(true);
        when(broken.getTransactionIsolation()).thenReturn(Connection.TRANSACTION_READ_COMMITTED);
        doThrow(new SQLException("SIM begin failure")).when(broken).setAutoCommit(false);
        when(dataSource.getConnection()).thenReturn(broken);
        assertThrows(CannotCreateTransactionException.class, () -> recoveryRead().execute(status -> {
            fail("Begin failure must prevent business code"); return null;
        }));
        verify(broken).close(); verify(broken, never()).commit();
    }

    @Test
    public void unexpectedSessionModeClosesOnlyTheNewSessionAndPreservesOriginalFailure() {
        EntityManagerFactory proxy = mock(EntityManagerFactory.class);
        SessionFactory nativeFactory = mock(SessionFactory.class);
        SessionBuilder builder = mock(SessionBuilder.class);
        Session unexpected = mock(Session.class);
        when(proxy.unwrap(SessionFactory.class)).thenReturn(nativeFactory);
        when(nativeFactory.withOptions()).thenReturn(builder);
        when(builder.connectionHandlingMode(any())).thenReturn(builder);
        when(builder.openSession()).thenReturn(unexpected);
        doThrow(new IllegalStateException("SIM close failure")).when(unexpected).close();
        EntryRecoveryTransactionManager manager = new EntryRecoveryTransactionManager(proxy, dataSource);
        var failure = assertThrows(CannotCreateTransactionException.class, manager::createEntityManagerForTransaction);
        assertEquals(1, failure.getSuppressed().length);
        verify(unexpected).close(); verify(proxy, never()).close(); verify(nativeFactory, never()).close();
    }

    @Test
    public void proxiedFactoryRemainsTheResourceKey() {
        EntityManagerFactory proxy = mock(EntityManagerFactory.class);
        when(proxy.unwrap(SessionFactory.class)).thenReturn(factory);
        EntryRecoveryTransactionManager manager = new EntryRecoveryTransactionManager(proxy, dataSource);
        manager.afterPropertiesSet();
        TransactionTemplate template = recoveryRead(); template.setTransactionManager(manager);
        template.execute(status -> {
            assertTrue(TransactionSynchronizationManager.hasResource(proxy));
            assertFalse(TransactionSynchronizationManager.hasResource(factory));
            return null;
        });
        assertFalse(TransactionSynchronizationManager.hasResource(proxy));
    }

    @Test
    public void actualRecoveryEntrySelectsTheFreshConsistentReadManager() throws Exception {
        EntrySubmissionService target = new EntrySubmissionService();
        OrderEntryActorGuard actors = mock(OrderEntryActorGuard.class);
        ReflectionTestUtils.setField(target, "actors", actors);
        when(actors.bind(any())).thenAnswer(call -> { assertRecoveryContext(); throw new SimFailure(); });
        EntrySubmissionService proxy = proxy(target);
        assertThrows(SimFailure.class, () -> proxy.recover("SIM-boundary-only", new MockHttpServletRequest()));
        verify(actors).bind(any());
    }

    @Test
    public void actualRecoveryEntryNeverRunsInsideTheCallersPersistenceContext() throws Exception {
        EntrySubmissionService target = new EntrySubmissionService();
        OrderEntryActorGuard actors = mock(OrderEntryActorGuard.class);
        ReflectionTestUtils.setField(target, "actors", actors);
        new TransactionTemplate(ordinary).execute(outer -> {
            EntityManager previous = current();
            when(actors.bind(any())).thenAnswer(call -> {
                assertNotSame(previous, current()); assertRecoveryContext(); throw new SimFailure();
            });
            assertThrows(SimFailure.class, () -> proxy(target).recover("SIM-boundary-only", new MockHttpServletRequest()));
            assertSame(previous, current()); assertFalse(outer.isRollbackOnly()); return null;
        });
    }

    @Test
    public void checkedRecoveryFailureRollsBackAtTheActualEntry() throws Exception {
        EntrySubmissionService target = new EntrySubmissionService();
        OrderEntryActorGuard actors = mock(OrderEntryActorGuard.class);
        ReflectionTestUtils.setField(target, "actors", actors);
        java.io.IOException failure = new java.io.IOException("SIM checked read failure");
        when(actors.bind(any())).thenAnswer(call -> { assertRecoveryContext(); throw failure; });
        assertSame(failure, assertThrows(java.io.IOException.class,
                () -> proxy(target).recover("SIM-boundary-only", new MockHttpServletRequest())));
        verify(connections.get(0)).rollback(); verify(connections.get(0), never()).commit();
        verify(connections.get(0)).close();
    }

    @Test
    public void commitFailureCannotReturnSuccessAndRestoresOuterResources() throws Exception {
        AtomicReference<EntityManager> innerContext = new AtomicReference<>();
        new TransactionTemplate(ordinary).execute(outer -> {
            EntityManager previous = current();
            Object previousConnection = TransactionSynchronizationManager.getResource(dataSource);
            failNextCommit = true;
            assertThrows(RuntimeException.class, () -> recoveryRead().execute(inner -> {
                assertRecoveryContext(); innerContext.set(current()); return "SIM-must-not-return";
            }));
            assertFalse(innerContext.get().isOpen());
            assertSame(previous, current()); assertTrue(previous.isOpen());
            assertSame(previousConnection, TransactionSynchronizationManager.getResource(dataSource));
            assertFalse(outer.isRollbackOnly()); return null;
        });
        assertEquals(2, connections.size());
        verify(connections.get(0)).commit(); verify(connections.get(1)).commit();
        verify(connections.get(1)).setTransactionIsolation(Connection.TRANSACTION_READ_COMMITTED);
        verify(connections.get(1)).setReadOnly(false); verify(connections.get(1)).close();
    }

    @Test
    public void actualSubmitEntryKeepsTheOrdinaryWriteManager() throws Exception {
        EntrySubmissionService target = new EntrySubmissionService();
        OrderEntryActorGuard actors = mock(OrderEntryActorGuard.class);
        ReflectionTestUtils.setField(target, "actors", actors);
        when(actors.bind(any())).thenAnswer(call -> {
            assertFalse(TransactionSynchronizationManager.isCurrentTransactionReadOnly());
            assertNull(TransactionSynchronizationManager.getCurrentTransactionIsolationLevel());
            assertFalse(current().unwrap(Session.class).isDefaultReadOnly());
            throw new SimFailure();
        });
        assertThrows(SimFailure.class, () -> proxy(target).submit(null, null, new MockHttpServletRequest(), null));
        verify(connections.get(0), never()).setReadOnly(true);
        verify(connections.get(0), never()).setTransactionIsolation(anyInt());
        verify(connections.get(0)).rollback();
    }

    @Test
    public void actualRecoveryWithPreboundContextFailsBeforeCallingTheService() {
        EntityManager unrelated = mock(EntityManager.class);
        EntityManagerHolder holder = new EntityManagerHolder(unrelated);
        EntrySubmissionService target = new EntrySubmissionService();
        OrderEntryActorGuard actors = mock(OrderEntryActorGuard.class);
        ReflectionTestUtils.setField(target, "actors", actors);
        TransactionSynchronizationManager.bindResource(factory, holder);
        try {
            assertThrows(CannotCreateTransactionException.class,
                    () -> proxy(target).recover("SIM-boundary-only", new MockHttpServletRequest()));
            assertSame(holder, TransactionSynchronizationManager.getResource(factory));
            verifyZeroInteractions(actors);
            verify(unrelated, never()).clear(); verify(unrelated, never()).close();
        } finally {
            TransactionSynchronizationManager.unbindResource(factory);
        }
    }

    @Test public void actualCurrentEntryUsesNewReadOnlySnapshotAndRestoresCaller() {
        var target = new EntrySubmissionService(); var actors = mock(OrderEntryActorGuard.class);
        ReflectionTestUtils.setField(target, "actors", actors);
        new TransactionTemplate(ordinary).execute(outer -> {
            EntityManager previous = current();
            when(actors.bind(any())).thenAnswer(call -> {
                assertNotSame(previous, current()); assertRecoveryContext(); throw new SimFailure();
            });
            assertThrows(SimFailure.class, () -> proxy(target).recoverCurrent("SIM-boundary-only", new MockHttpServletRequest()));
            assertSame(previous, current()); assertFalse(outer.isRollbackOnly()); return null;
        });
    }

    @Test public void actualCurrentEntryRollsBackCheckedReadFailure() throws Exception {
        var target = new EntrySubmissionService(); var actors = mock(OrderEntryActorGuard.class);
        ReflectionTestUtils.setField(target, "actors", actors);
        var failure = new java.io.IOException("SIM current read failure");
        when(actors.bind(any())).thenAnswer(call -> { assertRecoveryContext(); throw failure; });
        assertSame(failure, assertThrows(java.io.IOException.class,
                () -> proxy(target).recoverCurrent("SIM-boundary-only", new MockHttpServletRequest())));
        verify(connections.get(0)).rollback(); verify(connections.get(0), never()).commit();
    }

    private EntrySubmissionService proxy(EntrySubmissionService target) {
        DefaultListableBeanFactory beans = new DefaultListableBeanFactory();
        beans.registerSingleton("transactionManager", ordinary);
        beans.registerSingleton(EntryRecoveryTransactionManager.BEAN_NAME, recovery);
        TransactionInterceptor advice = new TransactionInterceptor();
        advice.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        advice.setTransactionManagerBeanName("transactionManager");
        advice.setBeanFactory(beans);
        ProxyFactory proxy = new ProxyFactory(target); proxy.setProxyTargetClass(true); proxy.addAdvice(advice);
        return (EntrySubmissionService) proxy.getProxy();
    }

    private static class SimFailure extends RuntimeException { }
}
