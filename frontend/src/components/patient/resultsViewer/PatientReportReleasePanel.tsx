import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Column,
  Grid,
  InlineLoading,
  InlineNotification,
  Stack,
  Tag,
  TextArea,
  Tile,
} from "@carbon/react";
import { DocumentPdf, Printer } from "@carbon/react/icons";
import ESignatureButton, {
  SignatureMeaning,
} from "../../esignature/ESignatureButton";
import { isEsigEnabled } from "../../esignature/api";
import {
  createPatientReportDraft,
  getPatientReportReleases,
  issuePatientReport,
  patientReportPdfUrl,
  PatientReportReleaseSummary,
  printPatientReport,
  voidPatientReport,
} from "./patient-report-release-api";

interface PatientReportReleasePanelProps {
  patientId: string;
  canManage: boolean;
}

const statusText: Record<string, string> = {
  DRAFT: "待签发",
  ISSUED: "当前有效",
  SUPERSEDED: "已被新版替代",
  VOIDED: "已作废",
};

const statusTagType: Record<string, "blue" | "green" | "gray" | "red"> = {
  DRAFT: "blue",
  ISSUED: "green",
  SUPERSEDED: "gray",
  VOIDED: "red",
};

const PatientReportReleasePanel: React.FC<PatientReportReleasePanelProps> = ({
  patientId,
  canManage,
}) => {
  const [releases, setReleases] = useState<PatientReportReleaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [amendmentReason, setAmendmentReason] = useState("");
  const [esignEnabled, setEsignEnabled] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const history = await getPatientReportReleases(patientId);
      setReleases(Array.isArray(history) ? history : []);
    } catch (_error) {
      setError("暂时无法加载正式报告记录，请重试。");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    load();
    if (canManage) {
      isEsigEnabled()
        .then((configuration) =>
          setEsignEnabled(Boolean(configuration.enabled)),
        )
        .catch(() => setEsignEnabled(null));
    }
  }, [canManage, load]);

  const draft = useMemo(
    () => releases.find((release) => release.status === "DRAFT"),
    [releases],
  );
  const current = useMemo(
    () => releases.find((release) => release.status === "ISSUED"),
    [releases],
  );
  const hasPreviousRelease = releases.some(
    (release) => release.status !== "DRAFT",
  );

  const runAction = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await action();
      setSuccess(message);
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "操作失败，请重试。",
      );
    } finally {
      setBusy(false);
    }
  };

  const prepareDraft = () => {
    if (hasPreviousRelease && !amendmentReason.trim()) {
      setError("再次出具报告必须填写更正原因。");
      return;
    }
    runAction(
      () => createPatientReportDraft(patientId, amendmentReason.trim()),
      "报告已准备，请核对后完成电子签名。",
    );
  };

  if (loading) {
    return (
      <Grid fullWidth className="patient-report-release-section">
        <Column lg={16} md={8} sm={4}>
          <InlineLoading description="正在加载正式报告记录…" />
        </Column>
      </Grid>
    );
  }

  return (
    <Grid fullWidth className="patient-report-release-section">
      <Column lg={16} md={8} sm={4}>
        <Tile className="patient-report-release-panel">
          <Stack gap={5}>
            <div className="patient-report-release-heading">
              <div>
                <h3>正式检验报告</h3>
                <p>在当前患者档案内完成签发、更正、作废和打印追溯。</p>
              </div>
              <Tag type={current ? "green" : draft ? "blue" : "gray"}>
                {current
                  ? `有效版本 V${current.reportVersion}`
                  : draft
                    ? "有待签发草稿"
                    : "尚未出具"}
              </Tag>
            </div>

            {error && (
              <InlineNotification
                kind="error"
                lowContrast
                hideCloseButton
                title="报告操作未完成"
                subtitle={error}
              />
            )}
            {success && (
              <InlineNotification
                kind="success"
                lowContrast
                hideCloseButton
                title="操作已完成"
                subtitle={success}
              />
            )}

            {current && (
              <div className="patient-report-current">
                <div>
                  <strong>{current.reportNumber}</strong>
                  <p>
                    V{current.reportVersion} ·{" "}
                    {current.issuedByName || "未记录签发人"} ·{" "}
                    {formatDateTime(current.issuedAt)}
                  </p>
                  <p>
                    已记录打印 {current.printCount || 0} 次
                    {current.lastPrintedAt
                      ? ` · 最后打印 ${formatDateTime(current.lastPrintedAt)}`
                      : ""}
                  </p>
                </div>
                <div className="patient-report-actions">
                  <Button
                    as="a"
                    kind="tertiary"
                    href={patientReportPdfUrl(current.id)}
                    target="_blank"
                    rel="noreferrer"
                    renderIcon={DocumentPdf}
                  >
                    查看正式报告
                  </Button>
                  {canManage && (
                    <Button
                      kind="secondary"
                      renderIcon={Printer}
                      disabled={busy}
                      onClick={() =>
                        runAction(
                          () => printPatientReport(current.id),
                          "已打开打印文件并记录本次打印。",
                        )
                      }
                    >
                      打印并留痕
                    </Button>
                  )}
                </div>
              </div>
            )}

            {canManage && !draft && (
              <div className="patient-report-prepare">
                {hasPreviousRelease && (
                  <TextArea
                    id="patient-report-amendment-reason"
                    labelText="更正原因（必填）"
                    helperText="说明与原报告的差异，该内容将进入正式报告和审计记录。"
                    value={amendmentReason}
                    onChange={(event) => setAmendmentReason(event.target.value)}
                    rows={3}
                  />
                )}
                <Button disabled={busy} onClick={prepareDraft}>
                  {hasPreviousRelease ? "准备更正版报告" : "准备首次正式报告"}
                </Button>
              </div>
            )}

            {canManage && draft && (
              <div className="patient-report-draft">
                <div>
                  <Tag type="blue">待签发</Tag>
                  <strong>{draft.reportNumber}</strong>
                  <span>V{draft.reportVersion}</span>
                  {draft.amendmentReason && (
                    <p>更正原因：{draft.amendmentReason}</p>
                  )}
                </div>
                {esignEnabled === false ? (
                  <InlineNotification
                    kind="warning"
                    lowContrast
                    hideCloseButton
                    title="无法签发"
                    subtitle="本机未启用电子签名。请先由系统管理员完成签名配置。"
                  />
                ) : esignEnabled === null ? (
                  <InlineLoading description="正在检查电子签名配置…" />
                ) : (
                  <ESignatureButton
                    meaning={SignatureMeaning.VALIDATED_AND_RELEASED}
                    context={`签发正式检验报告 ${draft.reportNumber} V${draft.reportVersion}`}
                    recordType="REPORT"
                    recordId={draft.id}
                    skipEsigCheck
                    disabled={busy}
                    onSign={(signature: { id?: number } | null) => {
                      if (!signature?.id) {
                        setError("未获取有效电子签名，报告未出具。");
                        return;
                      }
                      runAction(
                        () => issuePatientReport(draft.id, signature.id!),
                        "正式检验报告已签发。",
                      );
                    }}
                  >
                    电子签名并出具
                  </ESignatureButton>
                )}
              </div>
            )}

            {canManage && current && esignEnabled === true && (
              <div className="patient-report-void-action">
                <ESignatureButton
                  meaning={SignatureMeaning.REJECTED}
                  context={`作废正式检验报告 ${current.reportNumber} V${current.reportVersion}`}
                  recordType="REPORT"
                  recordId={current.id}
                  skipEsigCheck
                  kind="danger--tertiary"
                  disabled={busy}
                  onSign={(signature: { id?: number } | null) => {
                    if (!signature?.id) {
                      setError("未获取有效电子签名，报告未作废。");
                      return;
                    }
                    runAction(
                      () => voidPatientReport(current.id, signature.id!),
                      "正式检验报告已作废，不再允许下载或打印。",
                    );
                  }}
                >
                  作废当前报告
                </ESignatureButton>
              </div>
            )}

            {releases.length > 0 && (
              <div className="patient-report-history">
                <h4>版本记录</h4>
                {releases.map((release) => (
                  <div key={release.id} className="patient-report-history-row">
                    <span>
                      <strong>V{release.reportVersion}</strong>{" "}
                      {release.reportNumber}
                    </span>
                    <Tag type={statusTagType[release.status] || "gray"}>
                      {statusText[release.status] || release.status}
                    </Tag>
                  </div>
                ))}
              </div>
            )}
          </Stack>
        </Tile>
      </Column>
    </Grid>
  );
};

const formatDateTime = (value?: string) => {
  if (!value) {
    return "未记录时间";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
};

export default PatientReportReleasePanel;
