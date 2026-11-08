import { describe, expect, it } from "vitest";

import { buildDefaultGeneralSettings } from "@/lib/settings/general-settings";
import { CONTACT_EMAIL_ERROR, headerLinkErrors, HTTPS_URL_ERROR } from "@/lib/settings/header-links";

describe("headerLinkErrors", () => {
  it("accepts empty fields and well-formed values", () => {
    const company = buildDefaultGeneralSettings().company;
    expect(headerLinkErrors({ ...company, website: "", instagramUrl: null, contactEmail: null })).toEqual({});
    expect(
      headerLinkErrors({ ...company, instagramUrl: "https://instagram.com/cincel", contactEmail: "hola@cincel.mx" }),
    ).toEqual({});
  });

  it("flags non-https URLs and malformed addresses", () => {
    const company = buildDefaultGeneralSettings().company;
    expect(
      headerLinkErrors({ ...company, website: "www.cincel.mx", instagramUrl: "http://instagram.com/x", contactEmail: "hola@" }),
    ).toEqual({ website: HTTPS_URL_ERROR, instagramUrl: HTTPS_URL_ERROR, contactEmail: CONTACT_EMAIL_ERROR });
  });
});
