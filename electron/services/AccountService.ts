import type { TokenStatus } from '../../src/shared/ipc';
import type { AccountChecker, TokenStore } from './ports';

const ACCOUNT_REFRESH_MS = 60_000;

/** 마지막 계정 상태를 기억해 Anlas 확인 여부를 메인 프로세스가 판단한다. */
export class AccountService {
  private last?: TokenStatus;

  constructor(
    private readonly vault: TokenStore,
    private readonly checker: AccountChecker,
    private readonly publish: (status: TokenStatus) => void,
  ) {}

  /** 조회 전이면 undefined */
  get latest(): TokenStatus | undefined {
    return this.last;
  }

  status() {
    return this.vault.getStatus();
  }

  /** 없으면 오류 */
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

  /** 유효할 때만 저장한다. */
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

  /** 토큰이 없으면 아무것도 하지 않는다. */
  async refresh(token?: string): Promise<TokenStatus | undefined> {
    const value = token ?? (await this.vault.read().catch(() => undefined));
    if (!value) return undefined;
    const status = await this.check(value);
    this.publish(status);
    return status;
  }

  /** 생성하지 않을 때도 V5 할당량 회복이 보이도록. 창이 보일 때만. */
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
