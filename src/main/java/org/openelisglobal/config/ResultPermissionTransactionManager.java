package org.openelisglobal.config;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import javax.sql.DataSource;
import org.hibernate.ConnectionReleaseMode;
import org.hibernate.Session;
import org.hibernate.SessionFactory;
import org.hibernate.engine.spi.SessionImplementor;
import org.hibernate.resource.jdbc.spi.PhysicalConnectionHandlingMode;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.vendor.HibernateJpaDialect;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Fresh committed authorization reads without changing clinical transaction
 * isolation.
 */
public class ResultPermissionTransactionManager extends JpaTransactionManager {
    private static final long serialVersionUID = 1L;
    public static final String BEAN_NAME = "resultPermissionTransactionManager";

    public ResultPermissionTransactionManager(EntityManagerFactory factory, DataSource dataSource) {
        // Keep the original (possibly proxied) factory as the Spring resource key.
        setEntityManagerFactory(factory);
        setDataSource(dataSource);
        setJpaDialect(new HibernateJpaDialect());
    }

    @Override
    protected void doBegin(Object transaction, TransactionDefinition definition) {
        if (!definition.isReadOnly() || definition.getIsolationLevel() != TransactionDefinition.ISOLATION_READ_COMMITTED
                || definition.getPropagationBehavior() != TransactionDefinition.PROPAGATION_REQUIRES_NEW) {
            throw new CannotCreateTransactionException(
                    "Permission reads require a new read-only read-committed transaction");
        }
        // REQUIRES_NEW suspends active outer transactions, but not an OSIV-only
        // context.
        // Never clear, reuse or close an unrelated EntityManager and its pending
        // changes.
        if (TransactionSynchronizationManager.hasResource(obtainEntityManagerFactory())) {
            throw new CannotCreateTransactionException("Permission reads require a fresh persistence context");
        }
        super.doBegin(transaction, definition);
    }

    @Override
    protected EntityManager createEntityManagerForTransaction() {
        // Hibernate 5.6 applies createEntityManager(Map) properties after opening the
        // Session. Set HOLD on the builder so the isolation level can be reset before
        // releasing this connection. Do not alter the factory's global defaults.
        Session session = obtainEntityManagerFactory().unwrap(SessionFactory.class).withOptions()
                .connectionHandlingMode(PhysicalConnectionHandlingMode.DELAYED_ACQUISITION_AND_HOLD).openSession();
        try {
            if (!(session instanceof SessionImplementor implementation)
                    || implementation.getJdbcCoordinator().getLogicalConnection().getConnectionHandlingMode()
                            .getReleaseMode() != ConnectionReleaseMode.ON_CLOSE) {
                throw new CannotCreateTransactionException(
                        "Permission read connection must be held until context close");
            }
            return session;
        } catch (RuntimeException | Error failure) {
            // JpaTransactionManager owns it only after this method returns.
            try {
                session.close();
            } catch (RuntimeException | Error closeFailure) {
                failure.addSuppressed(closeFailure);
            }
            throw failure;
        }
    }
}
