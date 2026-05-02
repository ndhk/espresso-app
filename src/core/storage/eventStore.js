const PLATFORM_EVENTS_KEY = "platform_events_v1";

function readEvents() {
  try {
    const raw = localStorage.getItem(PLATFORM_EVENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("[eventStore] Failed to read platform events:", e);
    return [];
  }
}

function writeEvents(events) {
  try {
    localStorage.setItem(PLATFORM_EVENTS_KEY, JSON.stringify(events));
  } catch (e) {
    console.error("[eventStore] Failed to write platform events:", e);
  }
}

export function getEvents() {
  return readEvents();
}

export function getEventsByModule(module) {
  return readEvents().filter(e => e.module === module);
}

export function getEventsByProfile(profileId) {
  return readEvents().filter(e => e.profileId === profileId);
}

export function saveEvent(event) {
  const events = readEvents();
  events.push(event);
  writeEvents(events);
}

export function updateEvent(eventId, patch) {
  const events = readEvents();
  const idx = events.findIndex(e => e.id === eventId);
  if (idx === -1) {
    console.warn("[eventStore] updateEvent: event not found:", eventId);
    return;
  }
  events[idx] = { ...events[idx], ...patch };
  writeEvents(events);
}

export function deleteEvent(eventId) {
  const events = readEvents();
  writeEvents(events.filter(e => e.id !== eventId));
}

// Used internally by migration — appends without replacing
export function appendEvents(newEvents) {
  const existing = readEvents();
  writeEvents([...existing, ...newEvents]);
}
