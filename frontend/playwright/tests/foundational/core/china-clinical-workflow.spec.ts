import { expect, test } from "../../../helpers/test-base";
import type { Page } from "@playwright/test";
import { LONG_TIMEOUT, UI_TIMEOUT } from "../../../helpers/timeouts";

const TEST_PATIENT_NUMBER = "TEST-CN-20260823-002";

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
  test("申请、标本、结果、审核和报告保持同一条业务链", async ({ page }) => {
    test.setTimeout(240_000);
    let labNumber = "";
    let receivedDate = "";
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
        .getAttribute("value");
      expect(wholeBloodValue, "全血标本主数据必须存在").toBeTruthy();
      await sampleType.selectOption(wholeBloodValue!);

      const firstTest = page
        .locator('.sample-test-section input[id^="test-0-"]')
        .first();
      const wbcLabel = page
        .locator('.sample-test-section label[for^="test-0-"]')
        .filter({ hasText: /白细胞|WBC/i })
        .first();
      const preferredTestId = await wbcLabel.getAttribute("for");
      const testCheckbox = preferredTestId
        ? page.locator(`#${preferredTestId}`)
        : firstTest;
      await expect(testCheckbox).toBeAttached({ timeout: LONG_TIMEOUT });
      const testId = await testCheckbox.getAttribute("id");
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

    await test.step("采集并签收标本", async () => {
      await expect(
        page.getByRole("heading", { level: 2, name: "采集签收" }),
      ).toBeVisible({ timeout: LONG_TIMEOUT });
      await expect(page.locator("#collectionDate-0")).not.toHaveValue("");
      await expect(page.locator("#receivedDate-0")).not.toHaveValue("");
      receivedDate = await page.locator("#receivedDate-0").inputValue();

      const saveAndLabel = page.locator(
        ".save-navigation-buttons .forward-button",
      );
      await expect(saveAndLabel).toBeEnabled({ timeout: UI_TIMEOUT });
      await saveAndLabel.click();
      await expect(page).toHaveURL(/\/order\/label$/, {
        timeout: LONG_TIMEOUT,
      });
      const savedOrderResponse = await page.request.get(
        `/api/OpenELIS-Global/rest/order/search?labNumber=${encodeURIComponent(labNumber)}`,
      );
      expect(savedOrderResponse.status()).toBe(200);
      const savedOrder = (await savedOrderResponse.json()) as {
        receivedDate?: string;
      };
      expect(
        savedOrder.receivedDate,
        "采集签收日期必须按中国日期格式原值持久化，不能发生年份错位",
      ).toBe(receivedDate);
      await expectNoDesktopOverflow(page);
    });

    await test.step("打印标签并登记立即送检", async () => {
      const orderLabelRow = page
        .getByRole("row")
        .filter({ hasText: "申请单标签" });
      await expect(orderLabelRow).toBeVisible({ timeout: LONG_TIMEOUT });
      const labelRequestPromise = page.context().waitForEvent("request", {
        predicate: (request) => request.url().includes("LabelMakerServlet"),
        timeout: LONG_TIMEOUT,
      });
      const popupPromise = page.waitForEvent("popup");
      await orderLabelRow.getByRole("button", { name: "打印标签" }).click();
      const [labelPdf, labelRequest] = await Promise.all([
        popupPromise,
        labelRequestPromise,
      ]);
      expect(labelRequest.url()).toContain(
        "/api/OpenELIS-Global/LabelMakerServlet",
      );
      const labelResponse = await page.request.get(labelRequest.url());
      expect(labelResponse.status()).toBe(200);
      expect(labelResponse.headers()["content-type"]).toContain("pdf");
      if (!labelPdf.isClosed()) {
        await labelPdf.close();
      }

      await page.locator('label[for="skip-storage-checkbox"]').click();
      const saveAndAcceptance = page.locator(
        ".save-navigation-buttons .forward-button",
      );
      await expect(saveAndAcceptance).toBeEnabled({ timeout: UI_TIMEOUT });
      await saveAndAcceptance.click();
      await expect(page).toHaveURL(/\/order\/qa$/, {
        timeout: LONG_TIMEOUT,
      });
      await expectNoDesktopOverflow(page);
    });

    await test.step("完成标本验收", async () => {
      const qaChecks = page.locator('.qa-checklist-items input[id^="qa-"]');
      await expect(qaChecks.first()).toBeAttached({ timeout: LONG_TIMEOUT });
      for (let index = 0; index < (await qaChecks.count()); index += 1) {
        const checkbox = qaChecks.nth(index);
        if (!(await checkbox.isChecked())) {
          const id = await checkbox.getAttribute("id");
          await page.locator(`label[for="${id}"]`).click();
        }
      }

      const complete = page.locator(".save-navigation-buttons .forward-button");
      await expect(complete).toBeEnabled({ timeout: UI_TIMEOUT });
      await complete.click();
      await expect(page.locator(".qa-success-tile")).toContainText(labNumber, {
        timeout: LONG_TIMEOUT,
      });
    });

    await test.step("录入检验结果", async () => {
      await page.goto(
        `/Results?accessionNumber=${encodeURIComponent(labNumber)}`,
        { waitUntil: "domcontentloaded" },
      );
      const resultRow = page
        .getByRole("row")
        .filter({ hasText: labNumber })
        .first();
      await expect(resultRow).toBeVisible({ timeout: LONG_TIMEOUT });
      const resultInput = resultRow.locator('[id^="unifiedResultValue-"]');
      await expect(resultInput).toBeVisible({ timeout: UI_TIMEOUT });
      await resultInput.fill("7.2");
      await resultRow.getByRole("button", { name: "保存" }).click();
      await expect(
        resultRow.locator(".unifiedResultsReadOnlyValue"),
      ).toHaveText("7.2", { timeout: LONG_TIMEOUT });
      await expectNoDesktopOverflow(page);
    });

    await test.step("审核并签发结果", async () => {
      await page.goto(
        `/validation?type=order&accessionNumber=${encodeURIComponent(labNumber)}`,
        { waitUntil: "domcontentloaded" },
      );
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
      await page.getByRole("button", { name: /^(验证|审核签发)$/ }).click();
      expect((await validationResponse).status()).toBe(200);
    });

    await test.step("生成正式患者检验报告", async () => {
      await page.goto(
        "/RoutineReport?type=patient&report=patientCILNSP_vreduit",
        { waitUntil: "domcontentloaded" },
      );
      await page.locator('label[for="report-filter-lab-number"]').click();
      const byLabNumber = page.getByText("按实验室编号", { exact: false });
      if (await byLabNumber.isVisible().catch(() => false)) {
        await byLabNumber.click();
      }
      await page
        .getByRole("button", { name: "实验室编号", exact: true })
        .click();
      await expect(page.locator("#from")).toBeVisible({
        timeout: UI_TIMEOUT,
      });
      await page.locator("#from").fill(labNumber);
      await page.locator("#to").fill(labNumber);

      const reportRequestPromise = page.context().waitForEvent("request", {
        predicate: (request) => request.url().includes("ReportPrint"),
        timeout: LONG_TIMEOUT,
      });
      const reportPopupPromise = page.waitForEvent("popup");
      await page.locator('[data-cy="printableVersion"]').click();
      const [reportPopup, reportRequest] = await Promise.all([
        reportPopupPromise,
        reportRequestPromise,
      ]);
      const reportUrl = reportRequest.url();
      expect(reportUrl).toContain("ReportPrint");
      const reportResponse = await page.request.get(reportUrl);
      expect(reportResponse.status()).toBe(200);
      expect(reportResponse.headers()["content-type"]).toContain("pdf");
      if (!reportPopup.isClosed()) {
        await reportPopup.close();
      }
    });

    expect([...notFoundUrls], "核心业务流不应请求不存在的资源").toEqual([]);
    expect(
      [...deprecatedUiWarnings],
      "核心业务流不应使用已废弃的标签或日期组件契约",
    ).toEqual([]);
  });
});
