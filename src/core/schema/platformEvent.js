/**
 * @typedef {Object} PlatformEventSource
 * @property {"manual"} type
 * @property {string} name
 * @property {string} [sourceEventId]
 */

/**
 * @typedef {Object} PlatformEventRefinement
 * @property {"validated"} status
 * @property {string} adapter
 * @property {string[]} flags
 */

/**
 * @typedef {Object} PlatformEventV1
 * @property {string} id
 * @property {"1.0"} schemaVersion
 * @property {string} profileId
 * @property {string} module
 * @property {string} eventType
 * @property {string} occurredAt
 * @property {string} recordedAt
 * @property {PlatformEventSource} source
 * @property {Object} data
 * @property {PlatformEventRefinement} refinement
 * @property {string} createdAt
 * @property {string} updatedAt
 */

export const SCHEMA_VERSION = "1.0";
