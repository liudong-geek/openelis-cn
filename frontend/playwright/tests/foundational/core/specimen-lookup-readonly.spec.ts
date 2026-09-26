import { expect, test } from "../../../helpers/test-base";
import { LONG_TIMEOUT, UI_TIMEOUT } from "../../../helpers/timeouts";

const PATIENT_NUMBER = "E2E-PAGING-1-001";
const FACILITY_NAME = "CAMES MAN";
const API_ROOT = "/api/OpenELIS-Global";

// Reproduce the laboratory server (UTC) and collector workstation (China)
// using different wall clocks in the isolated E2E stack.
test.use({ timezoneId: "Asia/Shanghai" });

test("采收页按申请和真实管码只读核对当前身份与下一任务", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  let labNumber = "";
  let defaultCollectionTime = "";
  let defaultReceivedTime = "";
  let orderReceivedDate = "";
  let orderReceivedTime = "";
  const minutes = (time: string) => {
    const match = /^(\d{2}):(\d{2})(?:\s+(AM|PM))?$/i.exec(time);
    expect(match, `有效的时分值：${time}`).toBeTruthy();
    let hour = Number(match![1]);
    if (match![3])
      hour = (hour % 12) + (match![3].toUpperCase() === "PM" ? 12 : 0);
    return hour * 60 + Number(match![2]);
  };

  await test.step("原申请页建立送检机构、全血 WBC 临床申请", async () => {
    await page.goto("/order/enter", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "新建申请" })).toBeVisible({
      timeout: LONG_TIMEOUT,
    });

    await page.locator("#patientQuickQuery").fill(PATIENT_NUMBER);
    await page
      .locator(".patient-quick-search")
      .getByRole("button", { name: "搜索" })
      .click();
    const patientRow = page
      .getByRole("row")
      .filter({ hasText: PATIENT_NUMBER });
    await expect(patientRow).toBeVisible({ timeout: LONG_TIMEOUT });
    await patientRow.getByRole("button", { name: "选择" }).click();
    await expect(
      page.locator(".patient-search-section .selected-entity-card"),
    ).toContainText(PATIENT_NUMBER, { timeout: LONG_TIMEOUT });

    const facility = page.locator(
      ".requester-section .requester-master-data-card",
    );
    if (!(await facility.isVisible().catch(() => false))) {
      await page.locator("#siteName").fill(FACILITY_NAME);
      await page
        .locator(".requester-section .subsection")
        .first()
        .getByRole("button", { name: "搜索" })
        .click();
      const facilityRow = page
        .locator(".requester-section")
        .getByRole("row")
        .filter({ hasText: FACILITY_NAME });
      await expect(facilityRow).toBeVisible({ timeout: LONG_TIMEOUT });
      await facilityRow.getByRole("button", { name: "选择" }).click();
    }
    await expect(facility).toBeVisible({ timeout: LONG_TIMEOUT });

    const type = page.locator("#sampleType-0");
    await expect(type).toBeVisible({ timeout: LONG_TIMEOUT });
    const wholeBlood = await type
      .locator("option")
      .filter({ hasText: "全血" })
      .first()
      .evaluate((option) => option.getAttribute("value"));
    expect(wholeBlood, "全血主数据应已装载").toBeTruthy();
    await type.selectOption(wholeBlood!);

    const wbcLabel = page
      .locator('.sample-test-section label[for^="test-0-"]')
      .filter({ hasText: /白细胞|WBC/i })
      .first();
    const testId = await wbcLabel.evaluate((label) =>
      label.getAttribute("for"),
    );
    expect(testId, "WBC 检验项目应已装载").toBeTruthy();
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
    expect(labNumber, "应生成申请编号").toBeTruthy();
    const savedApplication = await page.request.get(
      `${API_ROOT}/rest/order/search?labNumber=${encodeURIComponent(labNumber)}`,
    );
    expect(savedApplication.status()).toBe(200);
    const applicationData = await savedApplication.json();
    orderReceivedDate = applicationData.sampleOrderItems.receivedDateForDisplay;
    orderReceivedTime = applicationData.sampleOrderItems.receivedTime;
    expect(orderReceivedDate).toBeTruthy();
    expect(orderReceivedTime).toMatch(/^\d{2}:\d{2}(?:\s+(?:AM|PM))?$/i);
    const laboratoryClock = await page.request.get(
      `${API_ROOT}/rest/server-time`,
    );
    expect(laboratoryClock.status()).toBe(200);
    const serverTime = await laboratoryClock.json();
    expect(serverTime.timezone).not.toBe("Asia/Shanghai");
    expect(
      (minutes(serverTime.time) - minutes(orderReceivedTime) + 1440) % 1440,
    ).toBeLessThanOrEqual(2);
  });

  await test.step("按申请编号核对患者和待采集请求，不写入", async () => {
    const lookup = page.locator("#specimen-intake-lookup");
    await lookup.fill(labNumber);
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/rest/specimen-intake/lookup?") &&
        response.url().includes(encodeURIComponent(labNumber)),
    );
    await page.getByRole("button", { name: "查询当前状态" }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.readOnly).toBe(true);
    expect(body.matchedKind).toBe("order");
    expect(body.selection.sampleItemId ?? null).toBeNull();
    expect(body.selection.requestId ?? null).toBeNull();
    expect(body.current.labNo).toBe(labNumber);
    expect(body.current.patient.firstName).toBe("Fixture001");
    expect(body.current.requestedSpecimens).toHaveLength(1);
    expect(body.current.physicalSpecimens).toHaveLength(0);

    await expect(page.getByText("E2EPagingBoundaryFixture001")).toBeVisible();
    await expect(page.getByText("待采集", { exact: true })).toBeVisible();
    await expect(page.getByText("尚无实管")).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: `返回原申请 ${labNumber} 的采集表单`,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("specimen-lookup-before-collection.png"),
      fullPage: true,
    });
  });

  await test.step("返回原申请表单完成采集，再从真实记录取得管码", async () => {
    await page
      .getByRole("button", {
        name: `返回原申请 ${labNumber} 的采集表单`,
      })
      .click();
    await expect(page.locator("#collectionDate-0")).toBeVisible({
      timeout: LONG_TIMEOUT,
    });
    // A collector in China must be able to save untouched defaults even when
    // the laboratory server uses UTC. Both fields come from its clock.
    const collectionDate = page.locator("#collectionDate-0");
    const collectionTime = page.locator("#collectionTime-0");
    const receivedDate = page.locator("#receivedDate-0");
    const receivedTime = page.locator("#receivedTime-0");
    await expect(collectionDate).not.toHaveValue("");
    await expect(receivedDate).not.toHaveValue("");
    await expect(collectionTime).toHaveValue(/^\d{2}:\d{2}$/);
    await expect(receivedTime).toHaveValue(/^\d{2}:\d{2}$/);
    const defaultReceivedDate = await receivedDate.inputValue();
    await expect(collectionDate).toHaveValue(defaultReceivedDate);
    defaultCollectionTime = await collectionTime.inputValue();
    defaultReceivedTime = await receivedTime.inputValue();
    await expect(collectionTime).toHaveValue(defaultReceivedTime);
    expect(
      await page.evaluate(
        () => Intl.DateTimeFormat().resolvedOptions().timeZone,
      ),
    ).toBe("Asia/Shanghai");
    const laboratoryClock = await page.request.get(
      `${API_ROOT}/rest/server-time`,
    );
    expect(laboratoryClock.status()).toBe(200);
    const serverTime = await laboratoryClock.json();
    expect(serverTime.timezone).not.toBe("Asia/Shanghai");
    expect(
      (minutes(serverTime.time) - minutes(defaultCollectionTime) + 1440) % 1440,
    ).toBeLessThanOrEqual(2);
    await testInfo.attach("default-collection-time", {
      body: JSON.stringify({
        labNumber,
        collectionDate: await collectionDate.inputValue(),
        collectionTime: await collectionTime.inputValue(),
        receivedDate: await receivedDate.inputValue(),
        receivedTime: await receivedTime.inputValue(),
      }),
      contentType: "application/json",
    });
    await page.screenshot({
      path: testInfo.outputPath("collection-defaults-server-clock.png"),
      fullPage: true,
    });
    await page.locator("#collector-0").fill("E2E-COL-01");
    const unit = page.locator("#quantityUnit-0");
    const millilitre = await unit
      .locator("option")
      .filter({ hasText: "mL" })
      .first()
      .evaluate((option) => option.getAttribute("value"));
    expect(millilitre, "采集量单位应可选择").toBeTruthy();
    await unit.selectOption(millilitre!);
    const saveAndLabel = page.locator(
      ".save-navigation-buttons .forward-button",
    );
    await expect(saveAndLabel).toBeEnabled({ timeout: UI_TIMEOUT });
    await saveAndLabel.click();
    await expect(page).toHaveURL(/\/order\/label$/, {
      timeout: LONG_TIMEOUT,
    });
    const persisted = await page.request.get(
      `${API_ROOT}/rest/order/search?labNumber=${encodeURIComponent(labNumber)}`,
    );
    expect(persisted.status()).toBe(200);
    const persistedOrder = await persisted.json();
    expect(persistedOrder.sampleOrderItems.receivedDateForDisplay).toBe(
      orderReceivedDate,
    );
    expect(persistedOrder.sampleOrderItems.receivedTime).toBe(
      orderReceivedTime,
    );
    expect(persistedOrder.samples).toHaveLength(1);
    expect(persistedOrder.samples[0].sampleItemId).toBeTruthy();
    const savedSpecimen = persistedOrder.samples[0];
    expect(savedSpecimen.collectionDate).toBeTruthy();
    expect(savedSpecimen.receivedDate).toBe(savedSpecimen.collectionDate);
    expect(savedSpecimen.collectionTime).toMatch(/^\d{2}:\d{2}$/);
    expect(savedSpecimen.receivedTime).toBe(savedSpecimen.collectionTime);
    const savedClockResponse = await page.request.get(
      `${API_ROOT}/rest/server-time`,
    );
    expect(savedClockResponse.status()).toBe(200);
    const savedClock = await savedClockResponse.json();
    expect(
      (minutes(savedClock.time) -
        minutes(savedSpecimen.collectionTime) +
        1440) %
        1440,
    ).toBeLessThanOrEqual(2);
  });

  await test.step("真实管码定位同一申请，并显示下一任务", async () => {
    const current = await page.request.get(
      `${API_ROOT}/rest/specimen-intake/lookup?code=${encodeURIComponent(labNumber)}`,
    );
    expect(current.status()).toBe(200);
    const body = await current.json();
    expect(body.current.physicalSpecimens).toHaveLength(1);
    const physical = body.current.physicalSpecimens[0];
    expect(physical.sortOrder).toMatch(/^[1-9][0-9]{0,4}$/);
    const tubeCode = `${body.current.labNo}.${physical.sortOrder}`;

    await page.goto("/order/collect", { waitUntil: "domcontentloaded" });
    await page.locator("#specimen-intake-lookup").fill(tubeCode);
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/rest/specimen-intake/lookup?") &&
        response.url().includes(encodeURIComponent(tubeCode)),
    );
    await page.getByRole("button", { name: "查询当前状态" }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const tube = await response.json();
    expect(tube.matchedKind).toBe("specimen");
    expect(tube.current.labNo).toBe(labNumber);
    expect(tube.selection.sampleItemId).toBe(physical.id);
    expect(tube.selection.requestId).toBe(physical.requestId);
    await expect(page.getByText(tubeCode, { exact: true })).toBeVisible();
    const nextTask = physical.receivedDate
      ? "核对实管后明确验收决定"
      : "核对实管签收";
    await expect(page.getByText(nextTask, { exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("specimen-lookup-after-collection.png"),
      fullPage: true,
    });
  });

  await test.step("不存在的编号返回 404，页面不保留上一患者", async () => {
    const unknown = `NO-SUCH-${Date.now()}`;
    await page.locator("#specimen-intake-lookup").fill(unknown);
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/rest/specimen-intake/lookup?") &&
        response.url().includes(unknown),
    );
    await page.getByRole("button", { name: "查询当前状态" }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(404);
    expect((await response.json()).code).toBe("SPECIMEN_LOOKUP_NOT_FOUND");
    await expect(
      page.getByText("该编号未匹配到当前申请或真实标本管。"),
    ).toBeVisible();
    await expect(page.getByText("E2EPagingBoundaryFixture001")).toHaveCount(0);
  });
});
