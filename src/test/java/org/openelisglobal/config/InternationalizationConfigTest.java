package org.openelisglobal.config;

import static org.junit.Assert.assertEquals;

import java.util.Locale;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.internationalization.MessageUtil;
import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContext;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

public class InternationalizationConfigTest {

    private Locale previousDefaultLocale;
    private LocaleContext previousLocaleContext;
    private Object previousMessageUtilInstance;
    private MessageSource messageSource;

    @Before
    public void setUp() {
        previousDefaultLocale = Locale.getDefault();
        previousLocaleContext = LocaleContextHolder.getLocaleContext();
        previousMessageUtilInstance = ReflectionTestUtils.getField(MessageUtil.class, "instance");
        messageSource = new InternationalizationConfig().messageSource();
    }

    @After
    public void restoreLocales() {
        try {
            ReflectionTestUtils.setField(MessageUtil.class, "instance", previousMessageUtilInstance);
        } finally {
            try {
                Locale.setDefault(previousDefaultLocale);
            } finally {
                LocaleContextHolder.setLocaleContext(previousLocaleContext);
            }
        }
    }

    @Test
    public void translatedChineseEntryUsesChineseCatalog() {
        LocaleContextHolder.setLocale(Locale.SIMPLIFIED_CHINESE);

        assertEquals("结果已定稿", message("status.test.valid"));
    }

    @Test
    public void missingChineseEntryFallsBackToCompleteEnglishCatalog() {
        Locale.setDefault(Locale.FRENCH);
        LocaleContextHolder.setLocale(Locale.SIMPLIFIED_CHINESE);

        assertEquals("Save", message("label.button.save"));
    }

    @Test
    public void unknownLocaleStillFallsBackToEnglishWhenJvmDefaultChanges() {
        Locale.setDefault(Locale.FRENCH);
        LocaleContextHolder.setLocale(Locale.forLanguageTag("zz-ZZ"));

        assertEquals("Save", message("label.button.save"));
    }

    private String message(String key) {
        return messageSource.getMessage(key, null, LocaleContextHolder.getLocale());
    }
}
