// Builders for the records the core functions take. Every identifier here is
// a placeholder.

import { oktaKey, portalKey } from "../../src/core/keys.js";
import {
  DEFAULT_COLOUR_RULES,
  DEFAULT_TEMPLATES,
} from "../../src/core/naming.js";

export const PORTAL_HOST = "d-1234567890.awsapps.com";
export const PORTAL_URL = `https://${PORTAL_HOST}/start/`;
export const API_HOST = "portal.sso.us-west-2.amazonaws.com";

export function portal(overrides = {}) {
  return {
    key: portalKey(PORTAL_HOST),
    kind: "aws-portal",
    host: PORTAL_HOST,
    label: "acme",
    region: "us-west-2",
    accessGranted: true,
    addedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function oktaTenant(overrides = {}) {
  return {
    key: oktaKey("acme.okta.com"),
    kind: "okta-admin",
    host: "acme.okta.com",
    label: "acme",
    region: null,
    accessGranted: true,
    addedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function settings(overrides = {}) {
  return {
    consoleTemplate: DEFAULT_TEMPLATES.console,
    portalTemplate: DEFAULT_TEMPLATES.portal,
    oktaTemplate: DEFAULT_TEMPLATES.okta,
    awsConsolesEnabled: true,
    awsPortalsEnabled: true,
    oktaAdminEnabled: true,
    colourRules: DEFAULT_COLOUR_RULES.map((rule) => ({ ...rule })),
    ...overrides,
  };
}
