package org.openelisglobal.common.util;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.exception.LIMSRuntimeException;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.validator.CustomDateValidator;
import org.openelisglobal.spring.util.SpringContext;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.test.util.ReflectionTestUtils;

public class DateUtilLocaleTest {

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
    public void getDateFormatForLocale_usesStablePatternsForSupportedLocales() {
        assertEquals("MM/dd/yyyy", DateUtil.getDateFormatForLocale(Locale.forLanguageTag("en-US")));
        assertEquals("dd/MM/yyyy", DateUtil.getDateFormatForLocale(Locale.forLanguageTag("fr-FR")));
        assertEquals("yyyy/MM/dd", DateUtil.getDateFormatForLocale(Locale.forLanguageTag("zh-CN")));
        assertEquals("yyyy/MM/dd", DateUtil.getDateFormatForLocale(Locale.forLanguageTag("zh-Hans-CN")));

        dateLocale.set("zh_CN");
        assertEquals("yyyy/MM/dd", DateUtil.getDateFormat());
    }

    @Test
    public void legacyFormatStringDate_keepsUsFirstParsingForAmbiguousInput() {
        assertEquals("05/03/2024", DateUtil.formatStringDate("03/05/2024", "dd/MM/yyyy"));
    }

    @Test
    public void formatStringDate_acceptsIsoAndLocalizedInputs_withoutChangingLocaleMeaning() {
        assertEquals("03/05/2024",
                DateUtil.formatStringDate("2024-03-05", Locale.forLanguageTag("en-US")));
        assertEquals("05/03/2024",
                DateUtil.formatStringDate("05/03/2024", Locale.forLanguageTag("fr-FR")));
        assertEquals("2024/03/05",
                DateUtil.formatStringDate("2024/03/05", Locale.forLanguageTag("zh-CN")));
    }

    @Test
    public void parseLocalDate_prefersTheSuppliedLocaleForAmbiguousSlashDates() {
        assertEquals(LocalDate.of(2024, 3, 5),
                DateUtil.parseLocalDate("03/05/2024", Locale.forLanguageTag("en-US")));
        assertEquals(LocalDate.of(2024, 5, 3),
                DateUtil.parseLocalDate("03/05/2024", Locale.forLanguageTag("fr-FR")));
        assertEquals(LocalDate.of(2024, 3, 5),
                DateUtil.parseLocalDate("2024/03/05", Locale.forLanguageTag("zh-CN")));
    }

    @Test
    public void legacySearchFormat_preservesTheMeaningOfLocalizedInput() {
        assertEquals("05/03/2024",
                DateUtil.formatStringDateForLegacySearch("03/05/2024", Locale.forLanguageTag("en-US")));
        assertEquals("05/03/2024",
                DateUtil.formatStringDateForLegacySearch("03/05/2024", Locale.forLanguageTag("fr-FR")));
        assertEquals("03/05/2024",
                DateUtil.formatStringDateForLegacySearch("2024/03/05", Locale.forLanguageTag("zh-CN")));
    }

    @Test
    public void explicitLocaleSqlConversion_acceptsChineseYearFirstDate() {
        assertEquals(LocalDate.of(2024, 3, 5),
                DateUtil.convertStringDateToSqlDate("2024/03/05", "zh_CN").toLocalDate());
        assertEquals("2024-03-05",
                DateUtil.formatStringDate("2024/03/05", Locale.forLanguageTag("zh-CN"), "yyyy-MM-dd"));
    }

    @Test
    public void timestampConversion_usesTheConfiguredChineseDateOrder() {
        assertEquals("yyyy/MM/dd HH:mm", DateUtil.getDateTimeFormat());
        assertEquals(LocalDateTime.of(2026, 8, 29, 13, 20),
                DateUtil.convertStringDateToTimestamp("2026/08/29 13:20").toLocalDateTime());
    }

    @Test
    public void ambiguousDateConversion_acceptsChineseDisplayAndLegacyStoredDates() {
        Timestamp chineseDisplayDate = DateUtil.convertAmbiguousStringDateToTimestamp("1990/01/31");
        Timestamp legacyUsDate = DateUtil.convertAmbiguousStringDateToTimestamp("01/31/1990");
        Timestamp legacyFrenchDate = DateUtil.convertAmbiguousStringDateToTimestamp("31/01/1990");

        assertEquals(LocalDate.of(1990, 1, 31), chineseDisplayDate.toLocalDateTime().toLocalDate());
        assertEquals(LocalDate.of(1990, 1, 31), legacyUsDate.toLocalDateTime().toLocalDate());
        assertEquals(LocalDate.of(1990, 1, 31), legacyFrenchDate.toLocalDateTime().toLocalDate());
    }

    @Test
    public void ambiguousDateConversion_returnsNullForMissingDates() {
        assertEquals(null, DateUtil.convertAmbiguousStringDateToTimestamp(null));
        assertEquals(null, DateUtil.convertAmbiguousStringDateToTimestamp(""));
    }

    @Test(expected = LIMSRuntimeException.class)
    public void timestampConversion_rejectsDatesThatDoNotMatchTheConfiguredOrder() {
        DateUtil.convertStringDateToTimestamp("08/29/2026 13:20");
    }

    @Test
    public void customValidator_usesTheSameFixedWidthChinesePattern() {
        CustomDateValidator validator = CustomDateValidator.getInstance();

        assertTrue(validator.isValid("2024/03/05", Locale.forLanguageTag("zh-CN")));
        assertFalse(validator.isValid("2024/3/5", Locale.forLanguageTag("zh-CN")));
        assertFalse(validator.isValid("2024/02/30", Locale.forLanguageTag("zh-CN")));
        assertTrue(validator.isValid("03/05/2024", Locale.forLanguageTag("en-US")));
        assertTrue(validator.isValid("05/03/2024", Locale.forLanguageTag("fr-FR")));
    }
}
