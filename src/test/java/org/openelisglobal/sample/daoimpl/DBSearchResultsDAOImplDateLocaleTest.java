package org.openelisglobal.sample.daoimpl;

import static org.junit.Assert.assertEquals;
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

public class DBSearchResultsDAOImplDateLocaleTest {

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
    public void formattedDob_convertsChineseInputForLegacyPatientRecords() {
        DBSearchResultsDAOImpl dao = new DBSearchResultsDAOImpl();

        assertEquals("03/05/2024",
                ReflectionTestUtils.invokeMethod(dao, "getFormatedDOB", "2024/03/05"));
        assertEquals("2024-03-05",
                ReflectionTestUtils.invokeMethod(dao, "getIsoDOB", "2024/03/05"));
    }

    @Test
    public void dateAlternatives_areGroupedBeforeOtherSearchPredicates() {
        DBSearchResultsDAOImpl dao = new DBSearchResultsDAOImpl();
        String query = ReflectionTestUtils.invokeMethod(dao, "buildQueryString",
                true, true, false, false, false, false, false, false, false, true, false);

        assertTrue(query.contains("(p.entered_birth_date ilike :dateOfBirth"
                + " or p.entered_birth_date ilike :dateOfBirthFormatted"
                + " or to_char(p.birth_date, 'YYYY-MM-DD') ilike :dateOfBirthIso)"));
    }

    @Test
    public void invalidDob_failsClosedBeforeExecutingSearch() {
        DBSearchResultsDAOImpl dao = new DBSearchResultsDAOImpl();

        assertTrue(dao.getSearchResults(null, null, null, null, null, null, null, null,
                "not-a-date", null).isEmpty());
        assertTrue(dao.getSearchResultsExact(null, null, null, null, null, null, null, null,
                "not-a-date", null).isEmpty());
        assertTrue(dao.getSearchResultsByGUID(null, null, null, null, null, null, null, null,
                "not-a-date", null).isEmpty());
    }
}
