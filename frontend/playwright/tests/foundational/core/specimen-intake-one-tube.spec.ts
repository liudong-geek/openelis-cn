import { expect, test } from "../../../helpers/test-base";
import { LONG_TIMEOUT, UI_TIMEOUT } from "../../../helpers/timeouts";

const API_ROOT = "/api/OpenELIS-Global";
const PATIENT_NUMBER = "E2E-PAGING-1-001";

// The workstation and laboratory deliberately use different time zones.
test.use({ timezoneId: "Asia/Shanghai" });

test("一管仅采集后扫码签收并验收，逐步回读真实管状态", async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  await page.goto("/order/enter", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "新建申请" })).toBeVisible({
    timeout: LONG_TIMEOUT,
  });

  await page.locator("#patientQuickQuery").fill(PATIENT_NUMBER);
  await page
    .locator(".patient-quick-search")
    .getByRole("button", { name: "搜索" })
    .click();
  await page
    .getByRole("row")
    .filter({ hasText: PATIENT_NUMBER })
    .getByRole("button", { name: "选择" })
    .click();
  await expect(
    page.locator(".patient-search-section .selected-entity-card"),
  ).toContainText(PATIENT_NUMBER, { timeout: LONG_TIMEOUT });
  const facility = page.locator(
    ".requester-section .requester-master-data-card",
  );
  if (!(await facility.isVisible().catch(() => false))) {
    await page.locator("#siteName").fill("CAMES MAN");
    await page
      .locator(".requester-section .subsection")
      .first()
      .getByRole("button", { name: "搜索" })
      .click();
    const facilityRow = page
      .locator(".requester-section")
      .getByRole("row")
      .filter({ hasText: "CAMES MAN" });
    await expect(facilityRow).toBeVisible({ timeout: LONG_TIMEOUT });
    await facilityRow.getByRole("button", { name: "选择" }).click();
  }
  await expect(facility).toBeVisible({ timeout: LONG_TIMEOUT });

  const wholeBlood = await page
    .locator("#sampleType-0 option")
    .filter({ hasText: "全血" })
    .first()
    .evaluate((option) => option.getAttribute("value"));
  expect(wholeBlood).toBeTruthy();
  await page.locator("#sampleType-0").selectOption(wholeBlood!);
  const wbcId = await page
    .locator('.sample-test-section label[for^="test-0-"]')
    .filter({ hasText: /白细胞|WBC/i })
    .first()
    .evaluate((label) => label.getAttribute("for"));
  expect(wbcId).toBeTruthy();
  await page.locator(`label[for="${wbcId}"]`).click();
  await page.locator(".save-navigation-buttons .forward-button").click();
  await expect(page).toHaveURL(/\/order\/collect$/, {
    timeout: LONG_TIMEOUT,
  });
  const labNo =
    (await page.locator(".context-lab-number").textContent())?.trim() || "";
  expect(labNo).toBeTruthy();

  await test.step("只采集一根实管，签收时刻保持空值", async () => {
    await expect(page.locator("#collectionDate-0")).toBeVisible({
      timeout: LONG_TIMEOUT,
    });
    await page.locator('label[for="collection-receipt-later"]').click();
    await expect(
      page.getByRole("radio", { name: "仅采集，稍后签收" }),
    ).toBeChecked();
    await expect(page.locator("#receivedDate-0")).toHaveValue("");
    await expect(page.locator("#receivedTime-0")).toHaveValue("");
    await page.locator("#collector-0").fill("E2E-COL-01");
    const unit = await page
      .locator("#quantityUnit-0 option")
      .filter({ hasText: "mL" })
      .first()
      .evaluate((option) => option.getAttribute("value"));
    expect(unit).toBeTruthy();
    await page.locator("#quantityUnit-0").selectOption(unit!);
    const save = page.locator(".save-navigation-buttons .forward-button");
    await expect(save).toBeEnabled({ timeout: UI_TIMEOUT });
    await save.click();
    await expect(page).toHaveURL(/\/order\/label$/, {
      timeout: LONG_TIMEOUT,
    });
  });

  const orderLookup = await page.request.get(
    `${API_ROOT}/rest/specimen-intake/lookup?code=${encodeURIComponent(labNo)}`,
  );
  expect(orderLookup.status()).toBe(200);
  const order = await orderLookup.json();
  expect(order.current.physicalSpecimens).toHaveLength(1);
  const specimen = order.current.physicalSpecimens[0];
  expect(specimen.collectionDate).toBeTruthy();
  expect(specimen.receivedDate ?? null).toBeNull();
  expect(specimen.decisionState).toBe("NOT_RECORDED");
  const tubeCode = `${labNo}.${specimen.sortOrder}`;

  await page.goto("/order/collect", { waitUntil: "domcontentloaded" });
  await page.locator("#specimen-intake-lookup").fill(tubeCode);
  const scanResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/rest/specimen-intake/lookup?") &&
      response.url().includes(encodeURIComponent(tubeCode)),
  );
  await page.getByRole("button", { name: "查询当前状态" }).click();
  const scanned = await scanResponse;
  expect(scanned.status()).toBe(200);
  const scan = await scanned.json();
  expect(scan.matchedKind).toBe("specimen");
  expect(scan.selection.sampleItemId).toBe(specimen.id);
  expect(scan.selection.requestId).toBe(specimen.requestId);
  expect(scan.current.patientMasked).toBe(false);

  await test.step("核对身份后只签收所扫实管，并回读签收事实", async () => {
    await page.locator('label[for="specimen-lookup-confirm-identity"]').click();
    await expect(
      page.getByRole("checkbox", { name: "我已核对患者、申请与实管条码" }),
    ).toBeChecked();
    const write = page.waitForResponse(
      (response) =>
        response.url().includes("/rest/specimen-receipts") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "确认此管签收" }).click();
    const response = await write;
    expect(response.status()).toBe(200);
    const ack = await response.json();
    expect(ack.success).toBe(true);
    expect(ack.tubes).toHaveLength(1);
    expect(ack.tubes[0].replayed).toBe(false);
    const receiptRequest = response.request();
    const replay = await page.request.post(
      `${API_ROOT}/rest/specimen-receipts`,
      {
        data: receiptRequest.postDataJSON(),
        headers: {
          "X-CSRF-Token":
            (await receiptRequest.headerValue("x-csrf-token")) || "",
        },
      },
    );
    expect(replay.status()).toBe(200);
    expect((await replay.json()).tubes[0].replayed).toBe(true);
    const wrongPatient = await page.request.post(
      `${API_ROOT}/rest/specimen-receipts`,
      {
        data: { ...receiptRequest.postDataJSON(), patientId: "999999999" },
        headers: {
          "X-CSRF-Token":
            (await receiptRequest.headerValue("x-csrf-token")) || "",
        },
      },
    );
    expect(wrongPatient.status()).toBe(409);
    const current = await page.request.get(
      `${API_ROOT}/rest/specimen-intake/lookup?code=${encodeURIComponent(tubeCode)}`,
    );
    expect(current.status()).toBe(200);
    const tube = (await current.json()).current.physicalSpecimens[0];
    expect(tube.id).toBe(specimen.id);
    expect(tube.receivedDate).toBeTruthy();
    expect(tube.decisionState).toBe("NOT_RECORDED");
    expect(tube.expectedEvidenceDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  await test.step("同一实管只记录一次验收结论", async () => {
    await expect(
      page.getByRole("button", { name: "确认此管验收" }),
    ).toBeVisible({ timeout: LONG_TIMEOUT });
    await page.locator('label[for="specimen-lookup-confirm-identity"]').click();
    await expect(
      page.getByRole("checkbox", { name: "我已核对患者、申请与实管条码" }),
    ).toBeChecked();
    const write = page.waitForResponse(
      (response) =>
        response.url().includes("/rest/specimen-intake-decisions") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "确认此管验收" }).click();
    const response = await write;
    expect(response.status()).toBe(200);
    const decisionRequest = response.request();
    const command = decisionRequest.postDataJSON();
    await expect(page.getByText(/验收已回查，当前状态见下表/)).toBeVisible({
      timeout: LONG_TIMEOUT,
    });
    const current = await page.request.get(
      `${API_ROOT}/rest/specimen-intake/lookup?code=${encodeURIComponent(tubeCode)}`,
    );
    expect(current.status()).toBe(200);
    const tube = (await current.json()).current.physicalSpecimens[0];
    expect(tube.id).toBe(specimen.id);
    expect(tube.decisionState).toBe("RECORDED");
    expect(tube.recordedDecision).toBe("ACCEPTED");
    expect(tube.operationId).toBe(command.operationId);
    const replay = await page.request.post(
      `${API_ROOT}/rest/specimen-intake-decisions`,
      {
        data: command,
        headers: {
          "X-CSRF-Token":
            (await decisionRequest.headerValue("x-csrf-token")) || "",
        },
      },
    );
    expect(replay.status()).toBe(200);
    expect((await replay.json()).replayed).toBe(true);
    await expect(
      page.getByRole("button", { name: "确认此管验收" }),
    ).toHaveCount(0);
    await expect(page.getByText(/验收已回查，当前状态见下表/)).toBeVisible({
      timeout: LONG_TIMEOUT,
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator("#specimen-intake-lookup").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath("one-tube-accepted.png"),
      fullPage: false,
    });
    await testInfo.attach("intake-fact", {
      body: JSON.stringify({ labNo, tubeCode, sampleItemId: tube.id }),
      contentType: "application/json",
    });
  });
});
