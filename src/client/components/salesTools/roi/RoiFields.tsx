import { useState } from "react";
import { parseNum, shownValue } from "../../../../shared/roiModel/format";
import type { RoiField, RoiFieldType } from "../../../../shared/roiModel/types";

/**
 * Field controls. Each keeps the typed text as a local draft and commits on
 * every keystroke with the original builder's semantics:
 * - text: stored as typed.
 * - numOpt (handle time): blank, not a number, or ≤ 0 → unset (null).
 * - everything else: not a number (including blank) → the stored value is
 *   kept; percents are typed as whole numbers and stored as fractions.
 * Drafts reset when the field remounts (step change or inputs replaced).
 */

type Commit = (v: string | number | null) => void;

/** Parse a numeric draft; `undefined` = not a number, keep the stored value. */
function parseDraft(type: RoiFieldType, raw: string): number | null | undefined {
  let v = parseNum(raw);
  if (type === "numOpt") return isNaN(v) || v <= 0 ? null : v;
  if (isNaN(v)) return undefined;
  if (type.startsWith("pct")) v = v / 100;
  return v;
}

function NumberInput({
  id, type, value, onCommit, label,
}: {
  id: string;
  type: RoiFieldType;
  value: number | null;
  onCommit: (v: number | null) => void;
  label?: string;
}) {
  const [draft, setDraft] = useState(() => shownValue(type, value));
  const parsed = parseDraft(type, draft);
  const pre = type.startsWith("money") ? "$" : "";
  const suf = type.startsWith("pct") ? "%" : "";
  const kept = parsed === undefined;
  return (
    <div>
      <div className={"roi-inp" + (kept ? " roi-inp-bad" : "")}>
        {pre && <span aria-hidden="true">{pre}</span>}
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={draft}
          aria-label={label}
          aria-invalid={kept || undefined}
          onChange={(e) => {
            const raw = e.target.value;
            setDraft(raw);
            const v = parseDraft(type, raw);
            if (v !== undefined) onCommit(v);
          }}
        />
        {suf && <span aria-hidden="true">{suf}</span>}
      </div>
      {kept && (
        <div className="roi-kept" role="status">
          Not a number, keeping {pre}{shownValue(type, value)}{suf}
        </div>
      )}
    </div>
  );
}

export function TextField({ field, value, onCommit }: { field: RoiField; value: string; onCommit: Commit }) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="roi-inp">
      <input
        id={`f-${field.k}`}
        type="text"
        autoComplete="off"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          onCommit(e.target.value);
        }}
      />
    </div>
  );
}

export function NumberField({ field, value, onCommit }: { field: RoiField; value: number | null; onCommit: Commit }) {
  return <NumberInput id={`f-${field.k}`} type={field.type} value={value} onCommit={onCommit} />;
}

export function TrioField({
  field, value, onCommit,
}: {
  field: RoiField;
  value: number[];
  onCommit: (i: number, v: number | null) => void;
}) {
  return (
    <div className="roi-trio">
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <small>Year {i + 1}</small>
          <NumberInput
            id={`f-${field.k}-${i}`}
            type={field.type}
            value={value[i]}
            label={i === 0 ? undefined : `${field.label}, Year ${i + 1}`}
            onCommit={(v) => onCommit(i, v)}
          />
        </div>
      ))}
    </div>
  );
}
