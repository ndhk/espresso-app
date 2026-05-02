import { useState } from "react";
import { getEvents } from "../core/storage/eventStore.js";

const SENTINEL_KEY  = "platform_events_v1_espresso_migration_done";
const BACKUP_KEY    = "platform_events_v1_espresso_migration_backup";
const LEGACY_KEY    = "shots";

function sortedLatest(events, n = 5) {
  return [...events]
    .sort((a, b) => {
      const ta = a.createdAt || a.recordedAt || "";
      const tb = b.createdAt || b.recordedAt || "";
      return tb.localeCompare(ta);
    })
    .slice(0, n);
}

export default function DeveloperDataView({ onClose }) {
  const [allEvents] = useState(() => { try { return getEvents(); } catch { return []; } });
  const [copyMsg, setCopyMsg] = useState("");

  const espressoEvents  = allEvents.filter(e => e.module === "espresso");
  const profileCount    = new Set(allEvents.map(e => e.profileId).filter(Boolean)).size;
  const latest          = sortedLatest(allEvents);

  const legacyExists    = localStorage.getItem(LEGACY_KEY)   !== null;
  const sentinelExists  = localStorage.getItem(SENTINEL_KEY) === "true";
  const backupExists    = localStorage.getItem(BACKUP_KEY)   !== null;

  const handleExport = () => {
    const blob = new Blob(
      [JSON.stringify(allEvents, null, 2)],
      { type: "application/json" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `platform-events-v1-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleCopy = async () => {
    const text = JSON.stringify(allEvents, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopyMsg("Copied!");
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity  = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopyMsg("Copied!");
      } catch {
        setCopyMsg("Copy failed — use Export instead");
      }
    }
    setTimeout(() => setCopyMsg(""), 3000);
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxHeight: "88dvh" }}>
        <div className="modal-handle" />
        <div className="modal-title" style={{ fontSize: 16 }}>Developer Data</div>

        {/* Warning */}
        <div style={{
          background: "var(--surface2)", border: "1px solid var(--border2)",
          borderRadius: "var(--radius)", padding: "8px 10px",
          fontSize: 11, color: "var(--text2)", marginBottom: 14
        }}>
          Local debug view — read-only. No data is modified.
        </div>

        {/* Summary */}
        <div className="section-label">Storage summary</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          {[
            ["Total events",     allEvents.length],
            ["Espresso events",  espressoEvents.length],
            ["Distinct profiles", profileCount],
            ["Legacy shots key", legacyExists   ? "✓ present" : "✗ absent"],
            ["Migration done",   sentinelExists  ? "✓ true"    : "✗ not set"],
            ["Backup key",       backupExists    ? "✓ present" : "✗ absent"],
          ].map(([label, val]) => (
            <div key={label} style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", padding: "10px 12px"
            }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text3)", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 13, color: "var(--text)", fontFamily: "var(--font-mono)" }}>{String(val)}</div>
            </div>
          ))}
        </div>

        {/* Export / Copy */}
        <div className="section-label">Export</div>
        <div className="flex gap-2" style={{ marginBottom: 16 }}>
          <button className="btn btn-ghost btn-sm" onClick={handleExport}>
            Export Platform Events JSON
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleCopy}>
            {copyMsg || "Copy to Clipboard"}
          </button>
        </div>

        {/* Latest events */}
        <div className="section-label">Latest {latest.length} event{latest.length !== 1 ? "s" : ""}</div>
        {latest.length === 0 ? (
          <p style={{ fontSize: 11, color: "var(--text3)", marginBottom: 12 }}>No events stored yet.</p>
        ) : (
          latest.map((evt, i) => (
            <pre key={evt.id || i} style={{
              background: "var(--surface2)", border: "1px solid var(--border2)",
              borderRadius: "var(--radius)", padding: "10px", marginBottom: 8,
              fontSize: 10, color: "var(--text2)", overflowX: "auto",
              whiteSpace: "pre-wrap", wordBreak: "break-all",
              maxHeight: 200, overflowY: "auto"
            }}>
              {JSON.stringify(evt, null, 2)}
            </pre>
          ))
        )}

        <div style={{ marginTop: 8 }}>
          <button className="btn btn-ghost btn-sm btn-full" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
