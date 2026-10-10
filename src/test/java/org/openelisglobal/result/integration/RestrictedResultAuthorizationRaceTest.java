package org.openelisglobal.result.integration;

import static org.junit.Assert.*;
import static org.mockito.Mockito.when;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.PersistenceContext;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import javax.sql.DataSource;
import org.hibernate.ConnectionReleaseMode;
import org.hibernate.Session;
import org.hibernate.SessionFactory;
import org.hibernate.engine.jdbc.connections.internal.DriverManagerConnectionProviderImpl;
import org.hibernate.engine.jdbc.connections.spi.ConnectionProvider;
import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.hibernate.engine.spi.SessionImplementor;
import org.hibernate.resource.jdbc.spi.LogicalConnectionImplementor;
import org.hibernate.resource.jdbc.spi.PhysicalConnectionHandlingMode;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.common.util.DefaultConfigurationProperties.OEProperties;
import org.openelisglobal.common.util.DefaultConfigurationProperties.PropertyHolder;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.config.ResultPermissionTransactionManager;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.result.dao.ResultRestrictionDAO;
import org.openelisglobal.result.form.ResultRestrictionRequest;
import org.openelisglobal.result.service.ResultRestrictionAccess;
import org.openelisglobal.result.service.ResultRestrictionAccess.Action;
import org.openelisglobal.result.service.ResultRestrictionAccess.Phase;
import org.openelisglobal.result.service.ResultRestrictionService;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.test.valueholder.TestSection;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.vendor.HibernateJpaDialect;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.core.userdetails.User;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Actual two-connection PostgreSQL revocations, not simulated clinical or
 * permission state.
 */
public class RestrictedResultAuthorizationRaceTest extends BaseWebContextSensitiveTest {
    private static final int ACTOR = 97201;
    private static final int LAB_MAP = -197201;
    private static final int USER_GRANT = -197202;
    private static final String LOGIN = "race-results";
    @Autowired
    private DataSource dataSource;
    @Autowired
    private EntityManagerFactory factory;
    @Autowired
    @Qualifier("transactionManager")
    private org.springframework.transaction.PlatformTransactionManager transactions;
    @Autowired
    private ResultPermissionTransactionManager permissionTransactions;
    @Autowired
    private ResultRestrictionAccess access;
    @Autowired
    private ResultRestrictionService restrictions;
    @Autowired
    private ResultRestrictionDAO dao;
    @Autowired
    private IStatusService statuses;
    @Autowired
    private TestSectionService sections;
    @Autowired
    private DisplayListService displayLists;
    @PersistenceContext
    private EntityManager em;
    private JdbcTemplate jdbc;
    private OEProperties properties;
    private PropertyHolder modeBefore;
    private Object displayBefore;
    private String roleId;
    private int moduleId;
    private List<Map<String, Object>> grantsBefore;
    private boolean roleActiveBefore;
    private MockHttpServletRequest request;

    @Before
    public void fixture() throws Exception {
        executeDataSetWithStateManagement("testdata/sample-management-status-contract.xml");
        jdbc = new JdbcTemplate(dataSource);
        statuses.refreshCache();
        properties = (OEProperties) ReflectionTestUtils.getField(ConfigurationProperties.getInstance(),
                "finalProperties");
        modeBefore = properties.getPropertyHolder("permissions.agent");
        properties.setPropertyValue("permissions.agent", "ROLE");
        roleId = jdbc.queryForObject(
                "select id::text from clinlims.system_role where btrim(name)='Results' and active=true order by id limit 1",
                String.class);
        moduleId = jdbc.queryForObject("select id from clinlims.system_module where name='LogbookResults'",
                Integer.class);
        roleActiveBefore = jdbc.queryForObject("select active from clinlims.system_role where id=?::numeric",
                Boolean.class, roleId);
        grantsBefore = jdbc.queryForList(
                "select * from clinlims.system_role_module where system_role_id=?::numeric and system_module_id=?",
                roleId, moduleId);
        assertFalse("An actual configured Results grant is required", grantsBefore.isEmpty());
        assertEquals("Y", jdbc.queryForObject("select has_select_flag from clinlims.system_module where id=?",
                String.class, moduleId));
        assertEquals("Y", jdbc.queryForObject("select has_update_flag from clinlims.system_module where id=?",
                String.class, moduleId));
        seedActor();
        // BaseWebContextSensitiveTest mocks only this display cache. Its values here
        // come from actual persisted sections; identity/grants/lab bindings are real.
        displayBefore = DisplayListService.getInstance();
        when(displayLists.getList(DisplayListService.ListType.TEST_SECTION_ACTIVE))
                .thenReturn(sections.getAllActiveTestSections().stream()
                        .map(s -> new IdValuePair(s.getId(), s.getLocalizedName())).toList());
        ReflectionTestUtils.setField(DisplayListService.class, "instance", displayLists);
        new TransactionTemplate(transactions).execute(s -> {
            var a = em.find(Analysis.class, "1");
            a.setTestSection(em.find(TestSection.class, "1"));
            em.flush();
            return null;
        });
        request = authenticate();
    }

    @After
    public void restore() {
        try {
            if (jdbc != null && roleId != null) {
                jdbc.update("update clinlims.system_role set active=? where id=?::numeric", roleActiveBefore, roleId);
                if (grantsBefore != null)
                    for (var row : grantsBefore)
                        jdbc.update("update clinlims.system_role_module set has_select=?,has_update=? where id=?",
                                row.get("has_select"), row.get("has_update"), row.get("id"));
                jdbc.update("update clinlims.system_user set is_active='Y' where id=?", ACTOR);
                jdbc.update("delete from clinlims.system_user_module where id=?", USER_GRANT);
            }
            if (properties != null) {
                if (modeBefore == null)
                    properties.stringPropertyNames().remove("permissions.agent");
                else
                    properties.setPropertyHolder("permissions.agent", modeBefore);
            }
            org.mockito.Mockito.reset(displayLists);
            if (displayBefore != null)
                ReflectionTestUtils.setField(DisplayListService.class, "instance", displayBefore);
        } finally {
            SecurityContextHolder.clearContext();
            RequestContextHolder.resetRequestAttributes();
        }
    }

    @Test
    public void roleSelectRevokedAfterBindIsVisibleBeyondRepeatableReadSnapshot() {
        race("ROLE", Action.SELECT, TransactionDefinition.ISOLATION_REPEATABLE_READ,
                "select has_select from clinlims.system_role_module where id=" + grantsBefore.get(0).get("id"),
                "update clinlims.system_role_module set has_select='N' where system_role_id=?::numeric and system_module_id=?",
                roleId, moduleId);
    }

    @Test
    public void roleUpdateRevokedAfterBindRollsBackSerializableClinicalCandidate() {
        race("ROLE", Action.UPDATE, TransactionDefinition.ISOLATION_SERIALIZABLE,
                "select has_update from clinlims.system_role_module where id=" + grantsBefore.get(0).get("id"),
                "update clinlims.system_role_module set has_update='N' where system_role_id=?::numeric and system_module_id=?",
                roleId, moduleId);
    }

    @Test
    public void userSelectRevokedAfterBindIsVisibleBeyondRepeatableReadSnapshot() {
        race("USER", Action.SELECT, TransactionDefinition.ISOLATION_REPEATABLE_READ,
                "select has_select from clinlims.system_user_module where id=" + USER_GRANT,
                "update clinlims.system_user_module set has_select='N' where id=?", USER_GRANT);
    }

    @Test
    public void userUpdateRevokedAfterBindRollsBackSerializableClinicalCandidate() {
        race("USER", Action.UPDATE, TransactionDefinition.ISOLATION_SERIALIZABLE,
                "select has_update from clinlims.system_user_module where id=" + USER_GRANT,
                "update clinlims.system_user_module set has_update='N' where id=?", USER_GRANT);
    }

    @Test
    public void actorInactivatedAfterBindRollsBackClinicalCandidate() {
        race("ROLE", Action.UPDATE, TransactionDefinition.ISOLATION_SERIALIZABLE,
                "select is_active from clinlims.system_user where id=" + ACTOR,
                "update clinlims.system_user set is_active='N' where id=?", ACTOR);
    }

    @Test
    public void roleInactivatedAfterBindRollsBackClinicalCandidate() {
        race("ROLE", Action.UPDATE, TransactionDefinition.ISOLATION_SERIALIZABLE,
                "select active from clinlims.system_role where id=" + roleId,
                "update clinlims.system_role set active=false where id=?::numeric", roleId);
    }

    @Test
    public void labScopeRemovedAfterBindIsNotReadFromOldSnapshot() {
        race("ROLE", Action.SELECT, TransactionDefinition.ISOLATION_REPEATABLE_READ,
                "select count(*) from clinlims.lab_roles where lab_unit_role_map_id=" + LAB_MAP,
                "delete from clinlims.lab_roles where lab_unit_role_map_id=?", LAB_MAP);
    }

    @Test
    public void forPhaseRechecksCommittedUpdateGrantWithoutReplacingBoundActor() {
        properties.setPropertyValue("permissions.agent", "USER");
        var before = snapshot();
        held(TransactionDefinition.ISOLATION_REPEATABLE_READ).execute(s -> {
            var scope = access.bind(request, Phase.RESULTS, Action.SELECT);
            assertEquals("Y", scalar("select has_update from clinlims.system_user_module where id=" + USER_GRANT));
            commitElsewhere("update clinlims.system_user_module set has_update='N' where id=?", USER_GRANT);
            assertEquals("Y", scalar("select has_update from clinlims.system_user_module where id=" + USER_GRANT));
            assertThrows(AccessDeniedException.class,
                    () -> access.forPhase(request, scope, Phase.RESULTS, Action.UPDATE));
            s.setRollbackOnly();
            return null;
        });
        assertEquals(before, snapshot());
    }

    @Test
    public void initialBindUsesFreshCommitEvenWhenClinicalSnapshotPredatesRevocation() {
        var before = snapshot();
        held(TransactionDefinition.ISOLATION_REPEATABLE_READ).execute(s -> {
            String q = "select is_active from clinlims.system_user where id=" + ACTOR;
            assertEquals("Y", scalar(q));
            commitElsewhere("update clinlims.system_user set is_active='N' where id=?", ACTOR);
            assertEquals("Y", scalar(q));
            assertThrows(AccessDeniedException.class, () -> access.bind(request, Phase.RESULTS, Action.SELECT));
            s.setRollbackOnly();
            return null;
        });
        assertEquals(before, snapshot());
    }

    @Test
    public void permissionReadHoldsItsOwnReadCommittedContextAndRestoresOuterContext() {
        var template = new TransactionTemplate(permissionTransactions);
        template.setReadOnly(true);
        template.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        template.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        AtomicReference<Connection> connection = new AtomicReference<>();
        AtomicReference<Integer> originalIsolation = new AtomicReference<>();
        AtomicReference<Session> permissionContext = new AtomicReference<>();
        AtomicReference<LogicalConnectionImplementor> ownedConnection = new AtomicReference<>();
        held(TransactionDefinition.ISOLATION_SERIALIZABLE).execute(s -> {
            int outerPid = pid();
            var outer = em.unwrap(Session.class);
            var bound = access.bind(request, Phase.RESULTS, Action.SELECT);
            var pending = em.find(Analysis.class, "1");
            pending.setStatusId("13");
            int hooks = TransactionSynchronizationManager.getSynchronizations().size();
            template.execute(read -> {
                var current = em.unwrap(Session.class);
                permissionContext.set(current);
                ownedConnection.set(((SessionImplementor) current).getJdbcCoordinator().getLogicalConnection());
                assertNotSame(outer, current);
                assertNotEquals(outerPid, pid());
                assertEquals(ConnectionReleaseMode.ON_CLOSE, ((SessionImplementor) current).getJdbcCoordinator()
                        .getLogicalConnection().getConnectionHandlingMode().getReleaseMode());
                assertTrue("Observe the actual Spring transaction cleanup record",
                        read instanceof DefaultTransactionStatus);
                Object transactionData = ReflectionTestUtils
                        .getField(((DefaultTransactionStatus) read).getTransaction(), "transactionData");
                assertNotNull("The actual permission transaction must retain its cleanup data", transactionData);
                assertSame("Cleanup data belongs to the permission persistence context", current,
                        ReflectionTestUtils.getField(transactionData, "session"));
                assertEquals("Held permission connections require cleanup", Boolean.TRUE,
                        ReflectionTestUtils.getField(transactionData, "needsConnectionReset"));
                Object previousIsolation = ReflectionTestUtils.getField(transactionData, "previousIsolationLevel");
                assertTrue("Original isolation is a JDBC level or unchanged",
                        previousIsolation == null || previousIsolation instanceof Integer);
                current.doWork(c -> {
                    assertEquals(Connection.TRANSACTION_READ_COMMITTED, c.getTransactionIsolation());
                    // Spring records the borrowed connection's original level when it changes
                    // it. A null record means this connection already had the requested RC level.
                    originalIsolation
                            .set(previousIsolation == null ? c.getTransactionIsolation() : (Integer) previousIsolation);
                    connection.set(c);
                });
                assertTrue(TransactionSynchronizationManager.isCurrentTransactionReadOnly());
                return null;
            });
            assertSame(outer, em.unwrap(Session.class));
            assertEquals(outerPid, pid());
            assertEquals("SERIALIZABLE", scalar("select upper(current_setting('transaction_isolation'))"));
            access.requireUnchanged(request, bound);
            assertEquals(hooks, TransactionSynchronizationManager.getSynchronizations().size());
            assertSame(pending, em.find(Analysis.class, "1"));
            assertEquals("13", pending.getStatusId());
            try (var check = dataSource.getConnection();
                    var st = check.createStatement();
                    var row = st.executeQuery("select status_id::text from clinlims.analysis where id=1")) {
                assertTrue(row.next());
                assertEquals("Fresh permissions never flush or clear the pending clinical candidate", "10",
                        row.getString(1));
            } catch (java.sql.SQLException failure) {
                throw new IllegalStateException(failure);
            }
            // The test persistence unit uses Hibernate's built-in JDBC pool.
            // Its closeConnection returns the raw physical connection to that pool;
            // raw Connection.isClosed() therefore does not express Session ownership.
            assertFalse("Owned permission persistence context closes", permissionContext.get().isOpen());
            assertFalse("Owned logical connection closes", ownedConnection.get().isOpen());
            assertFalse("Closed permission context no longer owns its physical connection",
                    ownedConnection.get().isPhysicallyConnected());
            var provider = factory.unwrap(SessionFactoryImplementor.class).getServiceRegistry()
                    .getService(ConnectionProvider.class);
            assertTrue("Observe the actual JDBC pool selected by test-hibernate.cfg.xml",
                    provider instanceof DriverManagerConnectionProviderImpl);
            var poolState = ReflectionTestUtils.getField(provider, "state");
            var pool = ReflectionTestUtils.getField(poolState, "pool");
            var available = ReflectionTestUtils.getField(pool, "availableConnections");
            assertTrue(available instanceof java.util.Collection<?>);
            assertTrue("The exact owned physical connection has been released to the actual pool",
                    ((java.util.Collection<?>) available).stream().anyMatch(c -> c == connection.get()));
            try {
                assertEquals("The borrowed connection's recorded isolation is restored before pool return",
                        originalIsolation.get().intValue(), connection.get().getTransactionIsolation());
                assertFalse("Permission read-only state does not leak to the next borrower",
                        connection.get().isReadOnly());
                assertTrue("The pool has completed its release cleanup", connection.get().getAutoCommit());
            } catch (java.sql.SQLException failure) {
                throw new IllegalStateException(failure);
            }
            s.setRollbackOnly();
            return null;
        });
        template.setReadOnly(false);
        assertThrows(CannotCreateTransactionException.class, () -> template.execute(s -> null));
    }

    @Test
    public void proxyDiagnosisUsesCurrentStatusNameAndActiveWithoutRefreshingGlobalCache() {
        assertTrue("Inspect must cross the actual service transaction proxy", AopUtils.isAopProxy(restrictions));
        var q = query();
        var original = restrictions.inspect(q, request);
        assertTrue(original.specimenStatus().known());
        assertTrue(original.analysisStatus().known());
        var before = snapshot();
        for (String name : List.of("Unknown current name", "Sample Rejected")) {
            commitElsewhere("update clinlims.status_of_sample set name=? where id=12", name);
            var value = restrictions.inspect(q, request);
            assertFalse(value.specimenStatus().known());
            assertNull(value.specimenStatus().statusCode());
            assertEquals(name, value.specimenStatus().statusName());
        }
        commitElsewhere("update clinlims.status_of_sample set name='SampleEntered',is_active='N' where id=12");
        assertFalse(restrictions.inspect(q, request).specimenStatus().known());
        commitElsewhere("update clinlims.status_of_sample set is_active='Y',code='999' where id=12");
        assertEquals("Entered", restrictions.inspect(q, request).specimenStatus().statusCode());
        commitElsewhere("update clinlims.status_of_sample set status_type='ORDER' where id=12");
        assertFalse(restrictions.inspect(q, request).specimenStatus().known());
        commitElsewhere("update clinlims.status_of_sample set name='Finalized' where id=10");
        assertFalse(restrictions.inspect(q, request).analysisStatus().known());
        assertEquals("Diagnostics do not write clinical state or refresh its admission rules", before, snapshot());
    }

    private void race(String mode, Action action, int isolation, String staleQuery, String revokeSql, Object... args) {
        properties.setPropertyValue("permissions.agent", mode);
        var before = snapshot();
        AtomicReference<ResultRestrictionAccess.Scope> bound = new AtomicReference<>();
        assertThrows(AccessDeniedException.class, () -> held(isolation).execute(s -> {
            Object oldValue = scalar(staleQuery); // pins the clinical RR/SERIALIZABLE snapshot
            int outerPid = pid();
            var outer = em.unwrap(Session.class);
            int oldHooks = TransactionSynchronizationManager.getSynchronizations().size();
            bound.set(access.bind(request, Phase.RESULTS, action));
            assertEquals("Only the facade registers its outer clinical callback", oldHooks + 1,
                    TransactionSynchronizationManager.getSynchronizations().size());
            assertSame(outer, em.unwrap(Session.class));
            int writerPid = commitElsewhere(revokeSql, args);
            assertNotEquals("Revocation must commit on a second simultaneous database connection", outerPid, writerPid);
            assertEquals("The clinical snapshot deliberately remains old", oldValue, scalar(staleQuery));
            assertSame(outer, em.unwrap(Session.class));
            if (action == Action.UPDATE) {
                // A real managed clinical candidate is flushed before commit. Only
                // the fresh permission callback prevents it from being committed.
                em.find(Analysis.class, "1").setStatusId("13");
                em.flush();
            }
            return null; // Access.beforeCommit must read the committed revocation.
        }));
        assertNotNull("The revocation occurred after a successful bind", bound.get());
        assertEquals("Every clinical version/association/audit/report row is preserved", before, snapshot());
    }

    private TransactionTemplate held(int isolation) {
        JpaTransactionManager manager = new JpaTransactionManager(factory) {
            @Override
            protected EntityManager createEntityManagerForTransaction() {
                return factory.unwrap(SessionFactory.class).withOptions()
                        .connectionHandlingMode(PhysicalConnectionHandlingMode.DELAYED_ACQUISITION_AND_HOLD)
                        .openSession();
            }
        };
        manager.setDataSource(dataSource);
        manager.setJpaDialect(new HibernateJpaDialect());
        var template = new TransactionTemplate(manager);
        template.setIsolationLevel(isolation);
        template.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        return template;
    }

    private Object scalar(String sql) {
        return em.createNativeQuery(sql).getSingleResult();
    }

    private int pid() {
        return ((Number) scalar("select pg_backend_pid()")).intValue();
    }

    private int commitElsewhere(String sql, Object... args) {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            c.setTransactionIsolation(Connection.TRANSACTION_READ_COMMITTED);
            int pid;
            try (var st = c.createStatement(); var row = st.executeQuery("select pg_backend_pid()")) {
                assertTrue(row.next());
                pid = row.getInt(1);
            }
            try (PreparedStatement st = c.prepareStatement(sql)) {
                for (int i = 0; i < args.length; i++)
                    st.setObject(i + 1, args[i]);
                assertTrue("Expected actual committed configuration update", st.executeUpdate() > 0);
            }
            c.commit();
            return pid;
        } catch (java.sql.SQLException failure) {
            throw new IllegalStateException(failure);
        }
    }

    private ResultRestrictionRequest query() {
        return new TransactionTemplate(transactions).execute(s -> {
            var current = dao.findAnalysis("1").orElseThrow();
            return new ResultRestrictionRequest("1", "1", "1", "24-00001",
                    Long.toString(current.analysisVersion().getTime()));
        });
    }

    private Map<String, Object> snapshot() {
        Map<String, Object> result = new LinkedHashMap<>();
        for (String table : List.of("sample", "sample_item", "analysis", "sample_type_request", "result",
                "specimen_intake_decision", "note", "history", "barcode_label_info", "report_document",
                "patient_report_release", "electronic_signature", "his_result_outbox", "provider", "patient",
                "sample_human")) {
            result.put(table,
                    jdbc.queryForList(
                            "select row_to_json(x)::text from (select * from clinlims." + table + " order by 1) x",
                            String.class));
        }
        return result;
    }

    private void seedActor() {
        jdbc.update("delete from clinlims.lab_unit_roles where system_user_id=? or lab_unit_role_map_id=?", ACTOR,
                LAB_MAP);
        jdbc.update("delete from clinlims.lab_roles where lab_unit_role_map_id=?", LAB_MAP);
        jdbc.update("delete from clinlims.lab_unit_role_map where lab_unit_role_map_id=?", LAB_MAP);
        jdbc.update("delete from clinlims.system_user_role where system_user_id=?", ACTOR);
        jdbc.update("delete from clinlims.system_user_module where id=?", USER_GRANT);
        jdbc.update(
                "insert into clinlims.system_user (id,external_id,login_name,last_name,first_name,initials,is_active,is_employee,lastupdated) values (?,'RACE-RESULTS',?,'Race','Actor','RA','Y','Y',now()) on conflict(id) do update set login_name=excluded.login_name,is_active='Y'",
                ACTOR, LOGIN);
        jdbc.update(
                "insert into clinlims.login_user (id,login_name,password,password_expired_dt,account_locked,account_disabled,is_admin,user_time_out) values (?,?,'test-only',date '2036-01-01','N','N','N','220') on conflict(id) do update set login_name=excluded.login_name,account_locked='N',account_disabled='N'",
                ACTOR, LOGIN);
        jdbc.update("insert into clinlims.system_user_role(system_user_id,role_id) values (?,?::numeric)", ACTOR,
                roleId);
        jdbc.update(
                "insert into clinlims.user_lab_unit_roles(system_user_id,last_updated) values (?,now()) on conflict(system_user_id) do update set last_updated=now()",
                ACTOR);
        jdbc.update("insert into clinlims.lab_unit_role_map(lab_unit_role_map_id,lab_unit) values (?,'1')", LAB_MAP);
        jdbc.update("insert into clinlims.lab_unit_roles(system_user_id,lab_unit_role_map_id) values (?,?)", ACTOR,
                LAB_MAP);
        jdbc.update("insert into clinlims.lab_roles(lab_unit_role_map_id,role) values (?,?)", LAB_MAP, roleId);
        jdbc.update(
                "insert into clinlims.system_user_module(id,system_user_id,system_module_id,has_select,has_update,has_add,has_delete) values (?,?,?,'Y','Y','N','N')",
                USER_GRANT, ACTOR, moduleId);
    }

    private MockHttpServletRequest authenticate() {
        var principal = User.withUsername(LOGIN).password("unused").roles("RESULTS").build();
        var authentication = new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
        var context = new SecurityContextImpl(authentication);
        SecurityContextHolder.setContext(context);
        var user = new UserSessionData();
        user.setSytemUserId(ACTOR);
        user.setLoginName(LOGIN);
        user.setLoginLabUnit(0);
        var request = new MockHttpServletRequest();
        request.getSession().setAttribute("SPRING_SECURITY_CONTEXT", context);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, user);
        request.setAttribute(IActionConstants.USER_SESSION_DATA, user);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        return request;
    }
}
