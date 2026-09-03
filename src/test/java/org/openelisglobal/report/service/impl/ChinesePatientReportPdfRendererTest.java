package org.openelisglobal.report.service.impl;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import com.itextpdf.text.pdf.PdfReader;
import com.itextpdf.text.pdf.parser.PdfTextExtractor;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;
import org.openelisglobal.report.PatientReportPdfMetadata;
import org.openelisglobal.report.ReportRow;
import org.openelisglobal.report.ReportingData;

public class ChinesePatientReportPdfRendererTest {

    @Test
    public void render_embedsChineseClinicalContentAndReportVersion() throws Exception {
        ReportingData data = new ReportingData();
        ReportRow row = resultRow("葡萄糖", "18.6", "危急");
        data.setRows(List.of(row));

        byte[] pdf = new ChinesePatientReportPdfRenderer().render(data);
        Path previewDirectory = Path.of("target", "test-output");
        Files.createDirectories(previewDirectory);
        Files.write(previewDirectory.resolve("chinese-patient-report-preview.pdf"), pdf);

        assertTrue(pdf.length > 10_000);
        PdfReader reader = new PdfReader(pdf);
        assertEquals(1, reader.getNumberOfPages());
        String text = PdfTextExtractor.getTextFromPage(reader, 1);
        assertTrue(text.contains("检验结果报告"));
        assertTrue(text.contains("张三"));
        assertTrue(text.contains("葡萄糖"));
        assertTrue(text.contains("危急"));
        assertTrue(text.contains("PREVIEW-1"));
        reader.close();
    }

    @Test
    public void render_repeatsClinicalTableHeaderAndVersionFooterOnEveryPage() throws Exception {
        ReportingData data = new ReportingData();
        List<ReportRow> rows = new ArrayList<>();
        for (int index = 1; index <= 90; index++) {
            rows.add(resultRow("检验项目" + index, String.valueOf(index), "正常"));
        }
        data.setRows(rows);

        PdfReader reader = new PdfReader(new ChinesePatientReportPdfRenderer().render(data));

        assertTrue(reader.getNumberOfPages() > 1);
        for (int page = 1; page <= reader.getNumberOfPages(); page++) {
            String text = PdfTextExtractor.getTextFromPage(reader, page);
            assertTrue(text.contains("检验项目"));
            assertTrue(text.contains("PREVIEW-1"));
            assertTrue(text.contains("第 " + page + " 页"));
        }
        reader.close();
    }

    @Test
    public void renderOfficial_embedsReleaseIdentitySignerAndAmendmentReason() throws Exception {
        ReportingData data = new ReportingData();
        data.setRows(List.of(resultRow("葡萄糖", "18.6", "危急")));
        PatientReportPdfMetadata metadata = new PatientReportPdfMetadata("BG-20260902-0001", 2, "赵审核",
                LocalDateTime.of(2026, 9, 2, 10, 30), "修正参考范围");

        PdfReader reader = new PdfReader(new ChinesePatientReportPdfRenderer().renderOfficial(data, metadata));
        String text = PdfTextExtractor.getTextFromPage(reader, 1);

        assertTrue(text.contains("正式检验报告"));
        assertTrue(text.contains("BG-20260902-0001"));
        assertTrue(text.contains("V2"));
        assertTrue(text.contains("赵审核"));
        assertTrue(text.contains("修正参考范围"));
        assertTrue(!text.contains("预览版"));
        assertTrue(!text.contains("PREVIEW-1"));
        reader.close();
    }

    private ReportRow resultRow(String testName, String resultValue, String resultFlag) {
        ReportRow row = new ReportRow();
        row.addData("patientName", "张三");
        row.addData("patientExternalId", "P20260001");
        row.addData("patientGender", "男");
        row.addData("patientDateOfBirth", "1985-06-01");
        row.addData("accessionNumber", "L202609020001");
        row.addData("organizationName", "检验医学科");
        row.addData("clinicianName", "李医生");
        row.addData("sampleType", "血清");
        row.addData("sampleCollectionDate", "2026-09-02 08:15");
        row.addData("sampleReceivedDate", "2026-09-02 08:30");
        row.addData("testName", testName);
        row.addData("resultValue", resultValue);
        row.addData("resultFlag", resultFlag);
        row.addData("unitsOfMeasure", "mmol/L");
        row.addData("referenceRange", "3.9-6.1");
        row.addData("testMethod", "己糖激酶法");
        row.addData("technician", "王检验师");
        row.addData("analysisStatus", "已审核");
        return row;
    }
}
