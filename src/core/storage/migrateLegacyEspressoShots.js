import { legacyShotToPlatformEvent } from "../adapters/espressoAdapter.js";
import { getEvents, appendEvents } from "./eventStore.js";

const LEGACY_SHOTS_KEY = "shots";
const MIGRATION_SENTINEL_KEY = "platform_events_v1_espresso_migration_done";
const MIGRATION_BACKUP_KEY = "platform_events_v1_espresso_migration_backup";

function looksLikePlatformEvent(item) {
  return (
    item &&
    typeof item === "object" &&
    item.schemaVersion === "1.0" &&
    item.module === "espresso"
  );
}

export function migrateLegacyEspressoShots() {
  try {
    if (localStorage.getItem(MIGRATION_SENTINEL_KEY) === "true") return;

    const rawLegacy = localStorage.getItem(LEGACY_SHOTS_KEY);
    if (!rawLegacy) {
      localStorage.setItem(MIGRATION_SENTINEL_KEY, "true");
      return;
    }

    // Backup raw legacy value before touching anything
    localStorage.setItem(MIGRATION_BACKUP_KEY, rawLegacy);

    let legacyShots;
    try {
      legacyShots = JSON.parse(rawLegacy);
    } catch (e) {
      console.warn("[migration] Could not parse legacy shots JSON:", e);
      return;
    }

    if (!Array.isArray(legacyShots)) {
      console.warn("[migration] Legacy shots is not an array — skipping migration.");
      return;
    }

    if (legacyShots.length === 0) {
      localStorage.setItem(MIGRATION_SENTINEL_KEY, "true");
      return;
    }

    // If all items already look like platform events, nothing to convert
    if (legacyShots.every(looksLikePlatformEvent)) {
      localStorage.setItem(MIGRATION_SENTINEL_KEY, "true");
      return;
    }

    // Collect sourceEventIds already present to avoid duplicates
    const existingSourceIds = new Set(
      getEvents()
        .map(e => e.source?.sourceEventId)
        .filter(Boolean)
    );

    const toMigrate = legacyShots.filter(shot => {
      if (looksLikePlatformEvent(shot)) return false;
      if (shot.id && existingSourceIds.has(shot.id)) return false;
      return true;
    });

    if (toMigrate.length === 0) {
      localStorage.setItem(MIGRATION_SENTINEL_KEY, "true");
      return;
    }

    const converted = toMigrate.map(legacyShotToPlatformEvent);
    appendEvents(converted);

    localStorage.setItem(MIGRATION_SENTINEL_KEY, "true");
  } catch (e) {
    console.error("[migration] Unexpected error — legacy data untouched:", e);
    // Do not set sentinel; do not delete legacy data
  }
}
