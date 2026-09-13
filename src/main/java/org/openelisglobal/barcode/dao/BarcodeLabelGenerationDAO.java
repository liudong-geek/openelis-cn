package org.openelisglobal.barcode.dao;

import java.util.List;
import org.openelisglobal.barcode.valueholder.BarcodeLabelInfo;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;

public interface BarcodeLabelGenerationDAO {
    Sample lockOrder(String orderId);
    List<SampleItem> lockSampleItems(String orderId);
    List<Patient> findClinicalPatients(String orderId);
    List<BarcodeLabelInfo> findCounters(String barcode);
    boolean isOrderBlocked(String orderId);
    boolean isSpecimenEligible(String sampleItemId);
    void flush();
}
