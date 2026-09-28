import { useState } from "react";

export function NumberInput({
  label,
  min,
  onChange,
  step,
  value,
}: {
  label: string;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  // What the user is typing, while they type. Reporting every keystroke as a
  // number turned an emptied field into 0 (which mutations then clamp) and
  // snapped the input back, so a value could not be cleared and retyped.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        step={step}
        value={draft ?? String(value)}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          const parsed = Number(raw);
          if (raw.trim() !== "" && Number.isFinite(parsed)) {
            onChange(parsed);
          }
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  );
}

/**
 * A free-text field committed on blur, not per keystroke — the same
 * draft-state reason `NumberInput` above keeps one: reporting every
 * keystroke would fight a value the caller reformats (e.g. joining a rate
 * list back with ", "), snapping the field back mid-edit.
 */
export function TextInput({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (text: string) => void;
  placeholder?: string;
  value: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="editor-param-wide">
      {label}
      <input
        type="text"
        placeholder={placeholder}
        value={draft ?? value}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== null) onChange(draft);
          setDraft(null);
        }}
      />
    </label>
  );
}

export function SelectInput<TValue extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: TValue) => void;
  options: readonly TValue[];
  value: TValue;
}) {
  return (
    <label>
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as TValue)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
