export function formatEstimate(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return '1분 미만';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `약 ${minutes}분`;
  return rest ? `약 ${hours}시간 ${rest}분` : `약 ${hours}시간`;
}
