import type { TokenStatus } from '../../src/shared/ipc';
import type { AccountChecker, TokenStore } from './ports';

const ACCOUNT_REFRESH_MS = 60_000;

/**
 * NovelAI 토큰 보관과 계정 상태(Anlas·V5 할당량) 조회를 맡는다.
 * 마지막으로 조회한 상태를 기억해, Anlas 확인 여부를 렌더러가 아니라 메인 프로세스가 판단하게 한다.
 */
export class AccountService {
  private last?: TokenStatus;

  constructor(
    private readonly vault: TokenStore,
    private readonly checker: AccountChecker,
    private readonly publish: (status: TokenStatus) => void,
  ) {}

  /** 마지막으로 조회한 계정 상태. 아직 조회하지 않았으면 undefined. */
  get latest(): TokenStatus | undefined {
    return this.last;
  }

  status() {
    return this.vault.getStatus();
  }

  /** 저장된 토큰. 없으면 오류를 던진다. */
  token(): Promise<string> {
    return this.vault.read();
  }

  private async check(token: string): Promise<TokenStatus> {
    this.last = {
      ...(await this.vault.getStatus()),
      ...(await this.checker.validateToken(token)),
      checkedAt: new Date().toISOString(),
    };
    return this.last;
  }

  /** 토큰이 유효한지 먼저 확인한 뒤에만 보안 저장소에 저장한다. */
  async saveAndValidate(token: string): Promise<TokenStatus> {
    const checked = await this.check(token.trim());
    await this.vault.save(token);
    return {
      ...checked,
      ...(await this.vault.getStatus()),
      message: 'NovelAI 토큰을 확인하고 안전하게 저장했습니다.',
    };
  }

  async validateStored(): Promise<TokenStatus> {
    const checked = await this.check(await this.vault.read());
    return { ...checked, message: '저장된 NovelAI 토큰이 유효합니다.' };
  }

  async remove() {
    await this.vault.remove();
    this.last = undefined;
    return this.vault.getStatus();
  }

  /** 계정 상태를 다시 조회해 모든 창에 알린다. 토큰이 없으면 아무것도 하지 않는다. */
  async refresh(token?: string): Promise<TokenStatus | undefined> {
    const value = token ?? (await this.vault.read().catch(() => undefined));
    if (!value) return undefined;
    const status = await this.check(value);
    this.publish(status);
    return status;
  }

  /** 생성하지 않을 때도 V5 할당량이 회복되는 것이 보이도록, 창이 보일 때만 주기적으로 다시 조회한다. */
  startAutoRefresh(isVisible: () => boolean): void {
    setInterval(() => {
      if (!isVisible()) return;
      void this.vault
        .getStatus()
        .then((status) => (status.stored ? this.refresh() : undefined))
        .catch(() => undefined);
    }, ACCOUNT_REFRESH_MS);
  }
}
