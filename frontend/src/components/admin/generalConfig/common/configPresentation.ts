import type { IntlShape } from "react-intl";

// Match server-owned keys and descriptions only. All display text comes from
// the active application catalog; hospital-specific descriptions stay intact.
const reportFields: Record<
  string,
  {
    messagePrefix: string;
    description: string;
    instructions?: readonly string[];
  }
> = {
  "additional site info": {
    messagePrefix: "config.report.additionalSiteInfo",
    description: "additional information for report header",
    instructions: [
      "siteInformation.instruction.headerInfo",
      "This text will appear in the header of reports which support a additional information. To split into two lines use HTML br Tag between lines",
    ],
  },
  headerLeftImage: {
    messagePrefix: "config.report.headerLeftImage",
    description: "image for the left side of report header",
    instructions: [
      "siteInfo.instruction.labLogo.left",
      "Use file upload to set the lab logo for the left side of report header. The file must be either a jpg, png or gif.",
    ],
  },
  headerRightImage: {
    messagePrefix: "config.report.headerRightImage",
    description: "image for the right side of report header",
    instructions: [
      "siteInfo.instruction.labLogo.right",
      "Use file upload to set the lab logo for the right side of report header. The file must be either a jpg, png or gif.",
    ],
  },
  "lab director": {
    messagePrefix: "config.report.labDirector",
    description: "the lab directors name for the reports",
    instructions: ["instructions.site.lab.director"],
  },
  labDirectorName: {
    messagePrefix: "config.report.labDirectorName",
    description: "image for lab director name",
    instructions: [
      "siteInfo.instruction.directorname.i",
      "Enter the name of the lab director",
    ],
  },
  labDirectorTitle: {
    messagePrefix: "config.report.labDirectorTitle",
    description: "image for lab director title",
    instructions: [
      "siteInfo.instruction.directortitle.i",
      "Enter the title of the lab director",
    ],
  },
  labDirectorSignature: {
    messagePrefix: "config.report.labDirectorSignature",
    description: "image for lab director signature",
    instructions: [
      "siteInfo.instruction.directorsignature.i",
      "Select a jpg file that contains the lab directors signature.",
    ],
  },
  reportPageNumbers: {
    messagePrefix: "config.report.pageNumbers",
    description: "use page numbers on reports",
    instructions: ["siteInformation.instruction.pageNumbers"],
  },
  SiteName: {
    messagePrefix: "config.report.siteName",
    description: "the name of the site for reports and header",
    instructions: ["instructions.site.name"],
  },
};

const normalizeDescription = (description: string) =>
  description.trim().replace(/\s+/g, " ").toLowerCase();

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
    description: [field.description, ...(field.instructions || [])].some(
      (defaultDescription) =>
        normalizeDescription(description) ===
        normalizeDescription(defaultDescription),
    )
      ? translated(`${field.messagePrefix}.description`, description)
      : description,
  };
};
