package org.openelisglobal.report.form;

public record ReportFrozenTemplate(String version, String title, String laboratoryName, String footerText) {
    public ReportFrozenTemplate {
        if (version == null || title == null || laboratoryName == null || footerText == null || version.isBlank()
                || title.isBlank() || laboratoryName.isBlank() || footerText.isBlank())
            throw new IllegalArgumentException("Incomplete frozen report template");
    }

    public static ReportFrozenTemplate current() {
        return new ReportFrozenTemplate("CN-A4-20260916-1", "检验结果报告", "临床检验信息系统",
                "本报告仅对本次送检标本负责；报告编号、版本和电子签名共同构成可追溯的正式报告记录。");
    }
}
