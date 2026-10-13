import { AUGMENT_STRENGTHS, EMOTION_MOODS, moodLabel } from '../../core/providers/NaiAugment';

/** 빈 값은 `emptyLabel`로 보인다. */
export function MoodSelect(props: {
  value: string;
  emptyLabel: string;
  label: string;
  onChange: (mood: string) => void;
}) {
  return (
    <select
      value={props.value}
      aria-label={props.label}
      onChange={(event) => props.onChange(event.target.value)}
    >
      <option value="">{props.emptyLabel}</option>
      {EMOTION_MOODS.map((mood) => (
        <option key={mood.id} value={mood.id}>
          {moodLabel(mood.id)}
        </option>
      ))}
    </select>
  );
}

export function StrengthSelect(props: {
  value: number;
  label: string;
  onChange: (defry: number) => void;
}) {
  return (
    <select
      value={props.value}
      aria-label={props.label}
      onChange={(event) => props.onChange(Number(event.target.value))}
    >
      {AUGMENT_STRENGTHS.map((name, index) => (
        <option key={index} value={index}>
          {name}
        </option>
      ))}
    </select>
  );
}
