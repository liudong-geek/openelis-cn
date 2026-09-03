import { expect, test } from "../../../helpers/test-base";
import { LONG_TIMEOUT } from "../../../helpers/timeouts";

test.describe("患者档案管理", () => {
  test("默认展示患者列表并可搜索、打开档案", async ({ page }, testInfo) => {
    test.setTimeout(120_000);

    const listResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/rest/patient-management-list") &&
        response.request().method() === "GET",
      { timeout: LONG_TIMEOUT },
    );
    await page.goto("/PatientManagement", { waitUntil: "domcontentloaded" });
    expect((await listResponse).status()).toBe(200);

    await expect(
      page.getByRole("heading", { name: "患者档案管理", level: 1 }),
    ).toBeVisible({ timeout: LONG_TIMEOUT });
    await expect(
      page.getByRole("heading", { name: "患者列表", level: 2 }),
    ).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "患者编号" }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "姓名" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "新患者" })).toBeVisible();

    const searchResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/rest/patient-search-results") &&
        response.request().method() === "GET",
      { timeout: LONG_TIMEOUT },
    );
    const patientList = page.locator(".patient-master-list");
    await patientList.getByLabel("查询患者档案").fill("流程乙");
    await patientList
      .getByRole("button", { name: "搜索", exact: true })
      .click();
    expect((await searchResponse).status()).toBe(200);

    const patientRow = page.getByRole("row").filter({ hasText: "测试流程乙" });
    await expect(patientRow).toBeVisible({ timeout: LONG_TIMEOUT });
    await expect(patientRow.getByText("正常")).toBeVisible();

    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(2);
    await page.screenshot({
      path: testInfo.outputPath("patient-master-list.png"),
      fullPage: true,
    });

    await patientRow.getByRole("button", { name: "查看/编辑" }).click();
    await expect(page).toHaveURL(/\/PatientManagement\/\d+$/);
    await expect(
      page.getByRole("heading", { name: "编辑患者档案", level: 1 }),
    ).toBeVisible({ timeout: LONG_TIMEOUT });

    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(2);
  });
});
