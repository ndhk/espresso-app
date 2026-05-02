export function nowIso() {
  return new Date().toISOString();
}

export function shotDateTimeToIso(date, time) {
  try {
    if (date && time) {
      const iso = new Date(`${date}T${time}`).toISOString();
      if (!iso.startsWith("Invalid")) return iso;
    }
    if (date) {
      const iso = new Date(date).toISOString();
      if (!iso.startsWith("Invalid")) return iso;
    }
  } catch {
    // fall through to nowIso
  }
  return nowIso();
}
