import {
  interpretLatestRelease,
  REPOSITORY_PATTERN,
  UPDATE_REPOSITORY,
  type UpdateCheckResult,
} from '../../src/core/update/UpdateCheck';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** GitHub의 최신 릴리스를 조회해 지금 버전과 비교한다. 저장소가 공개되어 있어야 한다. */
export class UpdateChecker {
  constructor(
    private readonly currentVersion: string,
    private readonly fetch: Fetch,
    /** 포터블로 실행 중이면 포터블 파일을, 아니면 설치 파일을 새 버전으로 안내한다. */
    private readonly portable = false,
    private readonly repository = UPDATE_REPOSITORY,
  ) {}

  async check(): Promise<UpdateCheckResult> {
    const current = this.currentVersion;
    const name = this.repository.trim();
    if (!REPOSITORY_PATTERN.test(name))
      throw new Error(`업데이트 저장소 이름이 잘못됐습니다: ${name}`);
    let response: Response;
    try {
      response = await this.fetch(`https://api.github.com/repos/${name}/releases/latest`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `nai-rice/${current}`,
        },
      });
    } catch {
      throw new Error('GitHub에 연결할 수 없습니다. 인터넷 연결을 확인하십시오.');
    }
    if (response.status === 404) {
      return {
        current,
        newer: false,
        message: '공개된 릴리스가 없거나 저장소가 비공개입니다.',
      };
    }
    if (!response.ok) throw new Error(`GitHub 응답 오류 (${response.status})`);
    return interpretLatestRelease(
      (await response.json()) as Record<string, unknown>,
      current,
      this.portable,
    );
  }
}
