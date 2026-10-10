// The existing organization.internet_address column stores at most 40 characters.
export function organizationWebsiteError(
  address: unknown,
): "length" | "format" | null {
  const value = String(address ?? "").trim();
  if (!value) return null;
  if (value.length > 40) return "length";
  if (!/^https?:\/\//i.test(value)) return "format";
  try {
    const url = new URL(value);
    return url.hostname ? null : "format";
  } catch {
    return "format";
  }
}
