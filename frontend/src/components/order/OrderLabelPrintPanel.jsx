import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import {
  Button,
  Checkbox,
  InlineNotification,
  NumberInput,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Tile,
} from "@carbon/react";
import { DocumentPdf } from "@carbon/icons-react";
import { hasPendingLabels } from "./labelCheckpoint";
import { localizeSampleType } from "./sampleTypeIntl";
import "./label-generation.scss";

export const labelScopeFor = (orderId, labNumber, samples) =>
  JSON.stringify([
    String(orderId || ""),
    String(labNumber || ""),
    samples.map((sample) => [
      String(sample.sampleItemId || ""),
      String(sample.sortOrder || ""),
    ]),
  ]);

const positiveId = (value) => /^[1-9]\d*$/.test(String(value ?? ""));
const lineKey = (item) =>
  item.type === "order" ? "order" : `specimen:${item.sampleItemId}`;

/** Generation receipts and operator checks deliberately remain separate.
 * A generated PDF is not proof of physical printing or correct application.
 * Checks are local to this visit and the exact ordered specimen identities.
 */
export default function OrderLabelPrintPanel({
  orderId,
  labNumber,
  samples,
  patientName,
  disabled = false,
  onConfirmationChange,
  operation,
}) {
  const intl = useIntl();
  const msg = (id, defaultMessage, values) =>
    intl.formatMessage({ id, defaultMessage }, values);
  const scope = labelScopeFor(orderId, labNumber, samples);
  const [quantities, setQuantities] = useState({});
  const [checks, setChecks] = useState({ scope, items: {} });
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(hasPendingLabels);
  const current = operation?.isCurrent?.() === true;
  const unavailable = disabled || !current;
  const generationBlocked = unavailable || unknown || hasPendingLabels();
  const generation = useRef(null);
  const blobUrl = useRef(null);
  const epoch = useRef(0);
  const activeScope = useRef(scope);
  activeScope.current = scope;
  useEffect(() => () => operation?.invalidate?.(), [operation]);

  useLayoutEffect(() => {
    epoch.current += 1;
    generation.current = null;
    setBusy(false);
    setError(null);
    setReceipt(null);
    setChecks({ scope, items: {} });
    setQuantities({});
    return () => {
      epoch.current += 1;
      generation.current = null;
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
      blobUrl.current = null;
    };
  }, [scope, operation, current]);

  const rows = [
    {
      key: "order",
      type: "order",
      sampleItemId: null,
      barcode: labNumber,
      name: msg("label.type.order", "Order Label"),
      content: patientName,
    },
    ...samples.map((sample, index) => ({
      key: `specimen:${sample.sampleItemId || ""}`,
      type: "specimen",
      sampleItemId: String(sample.sampleItemId || ""),
      barcode: positiveId(sample.sortOrder)
        ? `${labNumber}.${sample.sortOrder}`
        : null,
      name: `${msg("label.type.sample", "Sample Label")} ${index + 1}`,
      content: localizeSampleType(intl, sample.sampleTypeName) || "—",
    })),
  ];
  const validIdentity =
    positiveId(orderId) &&
    Boolean(labNumber) &&
    samples.length > 0 &&
    rows.every(
      (row) =>
        row.barcode && (row.type === "order" || positiveId(row.sampleItemId)),
    ) &&
    new Set(rows.map((row) => row.key)).size === rows.length &&
    new Set(rows.map((row) => row.barcode)).size === rows.length;
  const allConfirmed =
    validIdentity &&
    checks.scope === scope &&
    rows
      .filter((row) => row.type === "specimen")
      .every((row) => checks.items[row.key] === true);
  useEffect(() => {
    onConfirmationChange?.({
      scope,
      complete: current && Boolean(allConfirmed),
    });
  }, [scope, allConfirmed, onConfirmationChange, current]);

  const quantityFor = (key) => quantities[key] ?? 1;
  const validQuantities = rows.every((row) => {
    const value = Number(quantityFor(row.key));
    return (
      quantityFor(row.key) !== "" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= 100
    );
  });
  const total = rows.reduce(
    (sum, row) => sum + Number(quantityFor(row.key) || 0),
    0,
  );
  const activeReceipt = current && receipt?.scope === scope ? receipt : null;

  const generate = async (selectedRows) => {
    if (
      generationBlocked ||
      !operation?.isCurrent?.() ||
      generation.current ||
      !validIdentity ||
      !validQuantities ||
      total > 100
    )
      return;
    const selected = selectedRows.filter(
      (row) => Number(quantityFor(row.key)) > 0,
    );
    if (!selected.length) return;
    const attempt = { scope, epoch: epoch.current };
    generation.current = attempt;
    setBusy(true);
    setError(null);
    const isCurrent = () =>
      generation.current === attempt &&
      epoch.current === attempt.epoch &&
      activeScope.current === attempt.scope &&
      operation.isCurrent();
    let pendingUrl = null;
    try {
      const data = await operation.generate({
        orderId: String(orderId),
        labNumber,
        labels: selected.map((row) => ({
          type: row.type,
          sampleItemId: row.sampleItemId,
          quantity: Number(quantityFor(row.key)),
        })),
      });
      if (!isCurrent()) return;
      // Server returns canonical barcodes. Never display a PDF under an old
      // specimen identity after a reorder or stale detail read.
      if (
        data.items.some(
          (item) =>
            selected.find((row) => row.key === lineKey(item))?.barcode !==
            item.barcode,
        )
      ) {
        throw Object.assign(new Error("UNCONFIRMED"), { code: "UNCONFIRMED" });
      }
      const url = data.pdf ? URL.createObjectURL(data.pdf) : null;
      pendingUrl = url;
      if (!isCurrent() || typeof data.confirmConsumed !== "function")
        throw { code: "UNCONFIRMED" };
      data.confirmConsumed();
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
      blobUrl.current = url;
      pendingUrl = null;
      setReceipt({ scope, ...data, url });
    } catch (failure) {
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      if (isCurrent()) {
        setError(failure?.code || "UNCONFIRMED");
        if (failure?.code !== "INVALID_REQUEST") setUnknown(true);
        // Preserve the previous verified PDF for a count-consuming request
        // whose response is uncertain; never silently regenerate it.
      }
    } finally {
      if (isCurrent()) {
        generation.current = null;
        setBusy(false);
      }
    }
  };

  const errorMessages = {
    STALE: msg("order.labels.stale", "请重新核对当前申请后再处理标签。"),
    STORAGE_UNAVAILABLE: msg(
      "order.labels.storage",
      "浏览器无法保存防重复标记，未发送生成请求。",
    ),
    UNAUTHORIZED: msg(
      "order.labelGeneration.unauthorized",
      "Your session has expired. Sign in again before generating labels.",
    ),
    FORBIDDEN: msg(
      "order.labelGeneration.forbidden",
      "You do not have permission to generate labels. Contact an administrator.",
    ),
    REJECTED: msg(
      "order.labelGeneration.rejected",
      "Labels were not generated. Reload the request and check its status, specimen information and configured limits.",
    ),
    INVALID_REQUEST: msg(
      "order.labelGeneration.invalid",
      "Check the selected quantities and specimen identifiers before generating labels.",
    ),
    UNCONFIRMED: msg(
      "order.labelGeneration.unconfirmed",
      "Generation could not be verified. The server may have counted this request. Check existing labels before generating again.",
    ),
    POPUP_BLOCKED: msg(
      "label.print.error.popupBlocked",
      "Popup blocked. Please allow popups for this site to print labels.",
    ),
  };
  const partial = activeReceipt?.items.some(
    (item) => item.generatedQuantity < item.requestedQuantity,
  );

  return (
    <Tile className="order-section print-labels-section recovered-label-panel">
      <h4>{msg("label.print.title", "Print Labels")}</h4>
      <p className="section-description">
        {msg(
          "order.labelGeneration.instructions",
          "Set the copies, generate a PDF, then check each specimen barcode and applied label. Existing labels can be verified without generating them again.",
        )}
      </p>
      <p className="helper-text">
        {msg(
          "order.labelGeneration.quantitiesHelp",
          "Use 0 to skip a label. Select whole numbers from 0 to 100, with at most 100 copies in one request. Site limits may be lower.",
        )}
      </p>
      {!validIdentity && (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title={msg(
            "order.labelGeneration.identityError",
            "Some specimen barcodes are missing or duplicated. Reload the request; do not guess a barcode.",
          )}
        />
      )}
      {!current && (
        <InlineNotification
          kind="warning"
          hideCloseButton
          title={errorMessages.STALE}
        />
      )}
      {(unknown || (!busy && hasPendingLabels())) && (
        <InlineNotification
          kind="warning"
          hideCloseButton
          title={msg(
            "order.labels.pending",
            "本标签页有一次生成结果待核实，已停止再次生成。请联系管理员核对；刷新或重新查询不会解除保护。",
          )}
        />
      )}
      {error && (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title={errorMessages[error] || errorMessages.UNCONFIRMED}
        />
      )}
      <TableContainer
        className="recovered-label-table"
        tabIndex={0}
        aria-label={msg("order.labels.table", "标本标签明细，可横向滚动")}
      >
        <Table
          className="label-generation-table"
          size="md"
          aria-label={msg("label.print.title", "Print Labels")}
        >
          <colgroup>
            <col className="label-identity-column" />
            <col className="label-quantity-column" />
            <col className="label-receipt-column" />
            <col className="label-verification-column" />
          </colgroup>
          <TableHead>
            <TableRow>
              <TableHeader>{msg("label.type", "Label Type")}</TableHeader>
              <TableHeader>{msg("label.quantity", "Quantity")}</TableHeader>
              <TableHeader>
                {msg("order.labelGeneration.receipt", "Generation details")}
              </TableHeader>
              <TableHeader>
                {msg(
                  "order.labelGeneration.verification",
                  "Specimen label check",
                )}
              </TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const generated = activeReceipt?.items.find(
                (item) => lineKey(item) === row.key,
              );
              return (
                <TableRow key={row.key}>
                  <TableCell className="label-identity-cell">
                    <strong>{row.name}</strong>
                    <div>{row.content}</div>
                    <code>{row.barcode || "—"}</code>
                  </TableCell>
                  <TableCell>
                    <NumberInput
                      id={`label-copies-${row.key.replace(":", "-")}`}
                      min={0}
                      max={100}
                      step={1}
                      translateWithId={(id) =>
                        intl.formatMessage({ id: `carbon.${id}` })
                      }
                      label={msg(
                        "order.labelGeneration.copiesFor",
                        "Copies: {name}",
                        { name: row.name },
                      )}
                      hideLabel
                      hideSteppers
                      size="sm"
                      value={quantityFor(row.key)}
                      className="quantity-input"
                      disabled={generationBlocked || busy || !validIdentity}
                      onChange={(event, { value }) =>
                        setQuantities((previous) => ({
                          ...previous,
                          [row.key]: value,
                        }))
                      }
                    />
                  </TableCell>
                  <TableCell className="label-receipt-cell">
                    {generated ? (
                      <Tag type={generated.reason ? "warm-gray" : "blue"}>
                        {generated.reason
                          ? msg(
                              "order.labelGeneration.partialRow",
                              "{generated} / {requested} generated · limit reached",
                              {
                                generated: generated.generatedQuantity,
                                requested: generated.requestedQuantity,
                              },
                            )
                          : msg(
                              "order.labelGeneration.generatedRow",
                              "{count} generated · check printout",
                              { count: generated.generatedQuantity },
                            )}
                      </Tag>
                    ) : (
                      <span>
                        {msg(
                          "order.labelGeneration.noReceipt",
                          "No generation receipt this visit",
                        )}
                      </span>
                    )}
                    <Button
                      kind="ghost"
                      size="sm"
                      onClick={() => generate([row])}
                      disabled={
                        generationBlocked ||
                        busy ||
                        !validIdentity ||
                        !validQuantities ||
                        total > 100 ||
                        Number(quantityFor(row.key)) === 0
                      }
                    >
                      {msg(
                        "order.labelGeneration.generateRow",
                        "Generate this label",
                      )}
                    </Button>
                  </TableCell>
                  <TableCell>
                    {row.type === "specimen" ? (
                      <Checkbox
                        id={`label-verified-${row.key.replace(":", "-")}`}
                        aria-label={msg(
                          "order.labelGeneration.verifyBarcode",
                          "Barcode and label verified: {barcode}",
                          { barcode: row.barcode || "—" },
                        )}
                        labelText={msg(
                          "order.labelGeneration.verifyBarcode",
                          "Barcode and label verified: {barcode}",
                          { barcode: row.barcode || "—" },
                        )}
                        disabled={unavailable || !validIdentity || busy}
                        checked={
                          checks.scope === scope &&
                          checks.items[row.key] === true
                        }
                        onChange={(event, { checked }) =>
                          setChecks((previous) => ({
                            scope,
                            items: {
                              ...(previous.scope === scope
                                ? previous.items
                                : {}),
                              [row.key]: checked,
                            },
                          }))
                        }
                      />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <div className="print-all-actions">
        <p className="helper-text">
          {msg(
            "order.labelGeneration.confirmationScope",
            "Verify every specimen before continuing. These checks apply to this visit only; generating a PDF does not confirm printing or replace the acceptance audit.",
          )}
        </p>
        <Button
          kind="primary"
          renderIcon={DocumentPdf}
          onClick={() => generate(rows)}
          disabled={
            generationBlocked ||
            busy ||
            !validIdentity ||
            !validQuantities ||
            total < 1 ||
            total > 100
          }
        >
          {busy
            ? msg("label.print.generating", "Generating...")
            : msg(
                "order.labelGeneration.generateSelected",
                "Generate selected labels",
              )}
        </Button>
      </div>
      {activeReceipt && (
        <InlineNotification
          kind={partial ? "warning" : "info"}
          lowContrast
          hideCloseButton
          title={msg(
            "order.labelGeneration.generated",
            "Generated {count} labels. This does not confirm physical printing.",
            { count: activeReceipt.totalGenerated },
          )}
          subtitle={
            partial
              ? msg(
                  "order.labelGeneration.limitHelp",
                  "Some labels were not generated. Check existing labels or contact the label administrator; limits have not been overridden.",
                )
              : undefined
          }
        />
      )}
      {activeReceipt?.url && (
        <Button
          kind="secondary"
          renderIcon={DocumentPdf}
          onClick={() => {
            if (!operation?.isCurrent?.()) {
              setError("STALE");
              return;
            }
            const preview = window.open(activeReceipt.url, "_blank");
            if (!preview) setError("POPUP_BLOCKED");
            else {
              preview.opener = null;
              setError(null);
            }
          }}
        >
          {msg("order.labelGeneration.viewPdf", "View generated PDF")}
        </Button>
      )}
    </Tile>
  );
}
