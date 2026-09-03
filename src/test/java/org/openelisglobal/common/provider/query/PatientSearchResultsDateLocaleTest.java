package org.openelisglobal.common.provider.query;

import static org.junit.Assert.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.concurrent.atomic.AtomicReference;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DateUtil;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.spring.util.SpringContext;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.test.util.ReflectionTestUtils;

public class PatientSearchResultsDateLocaleTest {

    private AutowireCapableBeanFactory previousFactory;
    private final AtomicReference<String> dateLocale = new AtomicReference<>("zh-CN");

    @Before
    public void setUp() {
        previousFactory = (AutowireCapableBeanFactory) ReflectionTestUtils.getField(SpringContext.class, "factory");
        AutowireCapableBeanFactory beanFactory = mock(AutowireCapableBeanFactory.class);
        DefaultConfigurationProperties configuration = mock(DefaultConfigurationProperties.class);
        when(beanFactory.getBean(DefaultConfigurationProperties.class)).thenReturn(configuration);
        when(configuration.getPropertyValue(Property.DEFAULT_DATE_LOCALE)).thenAnswer(ignored -> dateLocale.get());
        when(configuration.getPropertyValue(Property.AmbiguousDateHolder)).thenReturn("X");
        ReflectionTestUtils.setField(SpringContext.class, "factory", beanFactory);
    }

    @After
    public void tearDown() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", previousFactory);
    }

    @Test
    public void birthDateOutput_followsConfiguredChineseEnglishAndFrenchPatterns() {
        PatientSearchResults result = new PatientSearchResults();
        result.setBirthdate("2024-03-05");

        assertEquals("2024/03/05", result.getBirthdate());

        dateLocale.set("en-US");
        assertEquals("03/05/2024", result.getBirthdate());

        dateLocale.set("fr-FR");
        assertEquals("05/03/2024", result.getBirthdate());
    }

    @Test
    public void configuredChineseDate_isAcceptedByCorePatientDateParser() {
        assertEquals(java.time.LocalDate.of(2024, 3, 5),
                DateUtil.convertAmbiguousStringDateToTimestamp("2024/03/05")
                        .toLocalDateTime().toLocalDate());
    }
}
