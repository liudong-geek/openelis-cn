package org.openelisglobal.patient.validator;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.spring.util.SpringContext;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.test.util.ReflectionTestUtils;

public class ValidatePatientInfoLocaleTest {

    private AutowireCapableBeanFactory previousFactory;

    @Before
    public void setUp() {
        previousFactory = (AutowireCapableBeanFactory) ReflectionTestUtils.getField(SpringContext.class, "factory");
        AutowireCapableBeanFactory beanFactory = mock(AutowireCapableBeanFactory.class);
        DefaultConfigurationProperties configuration = mock(DefaultConfigurationProperties.class);
        when(beanFactory.getBean(DefaultConfigurationProperties.class)).thenReturn(configuration);
        when(configuration.getPropertyValue(Property.DEFAULT_DATE_LOCALE)).thenReturn("zh-CN");
        when(configuration.getPropertyValue(Property.AmbiguousDateHolder)).thenReturn("X");
        ReflectionTestUtils.setField(SpringContext.class, "factory", beanFactory);
    }

    @After
    public void tearDown() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", previousFactory);
    }

    @Test
    public void acceptsChinesePatientSearchDateAndSupportedStoredDates() {
        assertTrue(ValidatePatientInfo.isValidBirthDateFormat("1990/01/01"));
        assertTrue(ValidatePatientInfo.isValidBirthDateFormat("1990-01-01"));
    }

    @Test
    public void rejectsImpossibleAndNonFixedWidthDates() {
        assertFalse(ValidatePatientInfo.isValidBirthDateFormat("1990/02/30"));
        assertFalse(ValidatePatientInfo.isValidBirthDateFormat("1990/1/1"));
    }
}
