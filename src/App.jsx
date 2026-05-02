import { useState, useEffect, useMemo, useCallback } from "react";
import { LineChart, Line, ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { migrateLegacyEspressoShots } from "./core/storage/migrateLegacyEspressoShots.js";
import { getEventsByModule, saveEvent, updateEvent, deleteEvent } from "./core/storage/eventStore.js";
import { createEspressoShotEvent, platformEventToShot } from "./core/adapters/espressoAdapter.js";
import DeveloperDataView from "./components/DeveloperDataView.jsx";

// ── Utilities ──────────────────────────────────────────────────────────────────
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
const now = () => new Date();
const fmtDate = d => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—";
const coffeeAge = (shotDate, roastDate) => {
  if (!shotDate || !roastDate) return null;
  const diff = Math.round((new Date(shotDate) - new Date(roastDate)) / 86400000);
  return diff >= 0 ? diff : null;
};
const ratio = (dose, yld) => dose && yld ? (yld / dose).toFixed(2) : "—";

// ── Storage ────────────────────────────────────────────────────────────────────
const STORE = {
  get: (k, d = []) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn("[STORE] write failed", e); } }
};

// ── Taste options ──────────────────────────────────────────────────────────────
const TASTE_OPTS = ["Balanced","Sweet","Sour","Bitter","Harsh","Muddy","Thin","Flat"];
const BODY_OPTS = ["Thin","Medium","Creamy","Syrupy"];
const VERDICT_OPTS = ["Keep recipe","Adjust finer","Adjust coarser","Shorter yield","Longer yield","Do not repeat"];
const PROCESS_OPTS = ["Washed","Natural","Honey","Anaerobic","Other"];
const ROAST_OPTS = ["Light","Light-Medium","Medium","Medium-Dark","Dark"];
const DECAF_OPTS = ["EA","Swiss Water","CO₂","Other"];

// ── Score colour ───────────────────────────────────────────────────────────────
const scoreColor = s => s >= 8 ? "#4ade80" : s >= 6 ? "#fbbf24" : "#f87171";
const verdictColor = v => v === "Keep recipe" ? "#4ade80" : v === "Do not repeat" ? "#f87171" : "#fbbf24";

// ── CSS ────────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Mono:wght@300;400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0e0b08;
    --surface: #1a1511;
    --surface2: #241d17;
    --border: #2e2520;
    --border2: #3d342c;
    --text: #e8ddd4;
    --text2: #9a8878;
    --text3: #5c4f45;
    --accent: #c8824a;
    --accent2: #e8a06a;
    --green: #4ade80;
    --amber: #fbbf24;
    --red: #f87171;
    --font-display: 'Playfair Display', Georgia, serif;
    --font-mono: 'DM Mono', 'Courier New', monospace;
    --radius: 6px;
    --tab-h: 60px;
  }

  html, body, #root { height: 100%; background: var(--bg); color: var(--text); font-family: var(--font-mono); font-size: 13px; }

  .app { display: flex; flex-direction: column; height: 100dvh; max-width: 480px; margin: 0 auto; position: relative; background: var(--bg); }

  /* ── Header ── */
  .header { padding: 16px 16px 0; flex-shrink: 0; }
  .header h1 { font-family: var(--font-display); font-size: 22px; color: var(--text); letter-spacing: -0.5px; }
  .header h1 span { color: var(--accent); }

  /* ── Tab bar ── */
  .tabs { display: flex; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .tab { flex: 1; padding: 12px 4px; text-align: center; font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text3); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.15s; position: relative; background: none; border-left: none; border-right: none; border-top: none; }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .tab .badge { position: absolute; top: 8px; right: calc(50% - 22px); background: var(--accent); color: #000; font-size: 9px; border-radius: 10px; padding: 1px 5px; line-height: 1.4; }

  /* ── Scroll area ── */
  .scroll { flex: 1; overflow-y: auto; padding: 16px; padding-bottom: calc(var(--tab-h) + 16px); }
  .scroll::-webkit-scrollbar { width: 3px; }
  .scroll::-webkit-scrollbar-track { background: transparent; }
  .scroll::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 2px; }

  /* ── Cards / surfaces ── */
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; margin-bottom: 10px; }
  .card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
  .card-title { font-family: var(--font-display); font-size: 15px; color: var(--text); }
  .card-sub { font-size: 11px; color: var(--text2); margin-top: 2px; }

  /* ── Forms ── */
  .form-group { margin-bottom: 12px; }
  .form-label { display: block; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text2); margin-bottom: 5px; }
  .form-label .req { color: var(--accent); margin-left: 2px; }
  .form-input, .form-select, .form-textarea {
    width: 100%; background: var(--surface2); border: 1px solid var(--border2); border-radius: var(--radius);
    color: var(--text); font-family: var(--font-mono); font-size: 13px; padding: 9px 10px;
    appearance: none; -webkit-appearance: none; outline: none; transition: border-color 0.15s;
  }
  .form-input:focus, .form-select:focus, .form-textarea:focus { border-color: var(--accent); }
  .form-select { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%239a8878'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 28px; }
  .form-textarea { resize: vertical; min-height: 64px; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .form-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }

  /* ── Multi-select tags ── */
  .tag-grid { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag { padding: 5px 10px; border-radius: 20px; border: 1px solid var(--border2); font-size: 11px; color: var(--text2); cursor: pointer; transition: all 0.12s; background: var(--surface2); }
  .tag.active { background: var(--accent); border-color: var(--accent); color: #000; font-weight: 500; }

  /* ── Buttons ── */
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 16px; border-radius: var(--radius); font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.05em; cursor: pointer; border: none; transition: all 0.15s; font-weight: 500; }
  .btn-primary { background: var(--accent); color: #000; }
  .btn-primary:hover { background: var(--accent2); }
  .btn-ghost { background: transparent; color: var(--text2); border: 1px solid var(--border2); }
  .btn-ghost:hover { border-color: var(--accent); color: var(--accent); }
  .btn-danger { background: transparent; color: var(--red); border: 1px solid var(--border2); }
  .btn-danger:hover { border-color: var(--red); }
  .btn-sm { padding: 6px 10px; font-size: 11px; }
  .btn-full { width: 100%; }
  .btn-icon { padding: 6px 8px; font-size: 14px; background: transparent; color: var(--text2); border: 1px solid var(--border2); border-radius: var(--radius); cursor: pointer; transition: all 0.15s; line-height: 1; }
  .btn-icon:hover { border-color: var(--accent); color: var(--accent); }

  /* ── Sticky save ── */
  .sticky-save { position: sticky; bottom: 0; background: var(--bg); padding: 12px 0 4px; margin-top: 8px; border-top: 1px solid var(--border); }

  /* ── Divider / section ── */
  .section-label { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text3); margin-bottom: 10px; margin-top: 4px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }

  /* ── Toggle ── */
  .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 2px 0; }
  .toggle { position: relative; width: 36px; height: 20px; }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .toggle-slider { position: absolute; inset: 0; background: var(--border2); border-radius: 10px; cursor: pointer; transition: 0.2s; }
  .toggle-slider::before { content: ''; position: absolute; width: 14px; height: 14px; left: 3px; bottom: 3px; background: var(--text2); border-radius: 50%; transition: 0.2s; }
  .toggle input:checked + .toggle-slider { background: var(--accent); }
  .toggle input:checked + .toggle-slider::before { transform: translateX(16px); background: #000; }

  /* ── Collapse ── */
  .collapse-btn { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text2); cursor: pointer; background: none; border: none; font-family: var(--font-mono); letter-spacing: 0.08em; padding: 8px 0; width: 100%; }
  .collapse-btn:hover { color: var(--accent); }

  /* ── Shot card ── */
  .shot-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; margin-bottom: 8px; }
  .shot-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  .shot-coffee { font-family: var(--font-display); font-size: 14px; color: var(--text); }
  .shot-meta { font-size: 11px; color: var(--text2); margin-top: 2px; }
  .shot-score { font-family: var(--font-display); font-size: 22px; font-weight: 700; }
  .shot-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px; }
  .shot-stat { }
  .shot-stat-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text3); margin-bottom: 2px; }
  .shot-stat-val { font-size: 13px; color: var(--text); }
  .shot-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
  .shot-tag { font-size: 10px; padding: 2px 7px; border-radius: 10px; border: 1px solid var(--border2); color: var(--text2); }
  .shot-verdict { display: inline-block; font-size: 10px; padding: 3px 8px; border-radius: 4px; border: 1px solid; margin-bottom: 6px; }
  .shot-notes { font-size: 11px; color: var(--text2); font-style: italic; }
  .shot-actions { display: flex; gap: 6px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border); }

  /* ── Coffee card ── */
  .coffee-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; margin-bottom: 8px; }
  .coffee-name { font-family: var(--font-display); font-size: 16px; color: var(--text); }
  .coffee-roaster { font-size: 11px; color: var(--text2); margin-bottom: 8px; }
  .coffee-pills { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
  .coffee-pill { font-size: 10px; padding: 2px 8px; border-radius: 10px; background: var(--surface2); border: 1px solid var(--border2); color: var(--text2); }
  .coffee-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding-top: 10px; border-top: 1px solid var(--border); }
  .coffee-stat-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text3); margin-bottom: 2px; }
  .coffee-stat-val { font-size: 14px; color: var(--text); }

  /* ── Analysis ── */
  .summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 14px; }
  .summary-stat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; }
  .summary-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--text3); margin-bottom: 4px; }
  .summary-val { font-family: var(--font-display); font-size: 22px; color: var(--text); }
  .summary-sub { font-size: 10px; color: var(--text2); margin-top: 2px; }

  /* ── Best recipe card ── */
  .recipe-card { background: var(--surface2); border: 1px solid var(--border2); border-radius: var(--radius); padding: 12px; margin-bottom: 8px; }
  .recipe-coffee { font-family: var(--font-display); font-size: 14px; color: var(--accent); margin-bottom: 6px; }
  .recipe-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .recipe-stat-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text3); margin-bottom: 2px; }
  .recipe-stat-val { font-size: 13px; color: var(--text); }
  .trend { font-size: 11px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); }

  /* ── Filter bar ── */
  .filter-bar { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; margin-bottom: 12px; }
  .filter-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

  /* ── Chart ── */
  .chart-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; margin-bottom: 12px; }
  .chart-title { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text2); margin-bottom: 12px; }

  /* ── Toast ── */
  .toast { position: fixed; bottom: calc(var(--tab-h) + 16px); left: 50%; transform: translateX(-50%); background: var(--surface2); border: 1px solid var(--accent); border-radius: var(--radius); padding: 10px 16px; font-size: 12px; color: var(--text); z-index: 100; white-space: nowrap; box-shadow: 0 4px 20px rgba(0,0,0,0.5); animation: slideUp 0.2s ease; }
  @keyframes slideUp { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

  /* ── Modal ── */
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 50; display: flex; align-items: flex-end; }
  .modal { background: var(--bg); border-top: 1px solid var(--border); border-radius: 12px 12px 0 0; width: 100%; max-width: 480px; margin: 0 auto; max-height: 90dvh; overflow-y: auto; padding: 20px 16px 40px; }
  .modal-handle { width: 36px; height: 3px; background: var(--border2); border-radius: 2px; margin: 0 auto 16px; }
  .modal-title { font-family: var(--font-display); font-size: 18px; margin-bottom: 16px; }

  /* ── Empty state ── */
  .empty { text-align: center; padding: 40px 20px; color: var(--text3); }
  .empty-icon { font-size: 32px; margin-bottom: 12px; }
  .empty-text { font-size: 13px; line-height: 1.6; }

  /* ── Misc ── */
  .flex { display: flex; }
  .gap-2 { gap: 8px; }
  .items-center { align-items: center; }
  .justify-between { justify-content: space-between; }
  .mt-2 { margin-top: 8px; }
  .mb-2 { margin-bottom: 8px; }
  .text-accent { color: var(--accent); }
  .text-dim { color: var(--text2); }
  .text-xs { font-size: 11px; }
  .w-full { width: 100%; }
  .divider { border: none; border-top: 1px solid var(--border); margin: 14px 0; }
  .age-badge { display: inline-block; font-size: 10px; padding: 2px 7px; background: var(--surface2); border: 1px solid var(--border2); border-radius: 10px; color: var(--text2); }
`;

// ── Default form state ──────────────────────────────────────────────────────────
const defaultShot = () => ({
  id: null, coffeeId: "", date: now().toISOString().slice(0,10),
  time: now().toTimeString().slice(0,5),
  dose: "", yield: "", shotTime: "", grind: "", temp: "", basket: "",
  preinfusion: "", pressure: "", puckScreen: false,
  score: "", taste: [], body: "", verdict: "", notes: ""
});

const defaultCoffee = () => ({
  id: null, name: "", roaster: "", roastDate: "", decaf: false, decafMethod: "",
  origin: "", process: "", roastLevel: "", bagSize: "", cost: "", currency: "GBP",
  tastingNotes: "", internalNotes: ""
});

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("log");
  const [shots, setShots] = useState(() => {
    migrateLegacyEspressoShots();
    return getEventsByModule("espresso")
      .map(platformEventToShot)
      .filter(Boolean);
  });
  const [coffees, setCoffees] = useState(() => STORE.get("coffees", []));
  const [toast, setToast] = useState(null);
  const [shotModal, setShotModal] = useState(false);
  const [shotForm, setShotForm] = useState(defaultShot());
  const [coffeeModal, setCoffeeModal] = useState(false);
  const [coffeeForm, setCoffeeForm] = useState(defaultCoffee());
  const [fullLog, setFullLog] = useState(false);
  const [filterCoffee, setFilterCoffee] = useState("");
  const [filterDecaf, setFilterDecaf] = useState("all");
  const [filterMinScore, setFilterMinScore] = useState(0);
  const [sortBy, setSortBy] = useState("newest");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showDevData, setShowDevData] = useState(false);

  // Persist coffees (shots are persisted via eventStore on save/update/delete)
  useEffect(() => { STORE.set("coffees", coffees); }, [coffees]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }, []);

  // ── Shot CRUD ──
  const openNewShot = () => {
    setShotForm(defaultShot());
    setFullLog(false);
    setShotModal(true);
  };

  const openEditShot = (shot) => {
    setShotForm({ ...shot });
    setFullLog(true);
    setShotModal(true);
  };

  const repeatLastShot = (coffeeId) => {
    const prev = [...shots].filter(s => s.coffeeId === coffeeId).sort((a,b) => b.date.localeCompare(a.date))[0];
    if (!prev) return;
    setShotForm({
      ...defaultShot(), coffeeId,
      dose: prev.dose, yield: prev.yield, shotTime: prev.shotTime,
      grind: prev.grind, temp: prev.temp, basket: prev.basket,
      preinfusion: prev.preinfusion, pressure: prev.pressure, puckScreen: prev.puckScreen
    });
    setFullLog(false);
    setShotModal(true);
  };

  const saveShot = () => {
    if (!shotForm.coffeeId || !shotForm.date || !shotForm.dose || !shotForm.yield || !shotForm.shotTime || !shotForm.score) {
      showToast("⚠ Fill required fields: coffee, dose, yield, time, score");
      return;
    }
    if (shotForm.id) {
      // Edit: find and update the matching platform event
      const allEvents = getEventsByModule("espresso");
      const evt = allEvents.find(e =>
        e.id === shotForm.id ||
        e.data?.id === shotForm.id ||
        e.source?.sourceEventId === shotForm.id
      );
      if (evt) {
        updateEvent(evt.id, { data: { ...shotForm }, updatedAt: now().toISOString() });
      }
      setShots(s => s.map(x => x.id === shotForm.id ? shotForm : x));
      showToast("Shot updated");
    } else {
      const s = { ...shotForm, id: uuid(), createdAt: now().toISOString() };
      const evt = createEspressoShotEvent(s);
      saveEvent(evt);
      setShots(prev => [s, ...prev]);
      showToast(`Shot saved — Score ${s.score}, 1:${ratio(s.dose, s.yield)}`);
    }
    setShotModal(false);
  };

  const deleteShot = (id) => {
    const allEvents = getEventsByModule("espresso");
    const evt = allEvents.find(e =>
      e.id === id ||
      e.data?.id === id ||
      e.source?.sourceEventId === id
    );
    if (evt) deleteEvent(evt.id);
    setShots(s => s.filter(x => x.id !== id));
    setDeleteConfirm(null);
    showToast("Shot deleted");
  };

  // ── Coffee CRUD ──
  const openNewCoffee = () => { setCoffeeForm(defaultCoffee()); setCoffeeModal(true); };
  const openEditCoffee = (c) => { setCoffeeForm({ ...c }); setCoffeeModal(true); };

  const saveCoffee = () => {
    if (!coffeeForm.name.trim()) { showToast("⚠ Coffee name required"); return; }
    if (coffeeForm.id) {
      setCoffees(c => c.map(x => x.id === coffeeForm.id ? coffeeForm : x));
      showToast("Coffee updated");
    } else {
      const c = { ...coffeeForm, id: uuid(), createdAt: now().toISOString() };
      setCoffees(prev => [...prev, c].sort((a,b) => a.name.localeCompare(b.name)));
      showToast(`"${c.name}" added`);
    }
    setCoffeeModal(false);
  };

  const deleteCoffee = (id) => {
    const linked = shots.filter(s => s.coffeeId === id).length;
    if (linked > 0) {
      showToast(`⚠ ${linked} shot(s) linked — delete shots first`);
      return;
    }
    setCoffees(c => c.filter(x => x.id !== id));
    setDeleteConfirm(null);
    showToast("Coffee deleted");
  };

  // ── Taste toggle ──
  const toggleTaste = (t) => {
    setShotForm(f => {
      if (t === "Balanced") return { ...f, taste: f.taste.includes("Balanced") ? [] : ["Balanced"] };
      const without = f.taste.filter(x => x !== "Balanced");
      return { ...f, taste: without.includes(t) ? without.filter(x => x !== t) : [...without, t] };
    });
  };

  // ── Filtered shots ──
  const filteredShots = useMemo(() => {
    let s = [...shots];
    if (filterCoffee) s = s.filter(x => x.coffeeId === filterCoffee);
    if (filterDecaf !== "all") {
      const decafIds = coffees.filter(c => c.decaf === (filterDecaf === "decaf")).map(c => c.id);
      s = s.filter(x => decafIds.includes(x.coffeeId));
    }
    if (filterMinScore > 0) s = s.filter(x => Number(x.score) >= filterMinScore);
    if (sortBy === "newest") s.sort((a,b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
    if (sortBy === "score") s.sort((a,b) => Number(b.score) - Number(a.score));
    if (sortBy === "coffee") s.sort((a,b) => {
      const ca = coffees.find(c => c.id === a.coffeeId)?.name || "";
      const cb = coffees.find(c => c.id === b.coffeeId)?.name || "";
      return ca.localeCompare(cb);
    });
    return s;
  }, [shots, coffees, filterCoffee, filterDecaf, filterMinScore, sortBy]);

  // ── Analysis data ──
  const analysis = useMemo(() => {
    const scored = shots.filter(s => s.score);
    const avgScore = scored.length ? (scored.reduce((a,s) => a + Number(s.score), 0) / scored.length).toFixed(1) : null;
    const avgRatio = shots.filter(s => s.dose && s.yield).length
      ? (shots.filter(s => s.dose && s.yield).reduce((a,s) => a + s.yield/s.dose, 0) / shots.filter(s => s.dose && s.yield).length).toFixed(2)
      : null;

    // Best coffee (median, 3+ shots)
    const byC = {};
    shots.forEach(s => { if (!byC[s.coffeeId]) byC[s.coffeeId] = []; byC[s.coffeeId].push(Number(s.score)); });
    let bestCoffee = null, bestMed = 0;
    Object.entries(byC).forEach(([id, scores]) => {
      if (scores.length >= 3) {
        const sorted = [...scores].sort((a,b) => a-b);
        const med = sorted[Math.floor(sorted.length/2)];
        if (med > bestMed) { bestMed = med; bestCoffee = coffees.find(c => c.id === id); }
      }
    });

    // Score over time chart data
    const chartData = [...shots].filter(s => s.score).sort((a,b) => a.date.localeCompare(b.date)).map(s => ({
      date: fmtDate(s.date),
      score: Number(s.score),
      coffee: coffees.find(c => c.id === s.coffeeId)?.name || "Unknown",
      ratio: s.dose && s.yield ? Number((s.yield/s.dose).toFixed(2)) : null
    }));

    // Best recipe per coffee (3+ shots)
    const bestRecipes = Object.entries(byC).filter(([,sc]) => sc.length >= 3).map(([id]) => {
      const coffee = coffees.find(c => c.id === id);
      const cShots = shots.filter(s => s.coffeeId === id && s.score).sort((a,b) => Number(b.score) - Number(a.score));
      const best = cShots[0];
      const last5 = cShots.slice(0,5).map(s => Number(s.score));
      const trend = last5.length >= 3
        ? (last5[0] > last5[last5.length-1] ? "↑ improving" : last5[0] < last5[last5.length-1] ? "↓ declining" : "→ stable")
        : "—";
      return { coffee, best, count: cShots.length, trend };
    }).filter(r => r.coffee && r.best);

    return { avgScore, avgRatio, bestCoffee, bestMed, chartData, bestRecipes, totalShots: shots.length };
  }, [shots, coffees]);

  // ── Coffee stats ──
  const coffeeStats = (coffeeId) => {
    const s = shots.filter(x => x.coffeeId === coffeeId && x.score);
    const avg = s.length ? (s.reduce((a,x) => a + Number(x.score), 0) / s.length).toFixed(1) : null;
    return { count: shots.filter(x => x.coffeeId === coffeeId).length, avg };
  };

  const coffeeCostPerShot = (c) => {
    if (!c.cost || !c.bagSize) return null;
    const avgDose = shots.filter(s => s.coffeeId === c.id && s.dose).reduce((a,s,_,arr) => a + s.dose/arr.length, 0) || 18;
    return ((c.cost / c.bagSize) * avgDose).toFixed(2);
  };

  // ── Export / Import ──
  const exportJSON = () => {
    const data = JSON.stringify({ shots, coffees }, null, 2);
    const a = document.createElement("a");
    a.href = "data:application/json," + encodeURIComponent(data);
    a.download = `espresso-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
  };

  const importJSON = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        const d = JSON.parse(ev.target.result);
        if (d.shots) setShots(d.shots);
        if (d.coffees) setCoffees(d.coffees);
        showToast("Data imported");
      } catch { showToast("⚠ Invalid file"); }
    };
    r.readAsText(f);
  };

  // ──────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {/* Header */}
        <div className="header">
          <h1>espresso<span>.</span>log</h1>
        </div>

        {/* Tabs */}
        <div className="tabs">
          {[["log","Shot Log"],["coffees","Coffees"],["analysis","Analysis"]].map(([id,label]) => (
            <button key={id} className={`tab${tab===id?" active":""}`} onClick={()=>setTab(id)}>
              {label}
              {id==="coffees" && coffees.length > 0 && <span className="badge">{coffees.length}</span>}
            </button>
          ))}
        </div>

        {/* ── Shot Log Tab ── */}
        {tab==="log" && (
          <div className="scroll">
            <div className="flex gap-2 items-center justify-between mb-2">
              <span className="text-dim text-xs">{shots.length} shot{shots.length!==1?"s":""} logged</span>
              <button className="btn btn-primary btn-sm" onClick={openNewShot}>+ New Shot</button>
            </div>

            {/* Filter bar */}
            {shots.length > 0 && (
              <div className="filter-bar">
                <div className="filter-row">
                  <select className="form-select" style={{flex:2}} value={filterCoffee} onChange={e=>setFilterCoffee(e.target.value)}>
                    <option value="">All coffees</option>
                    {coffees.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select className="form-select" style={{flex:1}} value={filterDecaf} onChange={e=>setFilterDecaf(e.target.value)}>
                    <option value="all">All</option>
                    <option value="regular">Regular</option>
                    <option value="decaf">Decaf</option>
                  </select>
                  <select className="form-select" style={{flex:1}} value={sortBy} onChange={e=>setSortBy(e.target.value)}>
                    <option value="newest">Newest</option>
                    <option value="score">Best score</option>
                    <option value="coffee">Coffee A–Z</option>
                  </select>
                </div>
                {filterMinScore > 0 && (
                  <div className="mt-2 text-xs text-dim">Min score: {filterMinScore}+ <button className="btn-icon btn-sm" onClick={()=>setFilterMinScore(0)} style={{fontSize:10,padding:"1px 5px"}}>✕</button></div>
                )}
              </div>
            )}

            {filteredShots.length === 0 && (
              <div className="empty">
                <div className="empty-icon">☕</div>
                <div className="empty-text">{shots.length===0 ? "No shots logged yet.\nTap + New Shot to begin." : "No shots match your filters."}</div>
              </div>
            )}

            {filteredShots.map(shot => {
              const coffee = coffees.find(c => c.id === shot.coffeeId);
              const age = coffeeAge(shot.date, coffee?.roastDate);
              const sc = Number(shot.score);
              return (
                <div key={shot.id} className="shot-card">
                  <div className="shot-top">
                    <div>
                      <div className="shot-coffee">{coffee?.name || "Unknown coffee"}</div>
                      <div className="shot-meta">{fmtDate(shot.date)} {shot.time} {age !== null && <span className="age-badge">{age}d old</span>}</div>
                    </div>
                    <div className="shot-score" style={{color: scoreColor(sc)}}>{shot.score}</div>
                  </div>
                  <div className="shot-grid">
                    <div className="shot-stat">
                      <div className="shot-stat-label">Dose→Yield</div>
                      <div className="shot-stat-val">{shot.dose}g→{shot.yield}g</div>
                    </div>
                    <div className="shot-stat">
                      <div className="shot-stat-label">Ratio</div>
                      <div className="shot-stat-val">1:{ratio(shot.dose,shot.yield)}</div>
                    </div>
                    <div className="shot-stat">
                      <div className="shot-stat-label">Time</div>
                      <div className="shot-stat-val">{shot.shotTime}s</div>
                    </div>
                    <div className="shot-stat">
                      <div className="shot-stat-label">Grind</div>
                      <div className="shot-stat-val">{shot.grind || "—"}</div>
                    </div>
                    <div className="shot-stat">
                      <div className="shot-stat-label">Temp</div>
                      <div className="shot-stat-val">{shot.temp ? `${shot.temp}°C` : "—"}</div>
                    </div>
                    <div className="shot-stat">
                      <div className="shot-stat-label">Pressure</div>
                      <div className="shot-stat-val">{shot.pressure || "—"}</div>
                    </div>
                  </div>
                  {shot.taste?.length > 0 && (
                    <div className="shot-tags">
                      {shot.taste.map(t => <span key={t} className="shot-tag">{t}</span>)}
                      {shot.body && <span className="shot-tag" style={{borderColor:"var(--accent)",color:"var(--accent)"}}>{shot.body}</span>}
                    </div>
                  )}
                  {shot.verdict && (
                    <div className="shot-verdict" style={{color: verdictColor(shot.verdict), borderColor: verdictColor(shot.verdict)}}>
                      {shot.verdict}
                    </div>
                  )}
                  {shot.notes && <div className="shot-notes">"{shot.notes}"</div>}
                  <div className="shot-actions">
                    <button className="btn btn-ghost btn-sm" onClick={()=>openEditShot(shot)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" onClick={()=>repeatLastShot(shot.coffeeId)}>Repeat</button>
                    <button className="btn btn-danger btn-sm" onClick={()=>setDeleteConfirm({type:"shot",id:shot.id})}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Coffees Tab ── */}
        {tab==="coffees" && (
          <div className="scroll">
            <div className="flex gap-2 items-center justify-between mb-2">
              <span className="text-dim text-xs">{coffees.length} coffee{coffees.length!==1?"s":""} on record</span>
              <button className="btn btn-primary btn-sm" onClick={openNewCoffee}>+ Add Coffee</button>
            </div>

            {coffees.length === 0 && (
              <div className="empty">
                <div className="empty-icon">🫘</div>
                <div className="empty-text">No coffees yet.\nAdd one to start logging shots.</div>
              </div>
            )}

            {coffees.map(c => {
              const stats = coffeeStats(c.id);
              const cps = coffeeCostPerShot(c);
              return (
                <div key={c.id} className="coffee-card">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="coffee-name">{c.name}</div>
                      <div className="coffee-roaster">{[c.roaster, c.origin].filter(Boolean).join(" · ")}</div>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-icon" onClick={()=>openEditCoffee(c)}>✎</button>
                      <button className="btn-icon" style={{color:"var(--red)"}} onClick={()=>setDeleteConfirm({type:"coffee",id:c.id})}>✕</button>
                    </div>
                  </div>
                  <div className="coffee-pills">
                    {c.roastDate && <span className="coffee-pill">Roasted {fmtDate(c.roastDate)}</span>}
                    {c.process && <span className="coffee-pill">{c.process}</span>}
                    {c.roastLevel && <span className="coffee-pill">{c.roastLevel}</span>}
                    {c.decaf && <span className="coffee-pill" style={{color:"var(--accent)"}}>Decaf {c.decafMethod && `(${c.decafMethod})`}</span>}
                  </div>
                  {c.tastingNotes && <div className="shot-notes mb-2">"{c.tastingNotes}"</div>}
                  <div className="coffee-stats">
                    <div>
                      <div className="coffee-stat-label">Shots</div>
                      <div className="coffee-stat-val">{stats.count}</div>
                    </div>
                    <div>
                      <div className="coffee-stat-label">Avg score</div>
                      <div className="coffee-stat-val" style={{color: stats.avg ? scoreColor(Number(stats.avg)) : "var(--text3)"}}>{stats.avg || "—"}</div>
                    </div>
                    <div>
                      <div className="coffee-stat-label">Cost/shot</div>
                      <div className="coffee-stat-val">{cps ? `${c.currency || "£"}${cps}` : "—"}</div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Data management */}
            <hr className="divider" />
            <div className="section-label">Data</div>
            <div className="flex gap-2">
              <button className="btn btn-ghost btn-sm" onClick={exportJSON}>Export JSON</button>
              <label className="btn btn-ghost btn-sm" style={{cursor:"pointer"}}>
                Import JSON
                <input type="file" accept=".json" style={{display:"none"}} onChange={importJSON} />
              </label>
            </div>
          </div>
        )}

        {/* ── Analysis Tab ── */}
        {tab==="analysis" && (
          <div className="scroll">
            {shots.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">📈</div>
                <div className="empty-text">Log some shots to see analysis.</div>
              </div>
            ) : (
              <>
                {/* Summary */}
                <div className="summary-grid">
                  <div className="summary-stat">
                    <div className="summary-label">Total shots</div>
                    <div className="summary-val">{analysis.totalShots}</div>
                  </div>
                  <div className="summary-stat">
                    <div className="summary-label">Avg score</div>
                    <div className="summary-val" style={{color: analysis.avgScore ? scoreColor(Number(analysis.avgScore)) : "var(--text)"}}>{analysis.avgScore || "—"}</div>
                  </div>
                  <div className="summary-stat">
                    <div className="summary-label">Avg ratio</div>
                    <div className="summary-val">1:{analysis.avgRatio || "—"}</div>
                  </div>
                  <div className="summary-stat">
                    <div className="summary-label">Best coffee</div>
                    <div className="summary-val" style={{fontSize:14}}>{analysis.bestCoffee?.name || "—"}</div>
                    {analysis.bestCoffee && <div className="summary-sub">med {analysis.bestMed}/10</div>}
                  </div>
                </div>

                {/* Score over time */}
                {analysis.chartData.length >= 2 && (
                  <div className="chart-wrap">
                    <div className="chart-title">Score over time</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={analysis.chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2e2520" />
                        <XAxis dataKey="date" tick={{fill:"#5c4f45", fontSize:10}} tickLine={false} />
                        <YAxis domain={[0,10]} tick={{fill:"#5c4f45", fontSize:10}} tickLine={false} width={20} />
                        <Tooltip contentStyle={{background:"#1a1511",border:"1px solid #2e2520",borderRadius:6,fontSize:11,color:"#e8ddd4"}} />
                        <ReferenceLine y={7} stroke="#2e2520" strokeDasharray="4 2" />
                        <Line type="monotone" dataKey="score" stroke="#c8824a" strokeWidth={2} dot={{fill:"#c8824a",r:3}} activeDot={{r:5}} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Ratio vs Score */}
                {analysis.chartData.filter(d=>d.ratio).length >= 3 && (
                  <div className="chart-wrap">
                    <div className="chart-title">Ratio vs Score</div>
                    <ResponsiveContainer width="100%" height={160}>
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2e2520" />
                        <XAxis dataKey="ratio" name="Ratio" type="number" domain={["auto","auto"]} tick={{fill:"#5c4f45",fontSize:10}} tickLine={false} label={{value:"Ratio",position:"insideBottom",offset:-2,fill:"#5c4f45",fontSize:10}} />
                        <YAxis dataKey="score" name="Score" domain={[0,10]} tick={{fill:"#5c4f45",fontSize:10}} tickLine={false} width={20} />
                        <Tooltip contentStyle={{background:"#1a1511",border:"1px solid #2e2520",borderRadius:6,fontSize:11,color:"#e8ddd4"}} />
                        <Scatter data={analysis.chartData.filter(d=>d.ratio)} fill="#c8824a" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Best recipes */}
                {analysis.bestRecipes.length > 0 && (
                  <>
                    <div className="section-label">Best Recipe Per Coffee</div>
                    {analysis.bestRecipes.map(({coffee,best,count,trend}) => (
                      <div key={coffee.id} className="recipe-card">
                        <div className="recipe-coffee">{coffee.name}</div>
                        <div className="recipe-grid">
                          <div>
                            <div className="recipe-stat-label">Score</div>
                            <div className="recipe-stat-val" style={{color:scoreColor(Number(best.score))}}>{best.score}/10</div>
                          </div>
                          <div>
                            <div className="recipe-stat-label">Dose→Yield</div>
                            <div className="recipe-stat-val">{best.dose}g→{best.yield}g</div>
                          </div>
                          <div>
                            <div className="recipe-stat-label">Ratio</div>
                            <div className="recipe-stat-val">1:{ratio(best.dose,best.yield)}</div>
                          </div>
                          <div>
                            <div className="recipe-stat-label">Grind</div>
                            <div className="recipe-stat-val">{best.grind || "—"}</div>
                          </div>
                          <div>
                            <div className="recipe-stat-label">Time</div>
                            <div className="recipe-stat-val">{best.shotTime}s</div>
                          </div>
                          <div>
                            <div className="recipe-stat-label">Age</div>
                            <div className="recipe-stat-val">{coffeeAge(best.date,coffee.roastDate) ?? "—"}d</div>
                          </div>
                        </div>
                        <div className="trend text-xs text-dim">
                          {count} shots logged · Trend: <span style={{color: trend.startsWith("↑") ? "var(--green)" : trend.startsWith("↓") ? "var(--red)" : "var(--text2)"}}>{trend}</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Shot Modal ── */}
        {shotModal && (
          <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget) setShotModal(false); }}>
            <div className="modal">
              <div className="modal-handle" />
              <div className="modal-title">{shotForm.id ? "Edit Shot" : "Log Shot"}</div>

              <div className="section-label">Core</div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Date<span className="req">*</span></label>
                  <input type="date" className="form-input" value={shotForm.date} onChange={e=>setShotForm(f=>({...f,date:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Time</label>
                  <input type="time" className="form-input" value={shotForm.time} onChange={e=>setShotForm(f=>({...f,time:e.target.value}))} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Coffee<span className="req">*</span></label>
                <select className="form-select" value={shotForm.coffeeId} onChange={e=>setShotForm(f=>({...f,coffeeId:e.target.value}))}>
                  <option value="">Select coffee…</option>
                  {coffees.map(c => {
                    const age = coffeeAge(shotForm.date, c.roastDate);
                    return <option key={c.id} value={c.id}>{c.name}{c.roastDate ? ` — ${fmtDate(c.roastDate)}${age!==null?` (${age}d)`:``}` : ""}</option>;
                  })}
                </select>
                {coffees.length === 0 && <div className="text-xs text-dim mt-2">Add a coffee record first.</div>}
              </div>

              <div className="form-row-3">
                <div className="form-group">
                  <label className="form-label">Dose g<span className="req">*</span></label>
                  <input type="number" inputMode="decimal" className="form-input" value={shotForm.dose} onChange={e=>setShotForm(f=>({...f,dose:e.target.value}))} placeholder="18" />
                </div>
                <div className="form-group">
                  <label className="form-label">Yield g<span className="req">*</span></label>
                  <input type="number" inputMode="decimal" className="form-input" value={shotForm.yield} onChange={e=>setShotForm(f=>({...f,yield:e.target.value}))} placeholder="36" />
                </div>
                <div className="form-group">
                  <label className="form-label">Time s<span className="req">*</span></label>
                  <input type="number" inputMode="decimal" className="form-input" value={shotForm.shotTime} onChange={e=>setShotForm(f=>({...f,shotTime:e.target.value}))} placeholder="28" />
                </div>
              </div>

              {shotForm.dose && shotForm.yield && (
                <div className="text-xs text-dim mb-2">Ratio: 1:{ratio(shotForm.dose, shotForm.yield)}</div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Grind<span className="req">*</span></label>
                  <input type="text" className="form-input" value={shotForm.grind} onChange={e=>setShotForm(f=>({...f,grind:e.target.value}))} placeholder="e.g. 12.5" />
                </div>
                <div className="form-group">
                  <label className="form-label">Score /10<span className="req">*</span></label>
                  <select className="form-select" value={shotForm.score} onChange={e=>setShotForm(f=>({...f,score:e.target.value}))}>
                    <option value="">—</option>
                    {[1,2,3,4,5,6,7,8,9,10].map(n=><option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              {/* Outcome */}
              <div className="section-label">Outcome</div>
              <div className="form-group">
                <label className="form-label">Taste</label>
                <div className="tag-grid">
                  {TASTE_OPTS.map(t => (
                    <div key={t} className={`tag${shotForm.taste?.includes(t)?" active":""}`} onClick={()=>toggleTaste(t)}>{t}</div>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Body</label>
                  <select className="form-select" value={shotForm.body} onChange={e=>setShotForm(f=>({...f,body:e.target.value}))}>
                    <option value="">—</option>
                    {BODY_OPTS.map(b=><option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Verdict</label>
                  <select className="form-select" value={shotForm.verdict} onChange={e=>setShotForm(f=>({...f,verdict:e.target.value}))}>
                    <option value="">—</option>
                    {VERDICT_OPTS.map(v=><option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-textarea" value={shotForm.notes} onChange={e=>setShotForm(f=>({...f,notes:e.target.value}))} placeholder="Any observations…" />
              </div>

              {/* Full log toggle */}
              <button className="collapse-btn" onClick={()=>setFullLog(x=>!x)}>
                {fullLog ? "▲ Hide" : "▼ Show"} equipment fields
              </button>

              {fullLog && (
                <>
                  <div className="section-label">Equipment & Technique</div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Temp °C</label>
                      <input type="number" inputMode="decimal" className="form-input" value={shotForm.temp} onChange={e=>setShotForm(f=>({...f,temp:e.target.value}))} placeholder="93" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Pressure</label>
                      <input type="text" className="form-input" value={shotForm.pressure} onChange={e=>setShotForm(f=>({...f,pressure:e.target.value}))} placeholder="9 bar" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Preinfusion s</label>
                      <input type="number" inputMode="decimal" className="form-input" value={shotForm.preinfusion} onChange={e=>setShotForm(f=>({...f,preinfusion:e.target.value}))} placeholder="5" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Basket</label>
                      <input type="text" className="form-input" value={shotForm.basket} onChange={e=>setShotForm(f=>({...f,basket:e.target.value}))} placeholder="18g VST" />
                    </div>
                  </div>
                  <div className="form-group">
                    <div className="toggle-row">
                      <label className="form-label" style={{margin:0}}>Puck screen</label>
                      <label className="toggle">
                        <input type="checkbox" checked={shotForm.puckScreen} onChange={e=>setShotForm(f=>({...f,puckScreen:e.target.checked}))} />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </div>
                </>
              )}

              <div className="sticky-save">
                <div className="flex gap-2">
                  <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setShotModal(false)}>Cancel</button>
                  <button className="btn btn-primary" style={{flex:2}} onClick={saveShot}>Save Shot</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Coffee Modal ── */}
        {coffeeModal && (
          <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget) setCoffeeModal(false); }}>
            <div className="modal">
              <div className="modal-handle" />
              <div className="modal-title">{coffeeForm.id ? "Edit Coffee" : "Add Coffee"}</div>

              <div className="section-label">Core</div>
              <div className="form-group">
                <label className="form-label">Name<span className="req">*</span></label>
                <input type="text" className="form-input" value={coffeeForm.name} onChange={e=>setCoffeeForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Monmouth Espresso" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Roaster</label>
                  <input type="text" className="form-input" value={coffeeForm.roaster} onChange={e=>setCoffeeForm(f=>({...f,roaster:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Roast date</label>
                  <input type="date" className="form-input" value={coffeeForm.roastDate} onChange={e=>setCoffeeForm(f=>({...f,roastDate:e.target.value}))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Origin / blend</label>
                  <input type="text" className="form-input" value={coffeeForm.origin} onChange={e=>setCoffeeForm(f=>({...f,origin:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Process</label>
                  <select className="form-select" value={coffeeForm.process} onChange={e=>setCoffeeForm(f=>({...f,process:e.target.value}))}>
                    <option value="">—</option>
                    {PROCESS_OPTS.map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Roast level</label>
                <div className="tag-grid">
                  {ROAST_OPTS.map(r=>(
                    <div key={r} className={`tag${coffeeForm.roastLevel===r?" active":""}`} onClick={()=>setCoffeeForm(f=>({...f,roastLevel:f.roastLevel===r?"":r}))}>{r}</div>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <div className="toggle-row">
                  <label className="form-label" style={{margin:0}}>Decaf</label>
                  <label className="toggle">
                    <input type="checkbox" checked={coffeeForm.decaf} onChange={e=>setCoffeeForm(f=>({...f,decaf:e.target.checked}))} />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>
              {coffeeForm.decaf && (
                <div className="form-group">
                  <label className="form-label">Decaf method</label>
                  <select className="form-select" value={coffeeForm.decafMethod} onChange={e=>setCoffeeForm(f=>({...f,decafMethod:e.target.value}))}>
                    <option value="">—</option>
                    {DECAF_OPTS.map(d=><option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}

              <div className="section-label">Commercial</div>
              <div className="form-row-3">
                <div className="form-group">
                  <label className="form-label">Bag size g</label>
                  <input type="number" inputMode="decimal" className="form-input" value={coffeeForm.bagSize} onChange={e=>setCoffeeForm(f=>({...f,bagSize:e.target.value}))} placeholder="250" />
                </div>
                <div className="form-group">
                  <label className="form-label">Cost</label>
                  <input type="number" inputMode="decimal" className="form-input" value={coffeeForm.cost} onChange={e=>setCoffeeForm(f=>({...f,cost:e.target.value}))} placeholder="14.00" />
                </div>
                <div className="form-group">
                  <label className="form-label">Currency</label>
                  <select className="form-select" value={coffeeForm.currency} onChange={e=>setCoffeeForm(f=>({...f,currency:e.target.value}))}>
                    {["GBP","EUR","USD","AUD"].map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Tasting notes (from bag)</label>
                <input type="text" className="form-input" value={coffeeForm.tastingNotes} onChange={e=>setCoffeeForm(f=>({...f,tastingNotes:e.target.value}))} placeholder="e.g. Dark chocolate, cherry, caramel" />
              </div>
              <div className="form-group">
                <label className="form-label">Internal notes</label>
                <textarea className="form-textarea" value={coffeeForm.internalNotes} onChange={e=>setCoffeeForm(f=>({...f,internalNotes:e.target.value}))} />
              </div>

              <div className="sticky-save">
                <div className="flex gap-2">
                  <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setCoffeeModal(false)}>Cancel</button>
                  <button className="btn btn-primary" style={{flex:2}} onClick={saveCoffee}>Save Coffee</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Delete confirm ── */}
        {deleteConfirm && (
          <div className="modal-overlay" onClick={()=>setDeleteConfirm(null)}>
            <div className="modal" style={{paddingBottom:24}}>
              <div className="modal-handle" />
              <div className="modal-title">Confirm delete</div>
              <p className="text-dim text-xs" style={{marginBottom:16}}>
                {deleteConfirm.type === "coffee"
                  ? `Delete this coffee record? This cannot be undone.`
                  : `Delete this shot? This cannot be undone.`}
              </p>
              <div className="flex gap-2">
                <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setDeleteConfirm(null)}>Cancel</button>
                <button className="btn btn-danger" style={{flex:1}} onClick={()=>deleteConfirm.type==="shot" ? deleteShot(deleteConfirm.id) : deleteCoffee(deleteConfirm.id)}>Delete</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Developer Data ── */}
        {showDevData && <DeveloperDataView onClose={() => setShowDevData(false)} />}

        {/* ── Toast ── */}
        {toast && <div className="toast">{toast}</div>}

        {/* ── Dev button (fixed, bottom-right) ── */}
        <button
          onClick={() => setShowDevData(true)}
          style={{
            position: "fixed", bottom: 8, right: 8,
            background: "transparent", border: "none",
            color: "var(--text3)", fontSize: 10,
            fontFamily: "var(--font-mono)", letterSpacing: "0.06em",
            cursor: "pointer", padding: "4px 6px", zIndex: 40,
            opacity: 0.5
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = "1"}
          onMouseLeave={e => e.currentTarget.style.opacity = "0.5"}
        >
          dev
        </button>
      </div>
    </>
  );
}