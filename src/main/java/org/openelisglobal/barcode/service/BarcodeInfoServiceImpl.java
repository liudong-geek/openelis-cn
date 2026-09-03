package org.openelisglobal.barcode.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.openelisglobal.barcode.labeltype.BlockLabel;
import org.openelisglobal.barcode.labeltype.FreezerLabel;
import org.openelisglobal.barcode.labeltype.OrderLabel;
import org.openelisglobal.barcode.labeltype.SlideLabel;
import org.openelisglobal.barcode.labeltype.SpecimenLabel;
import org.openelisglobal.barcode.valueholder.SampleBarcodeInfo;
import org.openelisglobal.barcode.valueholder.SampleItemBarcodeInfo;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.service.SampleItemService;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class BarcodeInfoServiceImpl implements BarcodeInfoService {

    @Autowired
    private SampleBarcodeInfoService sampleBarcodeInfoService;

    @Autowired
    private SampleItemBarcodeInfoService sampleItemBarcodeInfoService;

    @Autowired
    private SampleItemService sampleItemService;

    @Autowired
    private SampleService sampleService;

    @Override
    public void saveBarcodeInfoForSampleAndSampleItems(Sample sample, int numOrderLabels, int numSpecimenLabels) {
        List<SampleItem> sampleItems = sampleItemService.getSampleItemsBySampleId(sample.getId());
        Map<SampleItem, Integer> specimenLabelQuantities = new LinkedHashMap<>();
        for (SampleItem sampleItem : sampleItems) {
            specimenLabelQuantities.put(sampleItem, numSpecimenLabels);
        }
        saveBarcodeInfoForSampleAndSampleItems(sample, numOrderLabels, specimenLabelQuantities);
    }

    @Override
    public void saveBarcodeInfoForSampleAndSampleItems(Sample sample, int numOrderLabels,
            Map<SampleItem, Integer> specimenLabelQuantities) {
        List<SampleBarcodeInfo> existingSampleInfo = sampleBarcodeInfoService.getAllMatching("sample", sample);
        SampleBarcodeInfo sampleBarcodeInfo;
        if (!existingSampleInfo.isEmpty()) {
            sampleBarcodeInfo = existingSampleInfo.get(0);
            sampleBarcodeInfo.setPrintOrderNum(numOrderLabels);
            sampleBarcodeInfoService.update(sampleBarcodeInfo);
        } else {
            sampleBarcodeInfo = new SampleBarcodeInfo();
            sampleBarcodeInfo.setSample(sample);
            sampleBarcodeInfo.setPrintOrderNum(numOrderLabels);
            sampleBarcodeInfoService.insert(sampleBarcodeInfo);
        }

        if (specimenLabelQuantities == null || specimenLabelQuantities.isEmpty()) {
            return;
        }

        for (Map.Entry<SampleItem, Integer> entry : specimenLabelQuantities.entrySet()) {
            SampleItem sampleItem = entry.getKey();
            if (sampleItem == null) {
                continue;
            }
            List<SampleItemBarcodeInfo> existingItemInfo = sampleItemBarcodeInfoService.getAllMatching("sampleItem",
                    sampleItem);
            SampleItemBarcodeInfo itemInfo;
            int normalizedSpecimenLabels = normalizeConfiguredLabelCount(entry.getValue());
            if (!existingItemInfo.isEmpty()) {
                itemInfo = existingItemInfo.get(0);
                itemInfo.setPrintSpecimenNum(normalizedSpecimenLabels);
                sampleItemBarcodeInfoService.update(itemInfo);
            } else {
                itemInfo = new SampleItemBarcodeInfo();
                itemInfo.setSampleItem(sampleItem);
                itemInfo.setPrintSpecimenNum(normalizedSpecimenLabels);
                sampleItemBarcodeInfoService.insert(itemInfo);
            }
        }
    }

    @Override
    public void saveBarcodeInfoForSampleAndSampleItemsPathology(Sample sample, int numOrderLabels,
            int numSpecimenLabels, int numBlockLabels, int numSlideLabels, int numFreezerLabels) {
        List<SampleBarcodeInfo> existingSampleInfo = sampleBarcodeInfoService.getAllMatching("sample", sample);
        SampleBarcodeInfo sampleBarcodeInfo;
        if (!existingSampleInfo.isEmpty()) {
            sampleBarcodeInfo = existingSampleInfo.get(0);
            sampleBarcodeInfo.setPrintOrderNum(numOrderLabels);
            sampleBarcodeInfoService.update(sampleBarcodeInfo);
        } else {
            sampleBarcodeInfo = new SampleBarcodeInfo();
            sampleBarcodeInfo.setSample(sample);
            sampleBarcodeInfo.setPrintOrderNum(numOrderLabels);
            sampleBarcodeInfoService.insert(sampleBarcodeInfo);
        }

        List<SampleItem> sampleItems = sampleItemService.getSampleItemsBySampleId(sample.getId());
        for (SampleItem sampleItem : sampleItems) {
            List<SampleItemBarcodeInfo> existingItemInfo = sampleItemBarcodeInfoService.getAllMatching("sampleItem",
                    sampleItem);
            SampleItemBarcodeInfo itemInfo;
            if (!existingItemInfo.isEmpty()) {
                itemInfo = existingItemInfo.get(0);
                itemInfo.setPrintSpecimenNum(numSpecimenLabels);
                itemInfo.setPrintBlockNum(numBlockLabels);
                itemInfo.setPrintSlideNum(numSlideLabels);
                itemInfo.setPrintFreezerNum(numFreezerLabels);
                sampleItemBarcodeInfoService.update(itemInfo);
            } else {
                itemInfo = new SampleItemBarcodeInfo();
                itemInfo.setSampleItem(sampleItem);
                itemInfo.setPrintSpecimenNum(numSpecimenLabels);
                itemInfo.setPrintBlockNum(numBlockLabels);
                itemInfo.setPrintSlideNum(numSlideLabels);
                itemInfo.setPrintFreezerNum(numFreezerLabels);
                sampleItemBarcodeInfoService.insert(itemInfo);
            }
        }
    }

    @Override
    public void recordPrintedCounts(String labNo, List<org.openelisglobal.barcode.labeltype.Label> labels) {
        if (labels == null || labels.isEmpty()) {
            return;
        }
        Sample sample = sampleService.getSampleByAccessionNumber(labNo);
        if (sample == null) {
            return;
        }
        int orderLabelCount = 0;
        Map<SampleItem, Integer> specimenLabelCounts = new LinkedHashMap<>();
        int blockLabelCount = 0;
        int slideLabelCount = 0;
        int freezerLabelCount = 0;

        for (org.openelisglobal.barcode.labeltype.Label label : labels) {
            int count = label.getNumLabels();
            if (count <= 0) {
                continue;
            }
            if (label instanceof OrderLabel) {
                orderLabelCount += count;
            } else if (label instanceof SpecimenLabel) {
                SampleItem item = ((SpecimenLabel) label).getSampleItem();
                if (item != null) {
                    specimenLabelCounts.merge(item, count, Integer::sum);
                }
            } else if (label instanceof BlockLabel) {
                blockLabelCount += count;
            } else if (label instanceof SlideLabel) {
                slideLabelCount += count;
            } else if (label instanceof FreezerLabel) {
                freezerLabelCount += count;
            }
        }

        if (orderLabelCount > 0) {
            incrementPrintedOrderCount(sample, orderLabelCount);
        }
        specimenLabelCounts.forEach(this::incrementPrintedSpecimenCount);
        if (blockLabelCount > 0 || slideLabelCount > 0 || freezerLabelCount > 0) {
            incrementPrintedPathologyCounts(sample, blockLabelCount, slideLabelCount, freezerLabelCount);
        }
    }

    private void incrementPrintedOrderCount(Sample sample, int count) {
        List<SampleBarcodeInfo> existing = sampleBarcodeInfoService.getAllMatching("sample", sample);
        SampleBarcodeInfo info;
        if (!existing.isEmpty()) {
            info = existing.get(0);
        } else {
            info = new SampleBarcodeInfo();
            info.setSample(sample);
            info.setPrintedOrderCount(count);
            sampleBarcodeInfoService.insert(info);
            return;
        }
        int current = info.getPrintedOrderCount() != null ? info.getPrintedOrderCount() : 0;
        info.setPrintedOrderCount(current + count);
        sampleBarcodeInfoService.update(info);
    }

    private void incrementPrintedSpecimenCount(SampleItem sampleItem, int count) {
        List<SampleItemBarcodeInfo> existing = sampleItemBarcodeInfoService.getAllMatching("sampleItem", sampleItem);
        SampleItemBarcodeInfo info;
        if (!existing.isEmpty()) {
            info = existing.get(0);
        } else {
            info = new SampleItemBarcodeInfo();
            info.setSampleItem(sampleItem);
            info.setPrintedSpecimenCount(count);
            sampleItemBarcodeInfoService.insert(info);
            return;
        }
        int current = info.getPrintedSpecimenCount() != null ? info.getPrintedSpecimenCount() : 0;
        info.setPrintedSpecimenCount(current + count);
        sampleItemBarcodeInfoService.update(info);
    }

    private void incrementPrintedPathologyCounts(Sample sample, int blockCount, int slideCount, int freezerCount) {
        List<SampleItem> sampleItems = sampleItemService.getSampleItemsBySampleId(sample.getId());
        if (sampleItems == null || sampleItems.isEmpty()) {
            return;
        }
        for (SampleItem sampleItem : sampleItems) {
            incrementPrintedPathologyCounts(sampleItem, blockCount, slideCount, freezerCount);
        }
    }

    private void incrementPrintedPathologyCounts(SampleItem sampleItem, int blockCount, int slideCount,
            int freezerCount) {
        List<SampleItemBarcodeInfo> existing = sampleItemBarcodeInfoService.getAllMatching("sampleItem", sampleItem);
        SampleItemBarcodeInfo info;
        boolean persisted;
        if (!existing.isEmpty()) {
            info = existing.get(0);
            persisted = true;
        } else {
            info = new SampleItemBarcodeInfo();
            info.setSampleItem(sampleItem);
            persisted = false;
        }
        if (blockCount > 0) {
            int current = info.getPrintedBlockCount() != null ? info.getPrintedBlockCount() : 0;
            info.setPrintedBlockCount(current + blockCount);
        }
        if (slideCount > 0) {
            int current = info.getPrintedSlideCount() != null ? info.getPrintedSlideCount() : 0;
            info.setPrintedSlideCount(current + slideCount);
        }
        if (freezerCount > 0) {
            int current = info.getPrintedFreezerCount() != null ? info.getPrintedFreezerCount() : 0;
            info.setPrintedFreezerCount(current + freezerCount);
        }
        if (persisted) {
            sampleItemBarcodeInfoService.update(info);
        } else {
            sampleItemBarcodeInfoService.insert(info);
        }
    }

    private int normalizeConfiguredLabelCount(Integer count) {
        return count != null && count > 0 ? count : 1;
    }

}
