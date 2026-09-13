package org.openelisglobal.barcode.service;

import java.util.List;
import org.openelisglobal.barcode.labeltype.Label;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;

public interface BarcodeLabelGenerationRenderer {
    int maximumRequestQuantity();
    Label createOrderLabel(Patient patient, Sample sample);
    Label createSpecimenLabel(Patient patient, Sample sample, SampleItem item);
    byte[] render(List<Label> labels);
}
