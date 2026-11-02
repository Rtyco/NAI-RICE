import type { ExportPick } from '../exportPicks';
import { projectMedia } from '../store';

export function ExportPickGrid(props: {
  projectId: string;
  picks: ExportPick[];
  excluded: Set<string>;
  onExcludedChange: (excluded: Set<string>) => void;
  showCombo: boolean;
}) {
  return (
    <div className="export-grid">
      {props.picks.map(({ key, emotion, record }) => (
        <label key={key} className={`export-item ${props.excluded.has(key) ? 'off' : ''}`}>
          <input
            type="checkbox"
            checked={!props.excluded.has(key)}
            onChange={(event) => {
              const next = new Set(props.excluded);
              if (event.target.checked) next.delete(key);
              else next.add(key);
              props.onExcludedChange(next);
            }}
          />
          <img
            src={projectMedia(props.projectId, record.thumbFile ?? record.file)}
            alt=""
            loading="lazy"
          />
          <span>{emotion.name}</span>
          {props.showCombo && record.comboName && <small>{record.comboName}</small>}
        </label>
      ))}
    </div>
  );
}
