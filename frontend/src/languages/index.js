import en from "./en.json";
import enGB from "./en_GB.json";
import enLK from "./en_LK.json";
import enUS from "./en_US.json";
import es from "./es.json";
import fr from "./fr.json";
import id from "./id.json";
import mg from "./mg.json";
import ro from "./ro.json";
import si from "./si.json";
import siLK from "./si_LK.json";
import ta from "./ta.json";
import taLK from "./ta_LK.json";
import amET from "./am_ET.json";
import sw from "./sw.json";
import zh from "./zh.json";
import zhCN from "./zh_CN.json";

/**
 * All available language message bundles.
 * These are bundled at build time and contain UI translations.
 */
export const languageMessages = {
  en: en,
  "en-GB": enGB,
  "en-LK": enLK,
  "en-US": enUS,
  es: es,
  fr: fr,
  id: id,
  mg: mg,
  ro: ro,
  si: si,
  "si-LK": siLK,
  ta: ta,
  "ta-LK": taLK,
  sw: sw,
  "am-ET": amET,
  zh: zh,
  "zh-CN": zhCN,
};

/**
 * Default language configuration used when backend is unavailable.
 * The actual enabled languages are fetched from /rest/supportedlocales/active.
 */
export const defaultLanguages = {
  zh: { label: "简体中文", messages: zh },
};

/**
 * Legacy export for backwards compatibility.
 * Components should migrate to using ConfigurationContext for dynamic locale list.
 * @deprecated Use ConfigurationContext.supportedLocales instead
 */
export const languages = {
  en: { label: "English", messages: en },
  "en-GB": { label: "English (UK)", messages: enGB },
  "en-LK": { label: "English (Sri Lanka)", messages: enLK },
  "en-US": { label: "English (US)", messages: enUS },
  es: { label: "Español", messages: es },
  fr: { label: "Français", messages: fr },
  id: { label: "Indonesia", messages: id },
  mg: { label: "Malagasy", messages: mg },
  ro: { label: "Română", messages: ro },
  si: { label: "සිංහල", messages: si },
  "si-LK": { label: "සිංහල (Sri Lanka)", messages: siLK },
  ta: { label: "தமிழ்", messages: ta },
  "ta-LK": { label: "தமிழ் (Sri Lanka)", messages: taLK },
  sw: { label: "Swahili", messages: sw },
  "am-ET": { label: "Amharic", messages: amET },
  zh: { label: "简体中文", messages: zh },
  "zh-CN": { label: "简体中文（中国）", messages: zhCN },
};

/**
 * Builds the visible language list for the China delivery edition.
 *
 * The backend locale table is still consulted so its Chinese display label can
 * be used, but non-Chinese locales are deliberately not exposed in the UI.
 * Keeping this rule here also prevents a brief English language switcher from
 * appearing while an older database is being upgraded.
 * @param {Array} supportedLocales - Array of {localeCode, displayName, fallback} from backend
 * @returns {Object} Languages object with {[localeCode]: {label, messages, fallback}}
 */
export function buildLanguagesFromConfig(supportedLocales) {
  const chineseLocale = Array.isArray(supportedLocales)
    ? supportedLocales.find((locale) =>
        String(locale?.localeCode || "")
          .replaceAll("_", "-")
          .toLowerCase()
          .startsWith("zh"),
      )
    : null;

  return {
    zh: {
      ...defaultLanguages.zh,
      label: chineseLocale?.displayName || defaultLanguages.zh.label,
      fallback: true,
    },
  };
}
