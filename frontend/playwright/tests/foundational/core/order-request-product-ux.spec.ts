import { expect, test } from "../../../helpers/test-base";
import { LONG_TIMEOUT } from "../../../helpers/timeouts";

test.describe("检验申请产品交互", () => {
  test("申请列表正常加载且新建申请按业务顺序展示", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);

    const dashboardResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/rest/order/dashboard") &&
        response.request().method() === "GET",
      { timeout: LONG_TIMEOUT },
    );
    await page.goto("/order", { waitUntil: "domcontentloaded" });
    expect((await dashboardResponse).status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "检验申请工作台" }),
    ).toBeVisible({ timeout: LONG_TIMEOUT });
    await expect(page.getByText("检验申请加载失败")).toHaveCount(0);

    await page.goto("/order/enter", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { level: 2, name: "新建申请" }),
    ).toBeVisible({ timeout: LONG_TIMEOUT });

    const patientSection = page.locator(".patient-search-section");
    const numberSection = page.locator(".lab-number-section");
    const requesterSection = page.locator(".requester-section");
    const sampleSection = page.locator(".sample-test-section");
    await expect(
      patientSection.getByRole("heading", { name: "选择患者" }),
    ).toBeVisible();
    await expect(
      numberSection.getByRole("heading", { name: "申请编号" }),
    ).toBeVisible();
    await expect(
      requesterSection.getByRole("heading", { name: "填写送检信息" }),
    ).toBeAttached();
    await expect(
      sampleSection.getByRole("heading", { name: "选择标本与检验项目" }),
    ).toBeAttached();

    const patientBox = await patientSection.boundingBox();
    const numberBox = await numberSection.boundingBox();
    const requesterBox = await requesterSection.boundingBox();
    const sampleBox = await sampleSection.boundingBox();
    expect(patientBox).not.toBeNull();
    expect(numberBox).not.toBeNull();
    expect(requesterBox).not.toBeNull();
    expect(sampleBox).not.toBeNull();
    expect(patientBox!.x).toBeLessThan(numberBox!.x);
    expect(Math.abs(patientBox!.y - numberBox!.y)).toBeLessThanOrEqual(2);
    expect(requesterBox!.y).toBeGreaterThan(patientBox!.y + patientBox!.height);
    expect(sampleBox!.y).toBeGreaterThan(
      requesterBox!.y + requesterBox!.height,
    );

    const optionalDetails = page.getByRole("button", {
      name: "更多临床信息（选填）",
    });
    await expect(optionalDetails).toHaveAttribute("aria-expanded", "false");
    const optionalDetailsBox = await page
      .locator(".order-optional-details")
      .boundingBox();
    const navigationBox = await page
      .locator(".order-navigation-section")
      .boundingBox();
    expect(optionalDetailsBox).not.toBeNull();
    expect(navigationBox).not.toBeNull();
    expect(navigationBox!.y).toBeGreaterThanOrEqual(
      optionalDetailsBox!.y + optionalDetailsBox!.height,
    );
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(2);

    await page.screenshot({
      path: testInfo.outputPath("order-entry-layout.png"),
      fullPage: true,
    });
  });
});
