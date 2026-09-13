import { readOpenElisResponse } from "./readOpenElisResponse";
import config from "../../config.json";

afterEach(() => vi.unstubAllGlobals());
it("回执读取保留真实状态，带会话但不缓存、不自动跳转、不写入", async () => {
  const failed = { status: 404 };
  const fetchMock = vi.fn().mockResolvedValue(failed);
  vi.stubGlobal("fetch", fetchMock);
  const controller = new AbortController();
  const endpoint =
    "/rest/SamplePatientEntry/submissions/11111111-2222-4333-8444-555555555555";
  expect(await readOpenElisResponse(endpoint, controller.signal)).toBe(failed);
  expect(fetchMock).toHaveBeenCalledWith(
    config.serverBaseUrl + endpoint,
    expect.objectContaining({
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
      headers: expect.objectContaining({ Accept: "application/json" }),
    }),
  );
  expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("body");
});
