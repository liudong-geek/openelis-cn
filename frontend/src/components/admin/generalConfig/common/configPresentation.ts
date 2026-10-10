import type { IntlShape } from "react-intl";

// Match server-owned keys and descriptions only. All display text comes from
// the active application catalog; hospital-specific descriptions stay intact.
const reportFields: Record<
  string,
  { messagePrefix: string; description: string }
> = {
  "additional site info": {
    messagePrefix: "config.report.additionalSiteInfo",
    description: "additional information for report header",
  },
  headerLeftImage: {
    messagePrefix: "config.report.headerLeftImage",
    description: "image for the left side of report header",
  },
  headerRightImage: {
    messagePrefix: "config.report.headerRightImage",
    description: "image for the right side of report header",
  },
  "lab director": {
    messagePrefix: "config.report.labDirector",
    description: "the lab directors name for the reports",
  },
  labDirectorName: {
    messagePrefix: "config.report.labDirectorName",
    description: "image for lab director name",
  },
  labDirectorTitle: {
    messagePrefix: "config.report.labDirectorTitle",
    description: "image for lab director title",
  },
  labDirectorSignature: {
    messagePrefix: "config.report.labDirectorSignature",
    description: "image for lab director signature",
  },
};

export const getConfigPresentation = (
  name: string,
  description: string,
  intl: IntlShape,
) => {
  // i18n-keys: config.report.*
  const field = reportFields[name];
  if (!field) return { name, description };
  const translated = (id: string, fallback: string) =>
    Object.prototype.hasOwnProperty.call(intl.messages, id)
      ? intl.formatMessage({ id })
      : fallback;
  return {
    name: translated(`${field.messagePrefix}.name`, name),
    description:
      description.trim().toLowerCase() === field.description
        ? translated(`${field.messagePrefix}.description`, description)
        : description,
  };
};
