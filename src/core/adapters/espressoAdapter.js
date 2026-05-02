import { SCHEMA_VERSION } from "../schema/platformEvent.js";
import { DEFAULT_PROFILE_ID } from "../schema/profile.js";
import { createId } from "../utils/ids.js";
import { nowIso, shotDateTimeToIso } from "../utils/dates.js";

function buildRefinement() {
  return { status: "validated", adapter: "espresso-manual-v1", flags: [] };
}

export function createEspressoShotEvent(shot) {
  const ts = nowIso();
  return {
    id: createId("evt"),
    schemaVersion: SCHEMA_VERSION,
    profileId: DEFAULT_PROFILE_ID,
    module: "espresso",
    eventType: "espresso_shot",
    occurredAt: shotDateTimeToIso(shot.date, shot.time),
    recordedAt: ts,
    source: { type: "manual", name: "espresso-app" },
    data: { ...shot },
    refinement: buildRefinement(),
    createdAt: ts,
    updatedAt: ts,
  };
}

export function legacyShotToPlatformEvent(shot) {
  const ts = nowIso();
  const source = { type: "manual", name: "espresso-app" };
  if (shot.id) source.sourceEventId = shot.id;
  return {
    id: createId("evt"),
    schemaVersion: SCHEMA_VERSION,
    profileId: DEFAULT_PROFILE_ID,
    module: "espresso",
    eventType: "espresso_shot",
    occurredAt: shotDateTimeToIso(shot.date, shot.time),
    recordedAt: ts,
    source,
    data: { ...shot },
    refinement: buildRefinement(),
    createdAt: ts,
    updatedAt: ts,
  };
}

export function platformEventToShot(event) {
  try {
    if (
      !event ||
      event.schemaVersion !== SCHEMA_VERSION ||
      event.module !== "espresso" ||
      event.eventType !== "espresso_shot" ||
      !event.data ||
      typeof event.data !== "object"
    ) {
      return null;
    }
    const data = event.data;
    return {
      id: data.id || event.id,
      createdAt: data.createdAt || event.createdAt,
      coffeeId: data.coffeeId ?? "",
      date: data.date ?? "",
      time: data.time ?? "",
      dose: data.dose ?? "",
      yield: data.yield ?? "",
      shotTime: data.shotTime ?? "",
      grind: data.grind ?? "",
      score: data.score ?? "",
      taste: Array.isArray(data.taste) ? data.taste : [],
      body: data.body ?? "",
      verdict: data.verdict ?? "",
      notes: data.notes ?? "",
      temp: data.temp ?? "",
      pressure: data.pressure ?? "",
      preinfusion: data.preinfusion ?? "",
      basket: data.basket ?? "",
      puckScreen: data.puckScreen ?? false,
    };
  } catch {
    return null;
  }
}
