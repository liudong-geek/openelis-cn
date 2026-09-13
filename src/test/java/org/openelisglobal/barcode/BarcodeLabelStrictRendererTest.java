package org.openelisglobal.barcode;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import com.itextpdf.text.pdf.PdfReader;
import java.util.ArrayList;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.barcode.labeltype.Label;
import org.openelisglobal.barcode.service.BarcodeLabelGenerationRendererImpl;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.spring.util.SpringContext;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.test.util.ReflectionTestUtils;

public class BarcodeLabelStrictRendererTest {
    private Object previousFactory;
    private final DefaultConfigurationProperties config = mock(DefaultConfigurationProperties.class);

    @Before
    public void setup() {
        previousFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        AutowireCapableBeanFactory factory = mock(AutowireCapableBeanFactory.class);
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        when(factory.getBean(DefaultConfigurationProperties.class)).thenReturn(config);
        when(config.getPropertyValue(Property.BAR_CODE_TYPE)).thenReturn("BARCODE");
    }

    @After
    public void teardown() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", previousFactory);
    }

    @Test
    public void exactPageCountAndPhysicalMillimetreDimensions() throws Exception {
        Label label = new TestLabel();
        label.setCode("SYNTHETIC-26001.2");
        label.setNumLabels(3);
        byte[] bytes = new BarcodeLabelGenerationRendererImpl().render(List.of(label));
        PdfReader pdf = new PdfReader(bytes);
        try {
            assertEquals(3, pdf.getNumberOfPages());
            assertEquals(216, pdf.getPageSize(1).getWidth(), 0.01);
            assertEquals(72, pdf.getPageSize(1).getHeight(), 0.01);
        } finally {
            pdf.close();
        }
    }

    @Test
    public void invalidLaterLabelNeverReturnsAPartialPdf() throws Exception {
        Label first = new TestLabel();
        first.setCode("SYNTHETIC-26001");
        Label invalid = new TestLabel();
        invalid.setCode("");
        BarcodeLabelMaker maker = new BarcodeLabelMaker(new ArrayList<>(List.of(first, invalid)));
        try {
            maker.createLabelsAsStreamStrict();
            fail("Partial PDF must not be returned");
        } catch (IllegalArgumentException expected) {
            assertEquals("Invalid label render data", expected.getMessage());
        }
        assertNull(first.getLabelInfo());
    }

    @Test
    public void noLabelsAndZeroCopiesAreRejected() throws Exception {
        try {
            new BarcodeLabelMaker().createLabelsAsStreamStrict();
            fail("Expected rejection");
        } catch (IllegalArgumentException expected) {
            assertEquals("No labels to render", expected.getMessage());
        }
        Label zero = new TestLabel();
        zero.setCode("SYNTHETIC-26001");
        // Legacy Label.setNumLabels silently ignores zero; inject invalid internal
        // state to exercise the new renderer's own fail-closed boundary.
        ReflectionTestUtils.setField(zero, "numLabels", 0);
        try {
            new BarcodeLabelGenerationRendererImpl().render(List.of(zero));
            fail("Expected generation failure");
        } catch (org.openelisglobal.barcode.exception.BarcodeLabelGenerationException expected) {
            assertEquals("BARCODE_GENERATION_FAILED", expected.getCode());
        }
    }

    @Test
    public void quantityConfigurationNeverExpandsBeyondConservativeCap() {
        var renderer = new BarcodeLabelGenerationRendererImpl();
        when(config.getPropertyValue(Property.MAX_REQUEST_LABEL_QUANTITY)).thenReturn("1000");
        assertEquals(100, renderer.maximumRequestQuantity());
        when(config.getPropertyValue(Property.MAX_REQUEST_LABEL_QUANTITY)).thenReturn("7");
        assertEquals(7, renderer.maximumRequestQuantity());
        when(config.getPropertyValue(Property.MAX_REQUEST_LABEL_QUANTITY)).thenReturn("invalid");
        try {
            renderer.maximumRequestQuantity();
            fail("Bad site configuration must not be ignored");
        } catch (org.openelisglobal.barcode.exception.BarcodeLabelGenerationException expected) {
            assertEquals("BARCODE_CONFIGURATION_INVALID", expected.getCode());
        }
    }

    private static class TestLabel extends Label {
        TestLabel() {
            width = 76.2f;
            height = 25.4f;
            aboveFields = new ArrayList<>();
            belowFields = new ArrayList<>();
        }
        public int getNumTextRowsBefore() { return 0; }
        public int getNumTextRowsAfter() { return 0; }
        public int getMaxNumLabels() { return 10; }
    }
}
