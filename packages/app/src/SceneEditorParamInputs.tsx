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
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
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
