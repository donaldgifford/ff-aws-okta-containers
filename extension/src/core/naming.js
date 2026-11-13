// Container names, colours and icons.
//
// Names come from templates with a fixed set of tokens. Colours come from an
// ordered list of rules matched against the finished name, with a stable
// hash of the key as the fallback, so a container keeps its colour.

/** @import { Colour, ColourRule, ContainerAppearance, NameTokens, Organization, Settings, TargetKind } from "./types.js" */

import { parseKey } from "./keys.js";

/** @type {readonly Colour[]} */
export const COLOURS = Object.freeze([
  "blue",
  "turquoise",
  "green",
  "yellow",
  "orange",
  "red",
  "pink",
  "purple",
]);

/** @type {Readonly<Record<TargetKind, string>>} */
export const ICONS = Object.freeze({
  "aws-console": "dollar",
  "aws-portal": "briefcase",
  "okta-admin": "fingerprint",
});

export const DEFAULT_TEMPLATES = Object.freeze({
  console: "{account}({org}) / {role}",
  portal: "{org} portal",
  okta: "{org} okta admin",
});

/** @type {readonly Readonly<ColourRule>[]} */
export const DEFAULT_COLOUR_RULES = Object.freeze([
  Object.freeze({ match: "prod", colour: "red" }),
  Object.freeze({ match: "stag, stage", colour: "yellow" }),
  Object.freeze({ match: "dev, test, sandbox", colour: "green" }),
]);

/** @type {Readonly<Record<TargetKind, readonly string[]>>} */
export const TEMPLATE_TOKENS = Object.freeze({
  "aws-console": Object.freeze(["account", "accountId", "role", "org"]),
  "aws-portal": Object.freeze(["org"]),
  "okta-admin": Object.freeze(["org"]),
});

const TOKEN = /\{([^{}]*)\}/g;
const MAX_TEMPLATE_LENGTH = 80;

/**
 * Fills a template's tokens. A token with no value is left as written, so a
 * mistake in a template is visible in the name.
 *
 * @param {string} template
 * @param {NameTokens} tokens
 * @returns {string}
 */
export function renderTemplate(template, tokens) {
  /** @type {Record<string, string | undefined>} */
  const values = { ...tokens };
  return template
    .replace(TOKEN, (whole, name) => values[name] ?? whole)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {TargetKind} kind
 * @param {string} template
 * @returns {string | null} What is wrong with the template, or null.
 */
export function validateTemplate(kind, template) {
  if (template.trim() === "") return "A name template cannot be empty.";
  if (template.length > MAX_TEMPLATE_LENGTH) {
    return `A name template can be at most ${MAX_TEMPLATE_LENGTH} characters.`;
  }
  const allowed = TEMPLATE_TOKENS[kind];
  for (const [whole, name] of template.matchAll(TOKEN)) {
    if (name === undefined || !allowed.includes(name)) {
      const list = allowed.map((token) => `{${token}}`).join(", ");
      return `${whole} is not a token this name can use. Use ${list}.`;
    }
  }
  return null;
}

/**
 * @param {string} match
 * @returns {string[]} The rule's substrings, lower-cased.
 */
function ruleTerms(match) {
  return match
    .split(",")
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term !== "");
}

/**
 * @param {unknown} value
 * @returns {value is Colour}
 */
export function isColour(value) {
  return COLOURS.includes(/** @type {Colour} */ (value));
}

/**
 * @param {{ match: string, colour: string }} rule
 * @returns {string | null} What is wrong with the rule, or null.
 */
export function validateColourRule(rule) {
  if (ruleTerms(rule.match).length === 0) {
    return "A colour rule needs some text to look for.";
  }
  if (!isColour(rule.colour)) {
    return `${rule.colour || "(nothing)"} is not a container colour.`;
  }
  return null;
}

/**
 * @param {string} text
 * @returns {number} A hash that is the same for the same text, always.
 */
function stableHash(text) {
  let hash = 0;
  for (const character of text) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return hash;
}

/**
 * The colour of the first rule the name matches, or a colour derived from
 * the key when none does.
 *
 * @param {string} name The finished container name.
 * @param {string} key The target key.
 * @param {readonly ColourRule[]} rules
 * @returns {Colour}
 */
export function colourFor(name, key, rules) {
  const lowered = name.toLowerCase();
  for (const rule of rules) {
    if (ruleTerms(rule.match).some((term) => lowered.includes(term))) {
      return rule.colour;
    }
  }
  return COLOURS[stableHash(key) % COLOURS.length] ?? "blue";
}

/**
 * The label to show for an organization. If it is no longer enrolled, the
 * first part of its address stands in.
 *
 * @param {string | null} orgKey
 * @param {readonly Organization[]} organizations
 * @returns {string}
 */
export function orgLabelFor(orgKey, organizations) {
  const organization = organizations.find((item) => item.key === orgKey);
  if (organization) return organization.label;
  const parsed = orgKey === null ? null : parseKey(orgKey);
  if (parsed && parsed.kind !== "aws-console") {
    return parsed.host.split(".")[0] ?? parsed.host;
  }
  return "unknown";
}

/**
 * @typedef {object} NameContext
 * @property {string} orgLabel The organization's label.
 * @property {string | null} accountName The account's name, if it is known.
 *   Only used for AWS consoles.
 */

/**
 * The name, colour and icon the container for a key should have.
 *
 * @param {string} key
 * @param {NameContext} context
 * @param {Settings} settings
 * @returns {ContainerAppearance | null} Null if the key is malformed.
 */
export function appearanceFor(key, context, settings) {
  const parsed = parseKey(key);
  if (!parsed) return null;

  /** @type {string} */
  let template;
  /** @type {NameTokens} */
  let tokens;
  switch (parsed.kind) {
    case "aws-console":
      template = settings.consoleTemplate;
      tokens = {
        account: context.accountName ?? parsed.accountId,
        accountId: parsed.accountId,
        role: parsed.role,
        org: context.orgLabel,
      };
      break;
    case "aws-portal":
      template = settings.portalTemplate;
      tokens = { org: context.orgLabel };
      break;
    case "okta-admin":
      template = settings.oktaTemplate;
      tokens = { org: context.orgLabel };
      break;
  }

  const name = renderTemplate(template, tokens) || key;
  return {
    name,
    color: colourFor(name, key, settings.colourRules),
    icon: ICONS[parsed.kind],
  };
}
