import { expect, test } from "../../../helpers/test-base";
import { Sidenav } from "../../../fixtures/sidenav";

type MenuLink = {
  name: string;
  href: string;
  target: string | null;
};

const isAuditableAppLink = (link: MenuLink) => {
  if (!link.href || link.target === "_blank") return false;
  if (link.href === "/" || link.href.startsWith("#")) return false;
  return true;
};

/**
 * Product-level contract for the China navigation.
 *
 * A menu item is a standalone task entry. It must remain on the route declared
 * by its href even when no transient order, patient or sample is already held
 * in React context. This catches the former /order/label -> /order/enter silent
 * redirect and the same class of defect on future pages.
 */
test.describe.serial("China menu route contract", () => {
  const shardCount = 4;

  for (let shardIndex = 0; shardIndex < shardCount; shardIndex++) {
    test(`menu route shard ${shardIndex + 1}/${shardCount} opens declared pages without horizontal overflow`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      page.setDefaultNavigationTimeout(10_000);

      await page.goto("/order", { waitUntil: "domcontentloaded" });
      const sidenav = new Sidenav(page);
      await sidenav.expectExpanded();
      const links = (await sidenav.getVisibleLinkInfos()).filter(
        isAuditableAppLink,
      );

      const uniqueLinks = Array.from(
        new Map(links.map((link) => [link.href, link])).values(),
      );

      // An administrator in the China profile has many task entries. Guard the
      // test itself so a broken submenu reader cannot make a five-link smoke
      // test look like full-site coverage again.
      expect(uniqueLinks.length).toBeGreaterThan(20);
      const shardLinks = uniqueLinks.filter(
        (_link, index) => index % shardCount === shardIndex,
      );
      expect(shardLinks.length).toBeGreaterThan(0);
      const issues: string[] = [];

      for (const link of shardLinks) {
        const requested = new URL(link.href, page.url());
        if (requested.origin !== new URL(page.url()).origin) continue;

        const pageErrors: string[] = [];
        const onPageError = (error: Error) => pageErrors.push(error.message);
        page.on("pageerror", onPageError);

        try {
          await page.goto(`${requested.pathname}${requested.search}`, {
            waitUntil: "domcontentloaded",
          });
          await page.waitForTimeout(250);

          const actual = new URL(page.url());
          if (actual.pathname !== requested.pathname) {
            issues.push(
              `${link.name} (${link.href}) silently redirected to ${actual.pathname}`,
            );
          }
          if (actual.pathname === "/login") {
            issues.push(`${link.name} unexpectedly returned to login`);
          }
          if (pageErrors.length > 0) {
            issues.push(`${link.name} raised: ${pageErrors.join(" | ")}`);
          }

          const horizontalOverflow = await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          );
          if (horizontalOverflow > 2) {
            issues.push(
              `${link.name} overflows the desktop viewport by ${horizontalOverflow}px`,
            );
          }
        } catch (error) {
          issues.push(`${link.name} could not open: ${String(error)}`);
        } finally {
          page.off("pageerror", onPageError);
        }
      }

      expect(issues, issues.join("\n")).toEqual([]);
    });
  }
});
