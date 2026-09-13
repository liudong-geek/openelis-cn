package org.openelisglobal.barcode.service;

import com.itextpdf.text.pdf.PdfReader;
import java.util.ArrayList;
import java.util.List;
import org.openelisglobal.barcode.BarcodeLabelMaker;
import org.openelisglobal.barcode.exception.BarcodeLabelGenerationException;
import org.openelisglobal.barcode.labeltype.Label;
import org.openelisglobal.barcode.labeltype.OrderLabel;
import org.openelisglobal.barcode.labeltype.SpecimenLabel;
import org.openelisglobal.common.util.ConfigurationProperties;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.springframework.stereotype.Component;

@Component
public class BarcodeLabelGenerationRendererImpl implements BarcodeLabelGenerationRenderer {
    @Override
    public int maximumRequestQuantity() {
        String configured = ConfigurationProperties.getInstance().getPropertyValue(Property.MAX_REQUEST_LABEL_QUANTITY);
        if (configured == null || configured.isBlank()) {
            return 100;
        }
        try {
            int maximum = Integer.parseInt(configured);
            if (maximum > 0) {
                return Math.min(100, maximum);
            }
        } catch (NumberFormatException ignored) {
            // Bad configuration must not silently increase a site limit.
        }
        throw new BarcodeLabelGenerationException(409, "BARCODE_CONFIGURATION_INVALID");
    }

    @Override
    public Label createOrderLabel(Patient patient, Sample sample) {
        return new OrderLabel(patient, sample, sample.getAccessionNumber());
    }

    @Override
    public Label createSpecimenLabel(Patient patient, Sample sample, SampleItem item) {
        return new SpecimenLabel(patient, sample, item, sample.getAccessionNumber());
    }

    @Override
    public byte[] render(List<Label> labels) {
        try {
            byte[] pdf = new BarcodeLabelMaker(new ArrayList<>(labels)).createLabelsAsStreamStrict().toByteArray();
            PdfReader reader = new PdfReader(pdf);
            try {
                int expected = labels.stream().mapToInt(Label::getNumLabels).sum();
                if (expected < 1 || reader.getNumberOfPages() != expected) {
                    throw new BarcodeLabelGenerationException(500, "BARCODE_GENERATION_FAILED");
                }
            } finally {
                reader.close();
            }
            return pdf;
        } catch (Exception error) {
            throw new BarcodeLabelGenerationException(500, "BARCODE_GENERATION_FAILED");
        }
    }
}
