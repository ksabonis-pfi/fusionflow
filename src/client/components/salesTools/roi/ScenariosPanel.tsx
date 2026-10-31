import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MODEL_VERSION } from "../../../../shared/roiModel/model";
import type { RoiInputs } from "../../../../shared/roiModel/types";
import { ApiError } from "../../../lib/api";
import { useToast } from "../../ui/ToastProvider";
import { roiScenarios, type RoiScenario, type RoiScenarioSummary } from "./scenariosApi";
import { coerceInputs, readSaved, writeLegacySaved, type LoadedScenario } from "./state";

type Props = {
  P: RoiInputs;
  userId: string;
  /** The shared scenario the current draft came from, if any. */
  loaded: LoadedScenario | null;
  onOpen: (P: RoiInputs, meta: LoadedScenario) => void;
  /** Called after a save so the draft points at the saved scenario. */
  onSaved: (meta: LoadedScenario) => void;
  /** The loaded scenario is gone (deleted): the draft stays, Save creates a new one. */
  onDetach: () => void;
};

const NAME_MAX = 120;
const dismissKey = (userId: string) => `pf-roi-builder-v1:import-dismissed:${userId}`;

function toMeta(s: RoiScenario | RoiScenarioSummary): LoadedScenario {
  return {
    id: s.id,
    name: s.name,
    owner_name: s.owner_name,
    can_edit: s.can_edit,
    updated_at: s.updated_at,
    model_version: s.model_version,
  };
}

function errMsg(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Shared saved scenarios: everyone with Sales Tools sees everyone's; owners and admins edit. */
export function ScenariosPanel({ P, userId, loaded, onOpen, onSaved, onDetach }: Props) {
  const { showToast } = useToast();
  const [items, setItems] = useState<RoiScenarioSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  const armTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(armTimer.current), []);

  // Scenario name: follows the loaded scenario, else the client name.
  const defaultName = (loaded?.name ?? P.client.trim()) || "Scenario";
  const [nameDraft, setNameDraft] = useState<{ key: string; value: string } | null>(null);
  const nameKey = loaded?.id ?? "new";
  const name = nameDraft?.key === nameKey ? nameDraft.value : defaultName;

  const refresh = useCallback(async () => {
    try {
      const r = await roiScenarios.list();
      setItems(r.scenarios);
      setLoadError(null);
    } catch (e) {
      setLoadError(errMsg(e, "Couldn't load scenarios"));
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // One-time offer to import scenarios saved in this browser before D1.
  const [legacy, setLegacy] = useState(() => {
    try {
      if (localStorage.getItem(dismissKey(userId))) return {};
    } catch {
      /* ignore */
    }
    return readSaved(userId);
  });
  const legacyCount = Object.keys(legacy).length;

  function dismissImport() {
    try {
      localStorage.setItem(dismissKey(userId), "1");
    } catch {
      /* ignore */
    }
    setLegacy({});
  }

  async function importLegacy() {
    if (busy) return;
    setBusy(true);
    const left: typeof legacy = {};
    let ok = 0;
    for (const [n, inputs] of Object.entries(legacy)) {
      try {
        await roiScenarios.create(n.slice(0, NAME_MAX) || "Scenario", coerceInputs(inputs));
        ok++;
      } catch {
        left[n] = inputs;
      }
    }
    writeLegacySaved(userId, left);
    setLegacy(left);
    setBusy(false);
    await refresh();
    const failed = Object.keys(left).length;
    if (failed) showToast(`Imported ${ok}; ${failed} couldn't be imported`, "error");
    else showToast(`Imported ${ok} scenario${ok === 1 ? "" : "s"}`, "success");
  }

  async function run<T>(fn: () => Promise<T>, fail: string): Promise<T | null> {
    if (busy) return null;
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
        showToast("Someone else updated this scenario. Reload it or save as a copy.", "error");
        void refresh();
      } else if (e instanceof ApiError && e.status === 404) {
        if (loaded) onDetach();
        showToast("That scenario was deleted. Save will create a new one.", "error");
        void refresh();
      } else {
        showToast(errMsg(e, fail), "error");
      }
      return null;
    } finally {
      setBusy(false);
    }
  }

  const trimmed = name.trim().slice(0, NAME_MAX);
  const canUpdate = !!loaded?.can_edit && !conflict;

  async function save() {
    if (!trimmed) return showToast("Give the scenario a name", "error");
    const s = await run(
      () => (canUpdate && loaded
        ? roiScenarios.update(loaded.id, trimmed, P, loaded.updated_at)
        : roiScenarios.create(trimmed, P)),
      "Couldn't save the scenario",
    );
    if (!s) return;
    onSaved(toMeta(s));
    setConflict(false);
    setSelected(s.id);
    showToast(canUpdate ? `Updated ${s.name}` : `Saved ${s.name}`, "success");
    void refresh();
  }

  async function saveCopy() {
    const base = trimmed || "Scenario";
    const copyName = loaded && base === loaded.name ? `${base} (copy)`.slice(0, NAME_MAX) : base;
    const s = await run(() => roiScenarios.create(copyName, P), "Couldn't save a copy");
    if (!s) return;
    onSaved(toMeta(s));
    setConflict(false);
    setSelected(s.id);
    showToast(`Saved your copy: ${s.name}`, "success");
    void refresh();
  }

  async function open(id: string) {
    const s = await run(() => roiScenarios.get(id), "Couldn't open the scenario");
    if (!s) return;
    onOpen(coerceInputs(s.inputs), toMeta(s));
    setConflict(false);
    showToast(`Opened ${s.name}`, "success");
  }

  async function duplicate(id: string) {
    const s = await run(() => roiScenarios.duplicate(id), "Couldn't duplicate the scenario");
    if (!s) return;
    onOpen(coerceInputs(s.inputs), toMeta(s));
    setConflict(false);
    setSelected(s.id);
    showToast(`Opened your copy: ${s.name}`, "success");
    void refresh();
  }

  async function remove(id: string) {
    window.clearTimeout(armTimer.current);
    if (armedDelete !== id) {
      setArmedDelete(id);
      armTimer.current = window.setTimeout(() => setArmedDelete(null), 3500);
      return;
    }
    setArmedDelete(null);
    const ok = await run(() => roiScenarios.remove(id), "Couldn't delete the scenario");
    if (!ok) return;
    showToast("Scenario deleted", "success");
    setSelected(null);
    if (loaded?.id === id) onDetach();
    void refresh();
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((s) => {
      if (mine && s.owner_user_id !== userId) return false;
      if (!q) return true;
      return [s.name, s.client_name, s.owner_name ?? ""].some((v) => v.toLowerCase().includes(q));
    });
  }, [items, query, mine, userId]);

  const versionNote = loaded && loaded.model_version && loaded.model_version !== MODEL_VERSION
    ? `Saved with model v${loaded.model_version}; figures recalculated with v${MODEL_VERSION}.`
    : null;

  return (
    <div className="roi-card roi-saves">
      <h3>Saved scenarios</h3>

      {loaded && (
        <div className="roi-current">
          <span>
            Open: <b>{loaded.name}</b>
            {loaded.owner_name ? ` · ${loaded.owner_name}` : ""}
          </span>
          {!loaded.can_edit && <span className="roi-note">Not yours, so saving makes your own copy.</span>}
          {versionNote && <span className="roi-note roi-vnote">{versionNote}</span>}
        </div>
      )}

      {conflict && loaded && (
        <div className="roi-conflict" role="alert">
          Someone else updated this scenario.
          <div className="roi-row">
            <button className="ms-btn-secondary" type="button" disabled={busy} onClick={() => open(loaded.id)}>Reload latest</button>
            <button className="ms-btn-secondary" type="button" disabled={busy} onClick={saveCopy}>Save as copy</button>
          </div>
        </div>
      )}

      <label className="roi-sname">
        <span>Scenario name</span>
        <input
          type="text"
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => setNameDraft({ key: nameKey, value: e.target.value })}
        />
      </label>
      <div className="roi-row">
        <button className="ms-btn-primary" type="button" disabled={busy || !trimmed} onClick={save}>
          {canUpdate ? "Save changes" : loaded && !loaded.can_edit ? "Save as my copy" : "Save"}
        </button>
        {canUpdate && (
          <button className="ms-btn-secondary" type="button" disabled={busy} onClick={saveCopy}>Save as copy</button>
        )}
      </div>

      {legacyCount > 0 && (
        <div className="roi-import">
          <span>
            {legacyCount} scenario{legacyCount === 1 ? " was" : "s were"} saved in this browser only.
          </span>
          <div className="roi-row">
            <button className="ms-btn-secondary" type="button" disabled={busy} onClick={importLegacy}>
              Import {legacyCount}
            </button>
            <button className="ms-btn-secondary" type="button" disabled={busy} onClick={dismissImport}>Not now</button>
          </div>
        </div>
      )}

      <div className="roi-sfilter">
        <input
          type="search"
          placeholder="Search name, client, owner"
          aria-label="Search saved scenarios"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Mine</label>
      </div>

      {loadError ? (
        <p className="roi-note">
          {loadError}.{" "}
          <button className="roi-link" type="button" onClick={() => void refresh()}>Retry</button>
        </p>
      ) : items === null ? (
        <p className="roi-note">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="roi-note">{items.length ? "No scenarios match." : "No saved scenarios yet."}</p>
      ) : (
        <ul className="roi-slist">
          {shown.map((s) => {
            const on = selected === s.id;
            return (
              <li key={s.id} className={on ? "on" : undefined}>
                <button type="button" className="roi-sitem" aria-expanded={on} onClick={() => setSelected(on ? null : s.id)}>
                  <b>{s.name}</b>
                  <span>{[s.client_name, s.owner_name].filter(Boolean).join(" · ")}</span>
                  <span>
                    {shortDate(s.updated_at)} · v{s.model_version}
                    {s.model_version !== MODEL_VERSION ? " (older model)" : ""}
                    {loaded?.id === s.id ? " · open" : ""}
                  </span>
                </button>
                {on && (
                  <div className="roi-sacts">
                    <button className="ms-btn-secondary" type="button" disabled={busy} onClick={() => open(s.id)}>Open</button>
                    <button className="ms-btn-secondary" type="button" disabled={busy} onClick={() => duplicate(s.id)}>Duplicate</button>
                    {s.can_edit && (
                      <button className="ms-btn-secondary roi-danger" type="button" disabled={busy} onClick={() => remove(s.id)}>
                        {armedDelete === s.id ? "Click again to delete" : "Delete"}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="roi-note">Shared with everyone who has Sales Tools. Only the owner or an admin can change or delete one.</p>
    </div>
  );
}
