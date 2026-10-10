import { describe, expect, test } from "vitest";
import { organizationWebsiteError } from "./organizationWebsiteValidation";

describe("organization website format and existing storage contract", () => {
  test.each([
    ["httpPrivateIpv4", "http://10.42.0.8:18080/lis/results", null],
    ["httpsPublicLiteralDns", "https://lis.example.org/results", null],
    [
      "httpMultiLabelIntranetDns",
      "http://lis.intranet.local:18080/lis/results",
      "length",
    ],
    ["httpSingleLabelDns", "http://lis:18080/results", null],
    ["httpLocalhost", "http://localhost:18080/results", null],
    ["httpsPrivateIpv4", "https://192.168.10.20:8443/lis/results", null],
    ["httpBracketedIpv6", "http://[fd00::8]:18080/lis/results", null],
    [
      "httpsPortPathQuery",
      "https://lis.example.org:8443/lis/results?group=1",
      "length",
    ],
    ["malformedText", "not a url", "format"],
    ["bareDns", "lis.intranet.local/results", "format"],
    ["bareIp", "10.42.0.8:18080/results", "format"],
    ["optionalEmpty", "", null],
    ["optionalNull", null, null],
    ["exactStorage40", "https://lis.example.org/r?group=12345678", null],
    ["overStorage41", "https://lis.example.org/r?group=123456789", "length"],
  ])(
    "%s matches the separately tested server contract",
    (_name, value, reason) => {
      expect(organizationWebsiteError(value)).toBe(reason);
    },
  );
});
