import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Stack,
  Select,
  SelectItem,
  TextInput,
  Tag,
  Tooltip,
  Loading,
  InlineNotification,
} from "@carbon/react";
import { useIntl } from "react-intl";
import {
  getFromOpenElisServer,
  putToOpenElisServerFullResponse,
} from "../../../utils/Utils";

const FALLBACK_LOCALE = "en";

/**
 * OGC-949 / OGC-767 — Localization section. Edits a test's name / reporting-name
 * translations in-context. These live in the generic `localization` tables (the
 * test already FK-links to them), so this reads/writes through the existing
 * /rest/localizations/{id} endpoints; the editor controller only bridges
 * testId → the backing localization ids. No per-test translation store.
 *
 * For the chosen locale each field shows its value with a fallback indicator
 * when the value is coming from English rather than a locale-specific
 * translation, and saves on blur.
 */
const LocalizationSection = ({ testId }) => {
  const intl = useIntl();

  const [locales, setLocales] = useState([]);
  const [locale, setLocale] = useState("");
  // fields: [{ field, localizationId, translations: {locale: value} }]
  const [fields, setFields] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [localesError, setLocalesError] = useState(false);
  const [savingFields, setSavingFields] = useState({});
  const requestVersion = useRef(0);
  const [notification, setNotification] = useState(null);

  // Translation configuration includes inactive languages; editing names must
  // never enable a language for the application interface.
  useEffect(() => {
    let disposed = false;
    getFromOpenElisServer("/rest/supportedlocales", (res) => {
      if (disposed) return;
      if (!Array.isArray(res)) {
        setLocalesError(true);
        return;
      }
      setLocales(res);
      const current = intl.locale.replace("-", "_");
      const target =
        res.find((item) => item.localeCode === current && current !== "en") ||
        res.find((item) => !item.fallback && item.active !== false) ||
        res[0];
      setLocale(target?.localeCode || FALLBACK_LOCALE);
    });
    return () => {
      disposed = true;
    };
  }, [intl.locale]);

  const configurationLocales = useMemo(() => {
    const byCode = new Map(locales.map((item) => [item.localeCode, item]));
    // English and French names are legacy catalog fields. Keep them editable
    // alongside every stored translation even when a locale has been removed.
    const codes = new Set([
      "en",
      "fr",
      ...fields.flatMap((field) => Object.keys(field.translations)),
    ]);
    const displayNames = new Intl.DisplayNames([intl.locale], {
      type: "language",
    });
    codes.forEach((code) => {
      if (!byCode.has(code)) {
        let displayName = code;
        try {
          displayName = displayNames.of(code.replace("_", "-")) || code;
        } catch {
          /* Keep the stored code. */
        }
        byCode.set(code, { localeCode: code, displayName });
      }
    });
    return [...byCode.values()];
  }, [locales, fields, intl.locale]);

  // Load the test's localization refs, then hydrate each one's translations.
  const load = useCallback(() => {
    if (!testId) {
      return;
    }
    const version = ++requestVersion.current;
    setLoading(true);
    setError(false);
    setSavingFields({});
    getFromOpenElisServer(
      `/rest/test-catalog/tests/${testId}/localization`,
      (refs) => {
        if (version !== requestVersion.current) return;
        if (!refs || !Array.isArray(refs.fields)) {
          setLoading(false);
          setError(true);
          return;
        }
        if (refs.fields.length === 0) {
          setFields([]);
          setLoading(false);
          return;
        }
        let pending = refs.fields.length;
        const resolved = [];
        let failed = false;
        refs.fields.forEach((ref, index) => {
          getFromOpenElisServer(
            `/rest/localizations/${ref.localizationId}`,
            (loc) => {
              if (version !== requestVersion.current) return;
              if (
                !loc ||
                !loc.translations ||
                typeof loc.translations !== "object" ||
                Array.isArray(loc.translations)
              )
                failed = true;
              resolved[index] = {
                field: ref.field,
                localizationId: ref.localizationId,
                translations: (loc && loc.translations) || {},
              };
              pending -= 1;
              if (pending === 0) {
                setError(failed);
                if (!failed) {
                  setFields(resolved);
                  setDrafts(
                    Object.fromEntries(
                      resolved.map((field) => [
                        field.field,
                        { ...field.translations },
                      ]),
                    ),
                  );
                }
                setLoading(false);
              }
            },
          );
        });
      },
    );
  }, [testId]);

  useEffect(() => {
    load();
    return () => {
      requestVersion.current++;
    };
  }, [load]);

  const saveField = (entry) => {
    if (!locale || savingFields[entry.field]) return;
    const version = requestVersion.current;
    const savedLocale = locale;
    const value = drafts[entry.field]?.[locale] || "";
    if (value === (entry.translations[locale] || "")) {
      return;
    }
    const merged = { ...entry.translations, [locale]: value };
    setSavingFields((prev) => ({ ...prev, [entry.field]: true }));
    putToOpenElisServerFullResponse(
      `/rest/localizations/${entry.localizationId}/translations`,
      JSON.stringify(merged),
      (response) => {
        if (version !== requestVersion.current) return;
        setSavingFields((prev) => ({ ...prev, [entry.field]: false }));
        if (response && response.ok) {
          setNotification({
            kind: "success",
            text: intl.formatMessage({
              id: "label.testCatalog.localization.saved",
            }),
          });
          setFields((prev) =>
            prev.map((field) =>
              field.field === entry.field
                ? {
                    ...field,
                    translations: {
                      ...field.translations,
                      [savedLocale]: value,
                    },
                  }
                : field,
            ),
          );
        } else {
          setNotification({
            kind: "error",
            text: intl.formatMessage({
              id: "label.testCatalog.localization.saveError",
            }),
          });
        }
      },
    );
  };

  if (loading) {
    return (
      <Loading
        description={intl.formatMessage({ id: "label.loading" })}
        withOverlay={false}
      />
    );
  }

  if (error || localesError) {
    return (
      <InlineNotification
        kind="error"
        lowContrast
        hideCloseButton
        title={intl.formatMessage({ id: "error.title" })}
        subtitle={intl.formatMessage({
          id: "label.testCatalog.localization.loadError",
        })}
      />
    );
  }

  const isFallback = (entry) =>
    locale !== FALLBACK_LOCALE && !entry.translations[locale];

  const fallbackTag = (entry) => {
    if (!isFallback(entry)) {
      return null;
    }
    return (
      <Tooltip
        align="top"
        label={intl.formatMessage(
          { id: "label.testCatalog.localization.fallback.tooltip" },
          { locale },
        )}
      >
        <Tag type="warm-gray" size="sm">
          {intl.formatMessage({
            id: "label.testCatalog.localization.fallback.en",
          })}
        </Tag>
      </Tooltip>
    );
  };

  return (
    <Stack gap={6} data-testid="localization-section">
      {notification && (
        <InlineNotification
          kind={notification.kind}
          lowContrast
          title={notification.text}
          onCloseButtonClick={() => setNotification(null)}
        />
      )}

      <p>
        {intl.formatMessage({ id: "label.testCatalog.localization.intro" })}
      </p>
      <p>
        {intl.formatMessage({
          id: "label.testCatalog.localization.configurationLanguages",
        })}
      </p>

      {fields.length === 0 ? (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title={intl.formatMessage({
            id: "label.testCatalog.localization.empty",
          })}
        />
      ) : (
        <>
          <div style={{ maxWidth: "16rem" }}>
            <Select
              id="localization-locale"
              labelText={intl.formatMessage({
                id: "label.testCatalog.localization.locale",
              })}
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
            >
              {configurationLocales.map((l) => (
                <SelectItem
                  key={l.localeCode}
                  value={l.localeCode}
                  text={`${l.displayName} (${l.localeCode})`}
                />
              ))}
            </Select>
          </div>

          {fields.map((entry) => (
            <div
              key={entry.field}
              data-testid={`localization-field-${entry.field}`}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <span className="cds--label">
                  {intl.formatMessage({
                    id: `label.testCatalog.localization.field.${entry.field}`,
                  })}
                </span>
                {fallbackTag(entry)}
              </div>
              <TextInput
                id={`localization-input-${entry.field}`}
                labelText=""
                placeholder={entry.translations[FALLBACK_LOCALE] || ""}
                value={drafts[entry.field]?.[locale] ?? ""}
                disabled={!locale || !!savingFields[entry.field]}
                onChange={(e) => {
                  const value = e.target.value;
                  setDrafts((prev) => ({
                    ...prev,
                    [entry.field]: { ...prev[entry.field], [locale]: value },
                  }));
                }}
                onBlur={() => saveField(entry)}
              />
            </div>
          ))}
        </>
      )}
    </Stack>
  );
};

export default LocalizationSection;
