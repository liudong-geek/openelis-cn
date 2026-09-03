const DEFAULT_REQUEST_LOCALE = "en";

/**
 * Convert locale aliases used by older OpenELIS clients (for example zh_CN)
 * to the BCP 47 form required by the HTTP Accept-Language header.
 */
export const normalizeLocaleCode = (
  locale: string | null | undefined,
  fallback = DEFAULT_REQUEST_LOCALE,
): string => {
  const candidate = locale?.trim().replaceAll("_", "-");
  if (!candidate || candidate === "*") {
    return fallback;
  }

  try {
    return Intl.getCanonicalLocales(candidate)[0] || fallback;
  } catch {
    return fallback;
  }
};

/**
 * Resolve a saved/browser locale to a message bundle that actually exists.
 * An exact regional bundle wins, then its base language, then the product
 * fallback. The returned value is the original supported key so callers can
 * safely index their message map with it.
 */
export const resolveSupportedLocale = (
  locale: string | null | undefined,
  supportedLocaleCodes: string[],
  fallback: string,
): string => {
  const supportedByCanonicalCode = new Map(
    supportedLocaleCodes.map((code) => [normalizeLocaleCode(code), code]),
  );
  const canonical = normalizeLocaleCode(locale, fallback);
  const exact = supportedByCanonicalCode.get(canonical);
  if (exact) {
    return exact;
  }

  const baseLanguage = canonical.split("-")[0];
  const base = supportedByCanonicalCode.get(baseLanguage);
  if (base) {
    return base;
  }

  return (
    supportedByCanonicalCode.get(normalizeLocaleCode(fallback)) || fallback
  );
};

/** Return the current UI locale in a valid Accept-Language representation. */
export const getRequestLocale = (): string => {
  const storedLocale =
    typeof localStorage === "undefined" ? null : localStorage.getItem("locale");
  const browserLocale =
    typeof navigator === "undefined" ? null : navigator.language;
  return normalizeLocaleCode(
    storedLocale || browserLocale || DEFAULT_REQUEST_LOCALE,
  );
};
