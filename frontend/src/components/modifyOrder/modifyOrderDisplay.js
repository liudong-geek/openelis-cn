export const modifyPatientName = (name, locale = "") => {
  if (!name) return "";
  if (!locale.toLowerCase().startsWith("zh")) return name;
  const parts = name.split(/[,，]/).map((part) => part.trim());
  return parts.length === 2 &&
    parts.every((part) => /^[\u3400-\u9fff]+$/.test(part))
    ? parts.join("")
    : name;
};
export const modifyProgramName = (name, intl) =>
  name?.trim().toLowerCase() === "routine testing"
    ? intl.formatMessage({ id: "modify.order.routine" })
    : name;
