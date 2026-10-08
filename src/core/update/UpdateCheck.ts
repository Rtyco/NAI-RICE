/** 업데이트를 확인할 GitHub 저장소 "소유자/이름". 배포는 이 저장소의 Releases로 한다. */
export const UPDATE_REPOSITORY = 'Rtyco/NAI-RICE';

/** GitHub 저장소 "소유자/이름". */
export const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export type UpdateCheckResult = {
  current: string;
  latest?: string;
  newer: boolean;
  /** 릴리스 페이지(https://github.com/...) */
  url?: string;
  /** 지금 실행 중인 형태(설치판·포터블)에 맞는 새 실행 파일 주소. */
  downloadUrl?: string;
  name?: string;
  notes?: string;
  publishedAt?: string;
  message: string;
};

/** "v1.2.3", "1.2" 같은 버전을 숫자 배열로. 숫자가 아닌 꼬리(-beta 등)는 무시한다. */
function parts(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, '')
    .split(/[.-]/)
    .map((piece) => Number.parseInt(piece, 10))
    .filter((value) => Number.isFinite(value));
}

/** a가 b보다 새 버전이면 양수, 같으면 0, 낮으면 음수. */
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

/** 릴리스 첨부 파일 중 설치판(-setup.exe)이나 포터블(-portable.exe) 주소. */
function assetUrl(payload: Record<string, unknown>, portable: boolean): string | undefined {
  const assets = Array.isArray(payload.assets) ? (payload.assets as Record<string, unknown>[]) : [];
  const suffix = portable ? '-portable.exe' : '-setup.exe';
  const asset = assets.find(
    (item) => typeof item.name === 'string' && item.name.toLowerCase().endsWith(suffix),
  );
  return isGitHubUrl(asset?.browser_download_url) ? asset.browser_download_url : undefined;
}

/** GitHub의 releases/latest 응답을 확인 결과로 바꾼다. */
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
