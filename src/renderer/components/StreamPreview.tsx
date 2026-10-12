import { useStore } from '../store';

export function StreamPreview({ jobIds, className }: { jobIds: string[]; className?: string }) {
  const preview = useStore((state) => jobIds.map((id) => state.previews[id]).find(Boolean));
  if (!preview) return null;
  const percent = Math.min(100, Math.round(((preview.step + 1) / preview.steps) * 100));
  return (
    <span className={`stream-preview ${className ?? ''}`} title={`생성 중 ${percent}%`}>
      <img src={preview.dataUrl} alt="" draggable={false} />
      <span className="stream-progress">
        <span style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
}
