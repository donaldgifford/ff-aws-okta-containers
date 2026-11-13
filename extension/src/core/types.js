// Shared type definitions. This file has no runtime content; other modules
// refer to these types from JSDoc.

/**
 * The three kinds of thing that get a container of their own.
 *
 * @typedef {"aws-console" | "aws-portal" | "okta-admin"} TargetKind
 */

/**
 * The kinds of organization a user can enrol.
 *
 * @typedef {"aws-portal" | "okta-admin"} OrganizationKind
 */

/**
 * The container colours Firefox offers.
 *
 * @typedef {"blue" | "turquoise" | "green" | "yellow" | "orange" | "red" | "pink" | "purple"} Colour
 */

/**
 * An enrolled AWS access portal or Okta tenant.
 *
 * @typedef {object} Organization
 * @property {string} key `aws-portal:<portal host>` or
 *   `okta-admin:<tenant host>`.
 * @property {OrganizationKind} kind
 * @property {string} host The portal's host, or the Okta tenant's host
 *   without `-admin`.
 * @property {string} label The name the user gave it.
 * @property {string | null} region The portal's AWS region; null for Okta.
 * @property {boolean} accessGranted Whether Firefox still grants its
 *   addresses.
 * @property {string} addedAt ISO 8601 time.
 */

/**
 * An AWS account learned from a portal's account list.
 *
 * @typedef {object} Account
 * @property {string} accountId Twelve digits.
 * @property {string} name
 * @property {string} orgKey The portal it was seen on.
 * @property {string} seenAt ISO 8601 time.
 */

/**
 * A container the extension created.
 *
 * @typedef {object} ManagedContainer
 * @property {string} key The target key.
 * @property {string} cookieStoreId
 * @property {TargetKind} kind
 * @property {string | null} orgKey The organization whose label is in the
 *   name; null if it is not known.
 * @property {string} managedName The name the extension last gave it.
 * @property {boolean} userRenamed True once the user renamed it in Firefox.
 * @property {string} createdAt ISO 8601 time.
 * @property {string} lastUsedAt ISO 8601 time.
 */

/**
 * Maps names to a colour. `match` holds one or more substrings separated by
 * commas; a name containing any of them, in any letter case, matches.
 *
 * @typedef {object} ColourRule
 * @property {string} match
 * @property {Colour} colour
 */

/**
 * @typedef {object} Settings
 * @property {string} consoleTemplate
 * @property {string} portalTemplate
 * @property {string} oktaTemplate
 * @property {boolean} awsConsolesEnabled
 * @property {boolean} awsPortalsEnabled
 * @property {boolean} oktaAdminEnabled
 * @property {ColourRule[]} colourRules Ordered; the first match wins.
 */

/**
 * A navigation that belongs in an enrolled organization's container.
 *
 * @typedef {object} Target
 * @property {OrganizationKind} kind
 * @property {string} key
 * @property {Organization} organization
 */

/**
 * Why a navigation was left where it is.
 *
 * @typedef {"not-get" | "private-window" | "in-container" | "not-a-target" | "kind-disabled"} LeaveReason
 */

/**
 * @typedef {{ action: "route", target: Target } | { action: "leave", reason: LeaveReason }} RoutingDecision
 */

/**
 * The values a name template can use.
 *
 * @typedef {object} NameTokens
 * @property {string} [org]
 * @property {string} [account]
 * @property {string} [accountId]
 * @property {string} [role]
 */

/**
 * What a container should look like.
 *
 * @typedef {object} ContainerAppearance
 * @property {string} name
 * @property {Colour} color
 * @property {string} icon
 */

export {};
