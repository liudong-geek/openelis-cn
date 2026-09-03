package org.openelisglobal.report;

import static org.junit.Assert.assertNotNull;

import org.hibernate.SessionFactory;
import org.hibernate.boot.registry.StandardServiceRegistry;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.hibernate.cfg.Configuration;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;
import org.openelisglobal.report.valueholder.PatientReportRelease;

public class PatientReportReleaseHibernateMappingValidationTest {

    private static SessionFactory sessionFactory;
    private static StandardServiceRegistry registry;

    @BeforeClass
    public static void buildSessionFactory() {
        Configuration configuration = new Configuration();
        configuration.addAnnotatedClass(PatientReportRelease.class);
        configuration.setProperty("hibernate.dialect", "org.hibernate.dialect.PostgreSQLDialect");
        configuration.setProperty("hibernate.hbm2ddl.auto", "none");
        configuration.setProperty("hibernate.search.automatic_indexing.enabled", "false");
        registry = new StandardServiceRegistryBuilder().applySettings(configuration.getProperties()).build();
        sessionFactory = configuration.buildSessionFactory(registry);
    }

    @AfterClass
    public static void closeSessionFactory() {
        if (sessionFactory != null) {
            sessionFactory.close();
        }
        if (registry != null) {
            StandardServiceRegistryBuilder.destroy(registry);
        }
    }

    @Test
    public void patientReportReleaseMappingLoadsSuccessfully() {
        assertNotNull(sessionFactory);
        assertNotNull(sessionFactory.getMetamodel().entity(PatientReportRelease.class));
    }
}
