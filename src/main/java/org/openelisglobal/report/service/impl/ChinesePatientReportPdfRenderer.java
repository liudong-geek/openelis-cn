package org.openelisglobal.report.service.impl;

import com.itextpdf.text.BaseColor;
import com.itextpdf.text.Chunk;
import com.itextpdf.text.Document;
import com.itextpdf.text.DocumentException;
import com.itextpdf.text.Element;
import com.itextpdf.text.Font;
import com.itextpdf.text.PageSize;
import com.itextpdf.text.Paragraph;
import com.itextpdf.text.Phrase;
import com.itextpdf.text.Rectangle;
import com.itextpdf.text.pdf.BaseFont;
import com.itextpdf.text.pdf.PdfPCell;
import com.itextpdf.text.pdf.PdfPTable;
import com.itextpdf.text.pdf.PdfPageEventHelper;
import com.itextpdf.text.pdf.PdfWriter;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.openelisglobal.report.PatientReportPdfMetadata;
import org.openelisglobal.report.ReportRow;
import org.openelisglobal.report.ReportingData;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/** Renders a compact Chinese clinical result report with an embedded CJK font. */
@Component
public class ChinesePatientReportPdfRenderer {

    private static final String FONT_RESOURCE = "fonts/NotoSansCJKsc-Regular.otf";
    private static final DateTimeFormatter REPORT_TIME_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final BaseColor PRIMARY = new BaseColor(25, 94, 166);
    private static final BaseColor BORDER = new BaseColor(203, 213, 225);
    private static final BaseColor MUTED = new BaseColor(71, 85, 105);
    private static final BaseColor LIGHT_BACKGROUND = new BaseColor(241, 245, 249);
    private static final BaseColor CRITICAL_BACKGROUND = new BaseColor(254, 226, 226);

    public byte[] render(ReportingData data) {
        try {
            BaseFont baseFont = loadBaseFont();
            return render(data, baseFont, LocalDateTime.now());
        } catch (DocumentException | IOException e) {
            throw new IllegalStateException("无法生成中文检验报告 PDF", e);
        }
    }

    public byte[] renderOfficial(ReportingData data, PatientReportPdfMetadata metadata) {
        if (metadata == null || metadata.reportNumber() == null || metadata.issuedAt() == null) {
            throw new IllegalArgumentException("正式报告元数据不完整");
        }
        try {
            return render(data, loadBaseFont(), metadata.issuedAt(), metadata);
        } catch (DocumentException | IOException e) {
            throw new IllegalStateException("无法生成正式中文检验报告 PDF", e);
        }
    }

    byte[] render(ReportingData data, BaseFont baseFont, LocalDateTime reportTime) throws DocumentException {
        return render(data, baseFont, reportTime, null);
    }

    private byte[] render(ReportingData data, BaseFont baseFont, LocalDateTime reportTime,
            PatientReportPdfMetadata metadata) throws DocumentException {
        boolean official = metadata != null;
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        Document document = new Document(PageSize.A4, 34, 34, 42, 48);
        PdfWriter writer = PdfWriter.getInstance(document, output);
        writer.setPageEvent(new ReportFooter(baseFont, official ? "V" + metadata.version() : "PREVIEW-1"));
        document.addTitle("检验结果报告");
        document.addSubject(official ? "正式患者检验结果报告" : "患者检验结果报告预览");
        document.addCreator("临床检验信息系统");
        document.open();

        Font titleFont = font(baseFont, 18, Font.BOLD, PRIMARY);
        Font subtitleFont = font(baseFont, 9, Font.NORMAL, MUTED);
        Font sectionFont = font(baseFont, 10, Font.BOLD, BaseColor.WHITE);
        Font labelFont = font(baseFont, 8, Font.NORMAL, MUTED);
        Font valueFont = font(baseFont, 9, Font.NORMAL, BaseColor.BLACK);
        Font tableHeaderFont = font(baseFont, 8, Font.BOLD, BaseColor.WHITE);
        Font tableFont = font(baseFont, 8, Font.NORMAL, BaseColor.BLACK);
        Font noteFont = font(baseFont, 8, Font.NORMAL, MUTED);

        Paragraph title = new Paragraph("检验结果报告", titleFont);
        title.setAlignment(Element.ALIGN_CENTER);
        title.setSpacingAfter(3);
        document.add(title);

        Paragraph subtitle = new Paragraph(official ? "临床检验信息系统 · 正式检验报告" : "临床检验信息系统 · 中文报告预览版",
                subtitleFont);
        subtitle.setAlignment(Element.ALIGN_CENTER);
        subtitle.setSpacingAfter(13);
        document.add(subtitle);

        if (official) {
            PdfPTable identity = new PdfPTable(new float[] { 1, 2, 1, 1 });
            identity.setWidthPercentage(100);
            addInfoRow(identity, "报告编号", metadata.reportNumber(), "报告版本", "V" + metadata.version(), labelFont,
                    valueFont);
            identity.setSpacingAfter(10);
            document.add(identity);
        }

        Map<String, Object> firstRow = getFirstRow(data);
        addSectionHeader(document, "患者与标本信息", sectionFont);
        PdfPTable patientTable = new PdfPTable(new float[] { 1.1f, 2.1f, 1.1f, 2.1f });
        patientTable.setWidthPercentage(100);
        addInfoRow(patientTable, "患者姓名", value(firstRow, "patientName"), "患者编号",
                value(firstRow, "patientExternalId"), labelFont, valueFont);
        addInfoRow(patientTable, "性别", value(firstRow, "patientGender"), "出生日期",
                value(firstRow, "patientDateOfBirth"), labelFont, valueFont);
        addInfoRow(patientTable, "实验室编号", value(firstRow, "accessionNumber"), "送检机构",
                value(firstRow, "organizationName"), labelFont, valueFont);
        addInfoRow(patientTable, "申请医生", value(firstRow, "clinicianName"), "标本类型",
                value(firstRow, "sampleType"), labelFont, valueFont);
        addInfoRow(patientTable, "采集时间", value(firstRow, "sampleCollectionDate"), "接收时间",
                value(firstRow, "sampleReceivedDate"), labelFont, valueFont);
        patientTable.setSpacingAfter(12);
        document.add(patientTable);

        addSectionHeader(document, "检验结果", sectionFont);
        PdfPTable resultsTable = new PdfPTable(new float[] { 2.4f, 1.45f, 0.8f, 1.05f, 1.45f, 1.25f });
        resultsTable.setWidthPercentage(100);
        resultsTable.setHeaderRows(1);
        for (String header : List.of("检验项目", "结果", "提示", "单位", "参考范围", "检验方法")) {
            PdfPCell cell = new PdfPCell(new Phrase(header, tableHeaderFont));
            cell.setBackgroundColor(PRIMARY);
            cell.setBorderColor(PRIMARY);
            cell.setHorizontalAlignment(Element.ALIGN_CENTER);
            cell.setVerticalAlignment(Element.ALIGN_MIDDLE);
            cell.setPadding(6);
            resultsTable.addCell(cell);
        }

        List<ReportRow> rows = data == null || data.getRows() == null ? Collections.emptyList() : data.getRows();
        if (rows.isEmpty()) {
            PdfPCell empty = new PdfPCell(new Phrase("暂无已审核且允许出报告的检验结果", tableFont));
            empty.setColspan(6);
            empty.setHorizontalAlignment(Element.ALIGN_CENTER);
            empty.setPadding(14);
            empty.setBorderColor(BORDER);
            resultsTable.addCell(empty);
        } else {
            for (ReportRow row : rows) {
                Map<String, Object> values = row.getDataMap();
                boolean critical = "危急".equals(value(values, "resultFlag"));
                addResultCell(resultsTable, value(values, "testName"), tableFont, critical, Element.ALIGN_LEFT);
                addResultCell(resultsTable, value(values, "resultValue"), tableFont, critical, Element.ALIGN_CENTER);
                addResultCell(resultsTable, value(values, "resultFlag"), tableFont, critical, Element.ALIGN_CENTER);
                addResultCell(resultsTable, value(values, "unitsOfMeasure"), tableFont, critical,
                        Element.ALIGN_CENTER);
                addResultCell(resultsTable, value(values, "referenceRange"), tableFont, critical,
                        Element.ALIGN_CENTER);
                addResultCell(resultsTable, value(values, "testMethod"), tableFont, critical, Element.ALIGN_CENTER);
            }
        }
        resultsTable.setSpacingAfter(12);
        document.add(resultsTable);

        PdfPTable signoff = new PdfPTable(new float[] { 1, 1, 1 });
        signoff.setWidthPercentage(100);
        addSignoffCell(signoff, "检验人员", value(firstRow, "technician"), labelFont, valueFont);
        addSignoffCell(signoff, official ? "审核/发布人" : "审核状态",
                official ? metadata.issuerName() : value(firstRow, "analysisStatus"), labelFont, valueFont);
        addSignoffCell(signoff, official ? "发布时间" : "报告生成时间", reportTime.format(REPORT_TIME_FORMAT),
                labelFont, valueFont);
        signoff.setSpacingAfter(10);
        document.add(signoff);

        Paragraph warning = new Paragraph();
        warning.add(new Chunk("说明：", font(baseFont, 8, Font.BOLD, MUTED)));
        if (official) {
            String note = "本报告仅对本次送检标本负责；报告编号、版本和电子签名共同构成可追溯的正式报告记录。";
            if (metadata.version() > 1 && metadata.amendmentReason() != null) {
                note += " 本版更正原因：" + metadata.amendmentReason();
            }
            warning.add(new Chunk(note, noteFont));
        } else {
            warning.add(new Chunk("本文件为中文报告预览版；正式发布前仍须完成审核人签名、报告版本号、发布/撤回状态和医院打印样张验收。",
                    noteFont));
        }
        warning.setLeading(13);
        document.add(warning);

        document.close();
        return output.toByteArray();
    }

    private byte[] readFont() throws IOException {
        ClassPathResource resource = new ClassPathResource(FONT_RESOURCE);
        try (InputStream input = resource.getInputStream()) {
            return input.readAllBytes();
        }
    }

    private BaseFont loadBaseFont() throws DocumentException, IOException {
        return BaseFont.createFont("NotoSansCJKsc-Regular.otf", BaseFont.IDENTITY_H, BaseFont.EMBEDDED, true,
                readFont(), null);
    }

    private static Map<String, Object> getFirstRow(ReportingData data) {
        if (data == null || data.getRows() == null || data.getRows().isEmpty()
                || data.getRows().get(0).getDataMap() == null) {
            return Collections.emptyMap();
        }
        return data.getRows().get(0).getDataMap();
    }

    private static void addSectionHeader(Document document, String text, Font font) throws DocumentException {
        PdfPTable header = new PdfPTable(1);
        header.setWidthPercentage(100);
        PdfPCell cell = new PdfPCell(new Phrase(text, font));
        cell.setBackgroundColor(PRIMARY);
        cell.setBorder(Rectangle.NO_BORDER);
        cell.setPadding(6);
        header.addCell(cell);
        header.setSpacingAfter(0);
        document.add(header);
    }

    private static void addInfoRow(PdfPTable table, String labelOne, String valueOne, String labelTwo,
            String valueTwo, Font labelFont, Font valueFont) {
        addInfoCell(table, labelOne, labelFont, LIGHT_BACKGROUND);
        addInfoCell(table, valueOne, valueFont, BaseColor.WHITE);
        addInfoCell(table, labelTwo, labelFont, LIGHT_BACKGROUND);
        addInfoCell(table, valueTwo, valueFont, BaseColor.WHITE);
    }

    private static void addInfoCell(PdfPTable table, String text, Font font, BaseColor background) {
        PdfPCell cell = new PdfPCell(new Phrase(text, font));
        cell.setBackgroundColor(background);
        cell.setBorderColor(BORDER);
        cell.setPadding(5);
        table.addCell(cell);
    }

    private static void addResultCell(PdfPTable table, String text, Font font, boolean critical, int alignment) {
        PdfPCell cell = new PdfPCell(new Phrase(text, font));
        cell.setBackgroundColor(critical ? CRITICAL_BACKGROUND : BaseColor.WHITE);
        cell.setBorderColor(BORDER);
        cell.setHorizontalAlignment(alignment);
        cell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        cell.setPadding(5);
        table.addCell(cell);
    }

    private static void addSignoffCell(PdfPTable table, String label, String value, Font labelFont, Font valueFont) {
        Paragraph paragraph = new Paragraph();
        paragraph.add(new Chunk(label + "：", labelFont));
        paragraph.add(new Chunk(value.isBlank() ? "—" : value, valueFont));
        PdfPCell cell = new PdfPCell(paragraph);
        cell.setBorderColor(BORDER);
        cell.setPadding(6);
        table.addCell(cell);
    }

    private static Font font(BaseFont baseFont, float size, int style, BaseColor color) {
        return new Font(baseFont, size, style, color);
    }

    private static String value(Map<String, Object> values, String key) {
        if (values == null || values.get(key) == null) {
            return "";
        }
        return String.valueOf(values.get(key));
    }

    private static class ReportFooter extends PdfPageEventHelper {
        private final Font footerFont;
        private final String versionLabel;

        ReportFooter(BaseFont baseFont, String versionLabel) {
            this.footerFont = font(baseFont, 7, Font.NORMAL, MUTED);
            this.versionLabel = versionLabel;
        }

        @Override
        public void onEndPage(PdfWriter writer, Document document) {
            PdfPTable footer = new PdfPTable(2);
            try {
                footer.setWidths(new float[] { 4, 1 });
                footer.setTotalWidth(document.right() - document.left());
                footer.setLockedWidth(true);
                PdfPCell version = new PdfPCell(new Phrase("报告版本：" + versionLabel, footerFont));
                version.setBorder(Rectangle.TOP);
                version.setBorderColor(BORDER);
                version.setPaddingTop(5);
                footer.addCell(version);
                PdfPCell page = new PdfPCell(new Phrase("第 " + writer.getPageNumber() + " 页", footerFont));
                page.setHorizontalAlignment(Element.ALIGN_RIGHT);
                page.setBorder(Rectangle.TOP);
                page.setBorderColor(BORDER);
                page.setPaddingTop(5);
                footer.addCell(page);
                footer.writeSelectedRows(0, -1, document.left(), document.bottom() - 12, writer.getDirectContent());
            } catch (DocumentException e) {
                throw new IllegalStateException("无法写入检验报告页脚", e);
            }
        }
    }
}
