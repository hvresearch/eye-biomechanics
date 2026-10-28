import { useEffect, useState } from "react";
import { finalValue, liveValue } from "./numberDraft";

/**
 * A number box that keeps the text being typed as a local draft. It commits only in-range
 * values while typing and clamps once when editing ends, so partial entries are never
 * clamped or reverted mid-keystroke.
 */
export function NumberField({
  id,
  testId,
  value,
  min,
  max,
  step,
  format,
  onCommit,
}: {
  id: string;
  testId: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(() => format(value));

  // Follow changes made elsewhere (the slider); leave the draft alone when it already says this value.
  useEffect(() => {
    setDraft((d) => (liveValue(d, min, max) === value ? d : format(value)));
  }, [value, min, max, format]);

  const finish = () => {
    const v = finalValue(draft, min, max);
    if (v === null) {
      setDraft(format(value));
      return;
    }
    setDraft(format(v));
    if (v !== value) onCommit(v);
  };

  return (
    <input
      id={id}
      data-testid={testId}
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = liveValue(e.target.value, min, max);
        if (v !== null && v !== value) onCommit(v);
      }}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish();
      }}
    />
  );
}
