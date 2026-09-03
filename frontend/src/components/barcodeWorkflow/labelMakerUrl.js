import config from "../../config.json";

const backendBaseUrl = String(config.serverBaseUrl || "").replace(/\/$/, "");

export const resolveBackendPrintUrl = (url) => {
  const value = String(url || "");
  if (!value || /^(?:https?:|blob:|data:|about:)/i.test(value)) {
    return value;
  }
  if (backendBaseUrl && value.startsWith(`${backendBaseUrl}/`)) {
    return value;
  }
  if (value.startsWith("/LabelMakerServlet")) {
    return `${backendBaseUrl}${value}`;
  }
  if (value.startsWith("LabelMakerServlet")) {
    return `${backendBaseUrl}/${value}`;
  }
  return value;
};

export const buildLabelMakerUrl = (params) => {
  const query =
    params instanceof URLSearchParams
      ? params
      : new URLSearchParams(
          Object.entries(params || {}).filter(
            ([, value]) => value !== undefined && value !== null,
          ),
        );
  return `${backendBaseUrl}/LabelMakerServlet?${query.toString()}`;
};
