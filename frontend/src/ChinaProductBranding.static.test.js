import { readFileSync } from "node:fs";

const readFrontendFile = (path) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("中国版静态品牌外壳", () => {
  test("HTML 元数据和无脚本提示只展示中文产品名称", () => {
    const html = readFrontendFile("../index.html");

    expect(html).toMatch(/<html lang="zh-CN">/);
    expect(html).toMatch(
      /<meta name="description" content="临床检验信息系统"\s*\/>/,
    );
    expect(html).toMatch(/<title>临床检验信息系统<\/title>/);
    expect(html).toMatch(
      /<noscript>请启用浏览器脚本后使用临床检验信息系统。<\/noscript>/,
    );
    expect(html).not.toMatch(
      /<title>[^<]*(?:OpenELIS|Test LIMS)[^<]*<\/title>/i,
    );
  });

  test("PWA 名称统一为中文产品名称", () => {
    const manifest = JSON.parse(readFrontendFile("../public/manifest.json"));

    expect(manifest.short_name).toBe("临床检验信息系统");
    expect(manifest.name).toBe("临床检验信息系统");
    expect(`${manifest.short_name} ${manifest.name}`).not.toMatch(
      /OpenELIS|Test LIMS/i,
    );
  });

  test("推送通知的默认可见文案为中文", () => {
    const serviceWorker = readFrontendFile("../public/service-worker.js");

    expect(serviceWorker).toContain(
      'data.body || "您收到一条来自临床检验信息系统的新消息"',
    );
    expect(serviceWorker).toContain('"临床检验信息系统消息"');
    expect(serviceWorker).not.toMatch(
      /Message Received from OpenELIS|OpenELIS Message Received/,
    );
  });
});
