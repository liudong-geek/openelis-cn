package org.openelisglobal.common.management.controller.rest;

import static org.junit.Assert.assertEquals;

import java.util.Locale;
import org.junit.After;
import org.junit.Test;
import org.openelisglobal.common.management.controller.rest.SampleTypeManagementRestController.SampleTypeManagementDTO;
import org.openelisglobal.localization.valueholder.Localization;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.springframework.context.i18n.LocaleContextHolder;

public class SampleTypeManagementRestControllerLocalizationTest {

    @After
    public void clearLocaleContext() {
        LocaleContextHolder.resetLocaleContext();
    }

    @Test
    public void dtoUsesChineseNamesForZhAndZhCnRequests() {
        TypeOfSample serum = sampleType("Serum", "血清");
        TypeOfSample wholeBlood = sampleType("Whole Blood", "全血");

        LocaleContextHolder.setLocale(Locale.CHINESE);
        assertEquals("血清", new SampleTypeManagementDTO(serum).getName());
        assertEquals("全血", new SampleTypeManagementDTO(wholeBlood).getName());

        LocaleContextHolder.setLocale(Locale.SIMPLIFIED_CHINESE);
        assertEquals("血清", new SampleTypeManagementDTO(serum).getName());
        assertEquals("全血", new SampleTypeManagementDTO(wholeBlood).getName());
    }

    @Test
    public void dtoUsesEnglishNameForEnglishRequestAndPreservesCanonicalDescription() {
        TypeOfSample serum = sampleType("Canonical serum description", "血清");
        serum.getLocalization().setLocalizedValue("en", "Serum");
        LocaleContextHolder.setLocale(Locale.ENGLISH);

        SampleTypeManagementDTO dto = new SampleTypeManagementDTO(serum);

        assertEquals("Serum", dto.getName());
        assertEquals("Canonical serum description", dto.getDescription());
    }

    @Test
    public void dtoFallsBackToCanonicalDescriptionWhenLocalizedNameIsMissing() {
        TypeOfSample withoutLocalization = new TypeOfSample();
        withoutLocalization.setDescription("Untranslated specimen");

        TypeOfSample withEmptyLocalization = new TypeOfSample();
        withEmptyLocalization.setDescription("Empty translation specimen");
        withEmptyLocalization.setLocalization(new Localization());

        LocaleContextHolder.setLocale(Locale.SIMPLIFIED_CHINESE);

        assertEquals("Untranslated specimen", new SampleTypeManagementDTO(withoutLocalization).getName());
        assertEquals("Empty translation specimen", new SampleTypeManagementDTO(withEmptyLocalization).getName());
    }

    private TypeOfSample sampleType(String description, String chineseName) {
        TypeOfSample sampleType = new TypeOfSample();
        sampleType.setDescription(description);
        Localization localization = new Localization();
        localization.setLocalizedValue("en", description);
        localization.setLocalizedValue("zh", chineseName);
        sampleType.setLocalization(localization);
        return sampleType;
    }
}
