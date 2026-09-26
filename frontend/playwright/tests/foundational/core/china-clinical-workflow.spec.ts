import { expect, test } from "../../../helpers/test-base";
import type { Page } from "@playwright/test";
import { LONG_TIMEOUT, UI_TIMEOUT } from "../../../helpers/timeouts";

const TEST_PATIENT_NUMBER = "E2E-PAGING-1-001";
const API_ROOT = "/api/OpenELIS-Global";
const REPORT_GROUP_KEY = "SIM-WBC";
const CERTIFICATION_TEXT =
  "I understand that by providing my login credentials, I am creating a legally " +
  "binding electronic signature that carries the same weight as my handwritten " +
  "signature. I certify that I am the sole owner of these credentials and that " +
  "I will not share them with anyone else.";

const csrfHeaders = async (page: Page) => {
  const csrf = await page.evaluate(() => localStorage.getItem("CSRF"));
  expect(csrf, "验收写入必须使用当前登录会话的 CSRF 令牌").toBeTruthy();
  return { "X-CSRF-Token": csrf! };
};

const esigEnabled = async (page: Page): Promise<boolean> => {
  const response = await page.request.get(`${API_ROOT}/rest/esig/enabled`);
  expect(response.status()).toBe(200);
  return ((await response.json()) as { enabled: boolean }).enabled;
};

const setEsigEnabled = async (page: Page, enabled: boolean) => {
  const menu = await page.request.get(`${API_ROOT}/rest/SiteInformationMenu`);
  expect(menu.status()).toBe(200);
  const list = (await menu.json()) as {
    menuList: { id: string; name: string }[];
  };
  const setting = list.menuList.find(
    (item) => item.name === "electronicSignatureEnabled",
  );
  expect(setting, "站点配置须包含 electronicSignatureEnabled").toBeTruthy();
  const url = `${API_ROOT}/rest/SiteInformation?ID=${setting!.id}`;
  const current = await page.request.get(url);
  expect(current.status()).toBe(200);
  const form = (await current.json()) as Record<string, unknown>;
  expect(form.paramName).toBe("electronicSignatureEnabled");
  const saved = await page.request.post(url, {
    headers: await csrfHeaders(page),
    data: { ...form, value: String(enabled) },
  });
  expect(saved.status()).toBe(200);
  await expect
    .poll(() => esigEnabled(page), { timeout: LONG_TIMEOUT })
    .toBe(enabled);
};

const ensureReportGroup = async (page: Page) => {
  const response = await page.request.get(
    `${API_ROOT}/rest/reports/group-rules`,
  );
  expect([200, 409], "分组规则读取应返回已有配置或未配置状态").toContain(
    response.status(),
  );
  const current =
    response.status() === 200
      ? ((await response.json()) as {
          ruleVersion: string;
          groups: { key: string; label: string; testIds: string[] }[];
        })
      : null;
  const group = current?.groups.find((item) => item.key === REPORT_GROUP_KEY);
  if (group) {
    expect(
      group.testIds,
      "模拟白细胞报告分组须包含真实可录入项目 13",
    ).toContain("13");
    return;
  }
  const saved = await page.request.put(`${API_ROOT}/rest/reports/group-rules`, {
    headers: await csrfHeaders(page),
    data: {
      expectedRuleVersion: current?.ruleVersion || null,
      groups: [
        ...(current?.groups || []),
        { key: REPORT_GROUP_KEY, label: "模拟白细胞报告", testIds: ["13"] },
      ],
    },
  });
  expect(saved.status()).toBe(200);
  const rules = (await saved.json()) as {
    groups: { key: string; testIds: string[] }[];
  };
  expect(rules.groups).toContainEqual(
    expect.objectContaining({ key: REPORT_GROUP_KEY, testIds: ["13"] }),
  );
};

const ensureReportSigner = async (page: Page) => {
  const username = process.env.TEST_USER || "admin";
  const certified = await page.request.get(
    `${API_ROOT}/rest/esig/certified/${encodeURIComponent(username)}`,
  );
  expect(certified.status()).toBe(200);
  if (((await certified.json()) as { certified: boolean }).certified) return;
  const created = await page.request.post(`${API_ROOT}/rest/esig/certify`, {
    headers: await csrfHeaders(page),
    data: {
      username,
      password: process.env.TEST_PASS || "adminADMIN!",
      certificationText: CERTIFICATION_TEXT,
    },
  });
  expect(created.status()).toBe(200);
  const reread = await page.request.get(
    `${API_ROOT}/rest/esig/certified/${encodeURIComponent(username)}`,
  );
  expect(reread.status()).toBe(200);
  expect(((await reread.json()) as { certified: boolean }).certified).toBe(
    true,
  );
};

const expectNoDesktopOverflow = async (page: Page) => {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
      { timeout: UI_TIMEOUT },
    )
    .toBeLessThanOrEqual(2);
};

test.describe.serial("中国临床检验业务闭环", () => {
  test("申请、标本、结果、审核和报告保持同一条业务链", async ({
    page,
  }, testInfo) => {
    test.setTimeout(360_000);
    let labNumber = "";
    let sampleId = "";
    let patientId = "";
    let sampleItemId = "";
    let tubeCode = "";
    let analysisId = "";
    let intakeOperationId = "";
    let documentId = "";
    let releaseId = 0;
    let outboxId = 0;
    const captureStage = async (stage: string) => {
      const path = testInfo.outputPath(`${stage}.png`);
      await page.screenshot({ path, fullPage: true });
      await testInfo.attach(stage, { path, contentType: "image/png" });
    };
    const notFoundUrls = new Set<string>();
    const deprecatedUiWarnings = new Set<string>();
    page.on("response", (response) => {
      if (response.status() === 404) {
        notFoundUrls.add(response.url());
      }
    });
    page.on("console", (message) => {
      const text = message.text();
      if (
        text.includes("filter` prop for Tag has been deprecated") ||
        text.includes("value` prop instead of placing it on DatePickerInput")
      ) {
        deprecatedUiWarnings.add(text);
      }
    });

    await test.step("准备隔离环境中的报告分组和签名状态", async () => {
      await page.goto("/order/enter", { waitUntil: "domcontentloaded" });
      if (!(await esigEnabled(page))) await setEsigEnabled(page, true);
      await ensureReportGroup(page);
      await ensureReportSigner(page);
    });

    await test.step("建立检验申请", async () => {
      await page.goto("/order/enter", { waitUntil: "domcontentloaded" });
      await expect(
        page.getByRole("heading", { level: 2, name: "新建申请" }),
      ).toBeVisible({ timeout: LONG_TIMEOUT });

      await page.locator("#patientQuickQuery").fill(TEST_PATIENT_NUMBER);
      await page
        .locator(".patient-quick-search")
        .getByRole("button", { name: "搜索" })
        .click();
      const patientRow = page
        .getByRole("row")
        .filter({ hasText: TEST_PATIENT_NUMBER });
      await expect(patientRow).toBeVisible({ timeout: LONG_TIMEOUT });
      await patientRow.getByRole("button", { name: "选择" }).click();
      await expect(
        page.locator(".patient-search-section .selected-entity-card"),
      ).toContainText(TEST_PATIENT_NUMBER, { timeout: LONG_TIMEOUT });

      const selectedFacility = page.locator(
        ".requester-section .requester-master-data-card",
      );
      await selectedFacility
        .waitFor({ state: "visible", timeout: 10_000 })
        .catch(() => undefined);
      if (!(await selectedFacility.isVisible().catch(() => false))) {
        await page.locator("#siteName").fill("本院");
        const searchFacility = page
          .locator(".requester-section .subsection")
          .first()
          .getByRole("button", { name: "搜索" });
        await searchFacility.click({ timeout: 10_000 }).catch(async (error) => {
          if (!(await selectedFacility.isVisible().catch(() => false))) {
            throw error;
          }
        });
        const facilityRow = page
          .locator(".requester-section")
          .getByRole("row")
          .filter({ hasText: "本院" });
        await expect(facilityRow.or(selectedFacility)).toBeVisible({
          timeout: LONG_TIMEOUT,
        });
        if (await facilityRow.isVisible().catch(() => false)) {
          await facilityRow.getByRole("button", { name: "选择" }).click();
        }
      }
      await expect(selectedFacility).toBeVisible({ timeout: LONG_TIMEOUT });

      const sampleType = page.locator("#sampleType-0");
      await expect(sampleType).toBeVisible({ timeout: LONG_TIMEOUT });
      const wholeBloodValue = await sampleType
        .locator("option")
        .filter({ hasText: "全血" })
        .first()
        .evaluate((option) => option.getAttribute("value"));
      expect(wholeBloodValue, "全血标本主数据必须存在").toBeTruthy();
      await sampleType.selectOption(wholeBloodValue!);

      const firstTest = page
        .locator('.sample-test-section input[id^="test-0-"]')
        .first();
      const wbcLabel = page
        .locator('.sample-test-section label[for^="test-0-"]')
        .filter({ hasText: "白细胞计数（WBC）" })
        .first();
      await expect(wbcLabel).toBeVisible({ timeout: UI_TIMEOUT });
      const preferredTestId = await wbcLabel.getAttribute("for");
      const testCheckbox = preferredTestId
        ? page.locator(`#${preferredTestId}`)
        : firstTest;
      await expect(testCheckbox).toBeAttached({ timeout: LONG_TIMEOUT });
      const testId = await testCheckbox.evaluate((input) =>
        input.getAttribute("id"),
      );
      expect(testId).toBeTruthy();
      await page.locator(`label[for="${testId}"]`).click();

      const saveAndCollect = page.locator(
        ".save-navigation-buttons .forward-button",
      );
      await expect(saveAndCollect).toBeEnabled({ timeout: UI_TIMEOUT });
      await saveAndCollect.click();
      await expect(page).toHaveURL(/\/order\/collect$/, {
        timeout: LONG_TIMEOUT,
      });
      labNumber =
        (await page.locator(".context-lab-number").textContent())?.trim() || "";
      expect(labNumber, "保存申请后必须生成实验室编号").toBeTruthy();
      await expectNoDesktopOverflow(page);
    });

    await test.step("仅采集实管，签收和验收保持未完成", async () => {
      await expect(page.locator("#collectionDate-0")).toBeVisible({
        timeout: LONG_TIMEOUT,
      });
      await page.locator('label[for="collection-receipt-later"]').click();
      await expect(
        page.getByRole("radio", { name: "仅采集，稍后签收" }),
      ).toBeChecked();
      await expect(page.locator("#receivedDate-0")).toHaveValue("");
      await expect(page.locator("#receivedTime-0")).toHaveValue("");
      await page.locator("#collector-0").fill("SIM-COL-01");
      const unit = await page
        .locator("#quantityUnit-0 option")
        .filter({ hasText: "mL" })
        .first()
        .evaluate((option) => option.getAttribute("value"));
      expect(unit).toBeTruthy();
      await page.locator("#quantityUnit-0").selectOption(unit!);
      const saveAndLabel = page.locator(
        ".save-navigation-buttons .forward-button",
      );
      await expect(saveAndLabel).toBeEnabled({ timeout: UI_TIMEOUT });
      await saveAndLabel.click();
      await expect(page).toHaveURL(/\/order\/label$/, {
        timeout: LONG_TIMEOUT,
      });

      const savedOrderResponse = await page.request.get(
        `${API_ROOT}/rest/order/search?labNumber=${encodeURIComponent(labNumber)}`,
      );
      expect(savedOrderResponse.status()).toBe(200);
      const savedOrder = (await savedOrderResponse.json()) as {
        id?: string | number;
        patientProperties?: { patientPK?: string | number };
      };
      sampleId = String(savedOrder.id || "");
      patientId = String(savedOrder.patientProperties?.patientPK || "");
      expect(sampleId).toMatch(/^[1-9]\d*$/);
      expect(patientId).toMatch(/^[1-9]\d*$/);
      const lookup = await page.request.get(
        `${API_ROOT}/rest/specimen-intake/lookup?code=${encodeURIComponent(labNumber)}`,
      );
      expect(lookup.status()).toBe(200);
      const order = await lookup.json();
      expect(order.current.sampleId).toBe(sampleId);
      expect(order.current.physicalSpecimens).toHaveLength(1);
      const specimen = order.current.physicalSpecimens[0];
      sampleItemId = specimen.id;
      tubeCode = `${labNumber}.${specimen.sortOrder}`;
      expect(specimen.collectionDate).toBeTruthy();
      // The order's receivedDate is a legacy registration field. Only the
      // physical specimen receipt is evidence that this tube reached the lab.
      expect(specimen.receivedDate ?? null).toBeNull();
      expect(specimen.decisionState).toBe("NOT_RECORDED");
    });

    await test.step("打印申请及同一实管标签，再从页面进入扫码签收", async () => {
      // Existing product prints a physical label after collection. This scenario
      // does not claim to verify pre-collection tube barcode allocation.
      for (const label of [
        { text: "申请单标签", type: "order", code: labNumber },
        { text: tubeCode, type: "specimen", code: tubeCode },
      ]) {
        const row = page.getByRole("row").filter({ hasText: label.text });
        await expect(row).toBeVisible({ timeout: LONG_TIMEOUT });
        const pdfPromise = page.context().waitForEvent("response", {
          predicate: (response) => response.url().includes("LabelMakerServlet"),
          timeout: LONG_TIMEOUT,
        });
        const popupPromise = page.waitForEvent("popup");
        await row.getByRole("button", { name: "打印标签" }).click();
        const [popup, pdf] = await Promise.all([popupPromise, pdfPromise]);
        const labelUrl = new URL(pdf.url());
        expect(labelUrl.searchParams.get("type")).toBe(label.type);
        expect(labelUrl.searchParams.get("labNo")).toBe(label.code);
        // Inspect the actual print response; fetching it again prints twice.
        expect(pdf.status()).toBe(200);
        expect(pdf.headers()["content-type"]).toContain("pdf");
        // Navigation bodies in Chrome are PDF-viewer HTML, not server bytes.
        // Verify the real print response here; formal report bytes are checked below.
        if (!popup.isClosed()) await popup.close();
      }
      await page.locator('label[for="skip-storage-checkbox"]').click();
      const next = page.locator(".save-navigation-buttons .forward-button");
      await expect(next).toBeEnabled({ timeout: UI_TIMEOUT });
      await next.click();
      await expect(page).toHaveURL(/\/order\/collect$/, {
        timeout: LONG_TIMEOUT,
      });
      await expect(page.locator("#specimen-intake-lookup")).toHaveValue(
        tubeCode,
      );
      await page.getByRole("button", { name: "查询当前状态" }).click();
    });

    await test.step("独立签收同一实管并回读接收事实", async () => {
      const receive = page.getByRole("button", { name: "确认此管签收" });
      await expect(receive).toBeVisible({ timeout: LONG_TIMEOUT });
      await expect(receive).toBeDisabled();
      await page
        .locator('label[for="specimen-lookup-confirm-identity"]')
        .click();
      const write = page.waitForResponse(
        (response) =>
          response.url().includes("/rest/specimen-receipts") &&
          response.request().method() === "POST",
      );
      await receive.click();
      expect((await write).status()).toBe(200);
      await expect(page.getByText(/签收已回查，当前状态见下表/)).toBeVisible({
        timeout: LONG_TIMEOUT,
      });
      const current = await page.request.get(
        `${API_ROOT}/rest/specimen-intake/lookup?code=${encodeURIComponent(tubeCode)}`,
      );
      expect(current.status()).toBe(200);
      const tube = (await current.json()).current.physicalSpecimens[0];
      expect(tube.id).toBe(sampleItemId);
      expect(tube.receivedDate).toBeTruthy();
      expect(tube.decisionState).toBe("NOT_RECORDED");
    });

    await test.step("独立验收同一实管并从页面进入结果录入", async () => {
      const accept = page.getByRole("button", { name: "确认此管验收" });
      await expect(accept).toBeVisible({ timeout: LONG_TIMEOUT });
      await expect(accept).toBeDisabled();
      await page
        .locator('label[for="specimen-lookup-confirm-identity"]')
        .click();
      const write = page.waitForResponse(
        (response) =>
          response.url().includes("/rest/specimen-intake-decisions") &&
          response.request().method() === "POST",
      );
      await accept.click();
      const decision = await write;
      expect(decision.status()).toBe(200);
      intakeOperationId = decision.request().postDataJSON().operationId;
      await expect(page.getByText(/验收已回查，当前状态见下表/)).toBeVisible({
        timeout: LONG_TIMEOUT,
      });
      const current = await page.request.get(
        `${API_ROOT}/rest/specimen-intake/lookup?code=${encodeURIComponent(tubeCode)}`,
      );
      expect(current.status()).toBe(200);
      const accepted = (await current.json()).current.physicalSpecimens[0];
      expect(accepted.id).toBe(sampleItemId);
      expect(accepted.recordedDecision).toBe("ACCEPTED");
      expect(accepted.operationId).toBe(intakeOperationId);
      await captureStage("05-accepted");
      await page
        .locator(".specimen-lookup")
        .getByRole("button", { name: "结果录入", exact: true })
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/Results\\?accessionNumber=${labNumber}$`),
        { timeout: LONG_TIMEOUT },
      );
    });

    await test.step("录入检验结果", async () => {
      const resultRow = page
        .getByRole("row")
        .filter({ hasText: labNumber })
        .first();
      await expect(resultRow).toBeVisible({ timeout: LONG_TIMEOUT });
      const resultInput = resultRow.locator('[id^="unifiedResultValue-"]');
      await expect(resultInput).toBeVisible({ timeout: UI_TIMEOUT });
      await resultInput.fill("7.2");
      const saved = page.waitForResponse(
        (response) =>
          /\/rest\/results-entry\/analysis\/\d+\/result$/.test(
            response.url(),
          ) && response.request().method() === "POST",
      );
      await resultRow.getByRole("button", { name: "保存" }).click();
      await page
        .locator("#signature-password")
        .fill(process.env.TEST_PASS || "adminADMIN!");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "签名", exact: true })
        .click();
      const savedResult = await saved;
      expect(savedResult.status()).toBe(200);
      analysisId =
        savedResult.url().match(/analysis\/(\d+)\/result$/)?.[1] || "";
      expect(analysisId).toMatch(/^[1-9]\d*$/);
      await expect(
        resultRow.locator(".unifiedResultsReadOnlyValue"),
      ).toHaveText("7.2", { timeout: LONG_TIMEOUT });
      await expectNoDesktopOverflow(page);
    });

    await test.step("复核并批准检验结果", async () => {
      await page
        .getByRole("row")
        .filter({ hasText: labNumber })
        .first()
        .getByRole("button", { name: "进入审核", exact: true })
        .click();
      await expect(page).toHaveURL(/\/AccessionValidation\?/, {
        timeout: LONG_TIMEOUT,
      });
      await expect(
        page.getByTestId("LabNo").filter({ hasText: labNumber }),
      ).toBeVisible({
        timeout: LONG_TIMEOUT,
      });
      await page.locator('label[for="saveallresults"]').click();
      const validationResponse = page.waitForResponse(
        (response) =>
          response.url().includes("/rest/AccessionValidation") &&
          response.request().method() === "POST",
        { timeout: LONG_TIMEOUT },
      );
      await page.getByRole("button", { name: "提交审核" }).click();
      await page
        .locator("#signature-password")
        .fill(process.env.TEST_PASS || "adminADMIN!");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "签名", exact: true })
        .click();
      const reviewed = await validationResponse;
      expect(reviewed.status()).toBe(200);
    });

    await test.step("冻结并签发同一申请的正式患者报告", async () => {
      await page
        .getByRole("link", { name: `正式检验报告 · ${labNumber}`, exact: true })
        .click();
      await expect(page).toHaveURL(
        `/PatientResults/${patientId}?sampleId=${sampleId}`,
        { timeout: LONG_TIMEOUT },
      );
      const application = page.locator("#report-application");
      await expect(
        application.locator("option").filter({ hasText: labNumber }),
      ).toBeAttached({ timeout: LONG_TIMEOUT });
      await expect(application).toHaveValue(sampleId, {
        timeout: LONG_TIMEOUT,
      });

      const group = page.locator("#report-group");
      await expect(
        group.locator(`option[value="${REPORT_GROUP_KEY}"]`),
        `隔离验收环境须配置 ${REPORT_GROUP_KEY} 报告分组`,
      ).toBeAttached({ timeout: LONG_TIMEOUT });
      await group.selectOption(REPORT_GROUP_KEY);

      const prepared = page.waitForResponse(
        (response) =>
          response.url().endsWith("/rest/reports/documents") &&
          response.request().method() === "POST",
        { timeout: LONG_TIMEOUT },
      );
      await page.getByRole("button", { name: "建立分组报告文档" }).click();
      const preparedResponse = await prepared;
      expect(preparedResponse.status()).toBe(200);
      const document = (await preparedResponse.json()) as {
        id: string;
        sampleId: string;
        patientId: string;
        analysisIds: string[];
      };
      documentId = document.id;
      expect(document.sampleId).toBe(sampleId);
      expect(document.patientId).toBe(patientId);
      expect(document.analysisIds).toHaveLength(1);
      await expect(page.locator("#report-document")).toHaveValue(documentId, {
        timeout: LONG_TIMEOUT,
      });

      const drafted = page.waitForResponse(
        (response) =>
          response
            .url()
            .endsWith(`/rest/reports/documents/${documentId}/releases`) &&
          response.request().method() === "POST",
        { timeout: LONG_TIMEOUT },
      );
      await page.getByRole("button", { name: "准备首次草稿" }).click();
      const draftedResponse = await drafted;
      expect(draftedResponse.status()).toBe(200);
      const draft = (await draftedResponse.json()) as {
        id: number;
        status: string;
      };
      releaseId = draft.id;
      expect(draft.status).toBe("DRAFT");
      await expect(page.locator("#report-version")).toHaveValue(
        String(releaseId),
        { timeout: LONG_TIMEOUT },
      );

      const frozen = page.waitForResponse(
        (response) =>
          response
            .url()
            .endsWith(
              `/rest/reports/documents/${documentId}/releases/${releaseId}/freeze`,
            ) && response.request().method() === "POST",
        { timeout: LONG_TIMEOUT },
      );
      await page.getByRole("button", { name: "冻结报告内容" }).click();
      const frozenResponse = await frozen;
      expect(frozenResponse.status()).toBe(200);
      const snapshot = (await frozenResponse.json()) as {
        releaseId: number;
        snapshotSha256: string;
        snapshot: {
          scope: { sampleId: string; analysisIds: string[] };
          report: { rows: unknown[] };
        };
      };
      expect(snapshot.releaseId).toBe(releaseId);
      expect(snapshot.snapshot.scope.sampleId).toBe(sampleId);
      expect(snapshot.snapshot.scope.analysisIds).toEqual(document.analysisIds);
      expect(JSON.stringify(snapshot.snapshot.report.rows)).toMatch(
        /7\.2(?:0)?/,
      );
      await expect(
        page.locator('label[for="report-confirm-frozen"]'),
      ).toBeVisible({
        timeout: LONG_TIMEOUT,
      });
      await page.locator('label[for="report-confirm-frozen"]').click();
      await page
        .locator("#report-password")
        .fill(process.env.TEST_PASS || "adminADMIN!");

      const issued = page.waitForResponse(
        (response) =>
          response
            .url()
            .endsWith(
              `/rest/reports/documents/${documentId}/releases/${releaseId}/issue`,
            ) && response.request().method() === "POST",
        { timeout: LONG_TIMEOUT },
      );
      await page.getByRole("button", { name: "签名并签发本版" }).click();
      const issuedResponse = await issued;
      expect(issuedResponse.status()).toBe(200);
      const release = (await issuedResponse.json()) as {
        id: number;
        status: string;
        pdfSha256: string;
        issuedAt: string;
      };
      expect(release.id).toBe(releaseId);
      expect(release.status).toBe("ISSUED");
      expect(release.pdfSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(release.issuedAt).toBeTruthy();
      await expect(page.getByText("当前正式报告", { exact: true })).toBeVisible(
        { timeout: LONG_TIMEOUT },
      );

      const detailResponse = await page.request.get(
        `${API_ROOT}/rest/reports/documents/${documentId}/releases/${releaseId}`,
      );
      expect(detailResponse.status()).toBe(200);
      const detail = (await detailResponse.json()) as {
        release: { id: number; status: string; pdfSha256: string };
        scope: { sampleId: string };
        canPrintCurrent: boolean;
      };
      expect(detail.release.id).toBe(releaseId);
      expect(detail.release.status).toBe("ISSUED");
      expect(detail.release.pdfSha256).toBe(release.pdfSha256);
      expect(detail.scope.sampleId).toBe(sampleId);
      expect(detail.canPrintCurrent).toBe(true);

      const pdf = page.waitForResponse(
        (response) =>
          response
            .url()
            .endsWith(
              `/rest/reports/documents/${documentId}/releases/${releaseId}.pdf`,
            ) && response.request().method() === "GET",
        { timeout: LONG_TIMEOUT },
      );
      await page.getByRole("button", { name: "查阅历史原件" }).click();
      const pdfResponse = await pdf;
      expect(pdfResponse.status()).toBe(200);
      expect(pdfResponse.headers()["content-type"]).toContain(
        "application/pdf",
      );
      const originalPdf = await pdfResponse.body();
      expect(originalPdf.subarray(0, 4).toString()).toBe("%PDF");
      await testInfo.attach("issued-report.pdf", {
        body: originalPdf,
        contentType: "application/pdf",
      });
      await expect(page.getByTitle("存储原件 — 历史查阅")).toBeVisible({
        timeout: LONG_TIMEOUT,
      });
      await captureStage("08-issued-report");
    });

    await test.step("同一正式报告写入本地待发送记录", async () => {
      const listed = await page.request.get(
        `${API_ROOT}/rest/his-result-outbox?limit=200`,
      );
      expect(listed.status()).toBe(200);
      const rows = (await listed.json()) as {
        id: number;
        sourceSystem: string;
        businessId: string;
        status: string;
        eventType: string;
      }[];
      const event = rows.find(
        (row) =>
          row.sourceSystem === "LIS-CN" && row.businessId === String(releaseId),
      );
      expect(
        event,
        "正式签发应自动产生同一版报告的 HIS 待发送记录",
      ).toBeTruthy();
      expect(event?.status).toBe("PENDING");
      expect(event?.eventType).toBe("REPORT");
      outboxId = event!.id;
    });

    await testInfo.attach("workflow-identities", {
      body: JSON.stringify({
        labNumber,
        patientId,
        sampleId,
        sampleItemId,
        tubeCode,
        analysisId,
        intakeOperationId,
        documentId,
        releaseId,
        outboxId,
      }),
      contentType: "application/json",
    });
    expect([...notFoundUrls], "核心业务流不应请求不存在的资源").toEqual([]);
    expect(
      [...deprecatedUiWarnings],
      "核心业务流不应使用已废弃的标签或日期组件契约",
    ).toEqual([]);
  });
});
