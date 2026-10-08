export type NaiErrorKind =
  | 'auth'
  | 'quota'
  | 'rate-limit'
  | 'prompt-limit'
  | 'unsupported-request'
  | 'server'
  | 'network'
  | 'cancelled';

function apiMessage(rawBody: string): string {
  const text = rawBody.trim();
  if (!text) return '';
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const error = json.error as Record<string, unknown> | string | undefined;
    const value =
      json.message ?? (typeof error === 'object' ? error?.message : error) ?? json.detail;
    return typeof value === 'string' ? value : text;
  } catch {
    return text;
  }
}

export function classifyNaiError(status: number, detail: string): NaiErrorKind {
  const lower = detail.toLowerCase();
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate-limit';
  if (/anlas|quota|balance|subscription|shared.?trial|usage|credit/.test(lower)) return 'quota';
  if (/token|context length|prompt.{0,20}(long|length|limit)/.test(lower)) {
    return 'prompt-limit';
  }
  if ([400, 404, 405, 409, 415, 422].includes(status)) return 'unsupported-request';
  return status >= 500 ? 'server' : 'network';
}

const LABELS: Record<NaiErrorKind, string> = {
  auth: '인증 오류',
  quota: 'Anlas 또는 할당량 오류',
  'rate-limit': '요청 제한',
  'prompt-limit': '프롬프트 길이 오류',
  'unsupported-request': '지원되지 않는 요청',
  server: 'NovelAI 서버 오류',
  network: '네트워크 오류',
  cancelled: '작업 취소',
};

export class NaiApiError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly kind: NaiErrorKind,
    message: string,
    readonly status = 0,
    readonly correlationId?: string,
  ) {
    const requestId = correlationId ? ` (요청 ID: ${correlationId})` : '';
    super(`${LABELS[kind]}${status ? ` [${status}]` : ''}: ${message}${requestId}`);
    this.name = 'NaiApiError';
    this.retryable = kind === 'rate-limit' || kind === 'server' || kind === 'network';
  }
}

export function naiHttpError(status: number, body: string, correlationId?: string): NaiApiError {
  const detail = apiMessage(body) || '서버가 오류 세부 정보를 제공하지 않았습니다.';
  return new NaiApiError(classifyNaiError(status, detail), detail, status, correlationId);
}

export function naiNetworkError(error: unknown): NaiApiError {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new NaiApiError('cancelled', '사용자 요청 또는 제한 시간에 따라 중단되었습니다.');
  }
  const detail = error instanceof Error ? error.message : String(error);
  return new NaiApiError('network', detail || 'NovelAI 서버에 연결할 수 없습니다.');
}
