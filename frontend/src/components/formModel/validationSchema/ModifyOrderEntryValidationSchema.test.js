import { createModifyOrderEntryValidationSchema } from "./ModifyOrderEntryValidationSchema";
import { buildSampleEditPayload } from "../../modifyOrder/sampleEditPayload";
const form = (requestDate) => ({
  accessionNumber: "24-00001",
  sampleOrderItems: {
    labNo: "24-00001",
    referringSiteId: "1",
    providerFirstName: "Test",
    providerLastName: "Provider",
    requestDate,
  },
});
test.each([undefined, null, "", "   "])(
  "rejects missing request date %s only when the server enables it",
  async (value) => {
    await expect(
      createModifyOrderEntryValidationSchema(undefined, true).validate(
        form(value),
      ),
    ).rejects.toMatchObject({ path: "sampleOrderItems.requestDate" });
  },
);
test("keeps the optional legacy request date blank when the server does not require it", async () => {
  const value = form(null);
  await expect(
    createModifyOrderEntryValidationSchema(undefined, false).validate(value),
  ).resolves.toMatchObject(value);
  expect(buildSampleEditPayload(value).sampleOrderItems.requestDate).toBe(null);
});
test("keeps an explicitly supplied date in the real save payload", async () => {
  const value = form("2024/01/02");
  await createModifyOrderEntryValidationSchema(undefined, true).validate(value);
  expect(buildSampleEditPayload(value).sampleOrderItems.requestDate).toBe(
    "2024/01/02",
  );
  expect(value.sampleOrderItems.requestDate).toBe("2024/01/02");
});
