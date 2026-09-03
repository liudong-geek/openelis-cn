/** @module @category Navigation */
import { interpolateUrl } from "./interpolate-string";

export type TemplateParams = { [key: string]: string };

export interface NavigateOptions {
  to: string;
  templateParams?: TemplateParams;
}

/**
 * Uses browser history for same-origin paths and a full navigation for
 * external URLs. This viewer runs inside OpenELIS' React Router application,
 * not a single-spa root; importing single-spa here caused a delayed
 * "single-spa has not been started" warning on every patient history page.
 *
 * #### Example usage:
 * ```js
 * @example
 * const config = useConfig();
 * const submitHandler = () => {
 *   navigate({ to: config.links.submitSuccess });
 * };
 * ```
 * #### Example return values:
 * ```js
 * @example
 * navigate({ to: "/some/path" }); // => window.location.assign("/some/path")
 * navigate({ to: "https://single-spa.js.org/" }); // => window.location.assign("https://single-spa.js.org/")
 * navigate({ to: "${openmrsBase}/some/path" }); // => window.location.assign("/openmrs/some/path")
 * navigate({ to: "/openmrs/spa/foo/page" }); // => navigateToUrl("/openmrs/spa/foo/page")
 * navigate({ to: "${openmrsSpaBase}/bar/page" }); // => navigateToUrl("/openmrs/spa/bar/page")
 * navigate({ to: "/${openmrsSpaBase}/baz/page" }) // => navigateToUrl("/openmrs/spa/baz/page")
 * ```
 *
 * @param to The target path or URL. Supports templating with 'openmrsBase', 'openmrsSpaBase',
 * and any additional template parameters defined in `templateParams`.
 * For example, `${openmrsSpaBase}/home` will resolve to `/openmrs/spa/home`
 * for implementations using the standard OpenMRS and SPA base paths.
 * If `templateParams` contains `{ foo: "bar" }`, then the URL `${openmrsBase}/${foo}`
 * will become `/openmrs/bar`.
 */
export function navigate({ to, templateParams }: NavigateOptions): void {
  const target = interpolateUrl(to, templateParams);
  const resolvedTarget = new URL(target, window.location.href);

  if (resolvedTarget.origin !== window.location.origin) {
    window.location.assign(resolvedTarget.href);
    return;
  }

  const relativeTarget = `${resolvedTarget.pathname}${resolvedTarget.search}${resolvedTarget.hash}`;
  window.history.pushState(window.history.state, "", relativeTarget);
  window.dispatchEvent(
    new PopStateEvent("popstate", { state: window.history.state }),
  );
}
