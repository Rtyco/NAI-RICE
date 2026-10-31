/** 배포는 이 저장소의 Releases로 한다. */
export const UPDATE_REPOSITORY = 'Rtyco/NAI-RICE';

export const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export type UpdateCheckResult = {
  current: string;
  latest?: string;
  newer: boolean;
  url?: string;
  /** 지금 실행 중인 형태(설치판·포터블)에 맞는 파일 */
  downloadUrl?: string;
  name?: string;
  notes?: string;
  publishedAt?: string;
  message: string;
};

/** 숫자가 아닌 꼬리(-beta 등)는 무시한다. */
function parts(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, '')
    .split(/[.-]/)
    .map((piece) => Number.parseInt(piece, 10))
    .filter((value) => Number.isFinite(value));
}

/** 바뀐 점 안내 내용이 바뀐 버전. 다음 버전의 안내를 만들면 올린다. */
export const WHATS_NEW_VERSION = '1.1.5';

/** a가 새 버전이면 양수 */
export function compareVersions(a: string, b: string): number {
  const left = parts(a);
  const right = parts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

const isGitHubUrl = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('https://github.com/');

/** -setup.exe 또는 -portable.exe */
function assetUrl(payload: Record<string, unknown>, portable: boolean): string | undefined {
  const assets = Array.isArray(payload.assets) ? (payload.assets as Record<string, unknown>[]) : [];
  const suffix = portable ? '-portable.exe' : '-setup.exe';
  const asset = assets.find(
    (item) => typeof item.name === 'string' && item.name.toLowerCase().endsWith(suffix),
  );
  return isGitHubUrl(asset?.browser_download_url) ? asset.browser_download_url : undefined;
}

/** GitHub releases/latest 응답 */
export function interpretLatestRelease(
  payload: Record<string, unknown>,
  current: string,
  portable = false,
): UpdateCheckResult {
  const tag = typeof payload.tag_name === 'string' ? payload.tag_name : '';
  const url = isGitHubUrl(payload.html_url) ? payload.html_url : undefined;
  if (!tag) return { current, newer: false, url, message: '릴리스 정보에 버전이 없습니다.' };
  const latest = tag.replace(/^v/i, '');
  const newer = compareVersions(latest, current) > 0;
  return {
    current,
    latest,
    newer,
    url,
    downloadUrl: assetUrl(payload, portable),
    name: typeof payload.name === 'string' ? payload.name : undefined,
    notes: typeof payload.body === 'string' ? payload.body.slice(0, 4000) : undefined,
    publishedAt: typeof payload.published_at === 'string' ? payload.published_at : undefined,
    message: newer
      ? `새 버전 ${latest}이(가) 있습니다.`
      : `최신 버전을 사용 중입니다 (${current}).`,
  };
}
