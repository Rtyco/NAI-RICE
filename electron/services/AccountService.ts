import { hasV5Quota, needsSpareV5Quota } from '../../src/core/providers/NaiCost';
import type { AccountState, TokenStatus } from '../../src/shared/ipc';
import type { AccountChecker, TokenStore } from './ports';
import type { StoredAccounts } from './TokenVault';

const ACCOUNT_REFRESH_MS = 60_000;
/** 사용 중이 아닌 계정은 이 횟수마다 한 번 조회한다. */
const OTHERS_EVERY = 5;

type CostJob = Parameters<typeof needsSpareV5Quota>[0];

/** 계정마다 마지막 상태를 기억해 Anlas 확인과 계정 바꾸기를 메인 프로세스가 판단한다. */
export class AccountService {
  private states = new Map<string, AccountState>();
  /** 큐가 요청마다 토큰을 읽어 복호화한 값을 둔다. */
  private tokens = new Map<string, string>();
  private list: StoredAccounts = { accounts: [] };
  private secureStorageAvailable = false;
  private ticks = 0;

  constructor(
    private readonly vault: TokenStore,
    private readonly checker: AccountChecker,
    private readonly publish: (status: TokenStatus) => void,
    /** V5 할당량을 다 쓰면 다음 계정으로 바꾼다. 요청마다 읽는다. */
    private readonly rotate: () => boolean = () => false,
  ) {}

  /** 사용 중인 계정을 조회하기 전이면 undefined */
  get latest(): TokenStatus | undefined {
    const active = this.list.activeId;
    return active && this.states.has(active) ? this.compose() : undefined;
  }

  private compose(message?: string): TokenStatus {
    const { activeId, accounts } = this.list;
    const others = accounts.filter((account) => account.id !== activeId);
    return {
      stored: accounts.length > 0,
      secureStorageAvailable: this.secureStorageAvailable,
      ...(activeId ? this.states.get(activeId) : {}),
      accounts: accounts.map((account) => ({
        ...account,
        ...this.states.get(account.id),
        active: account.id === activeId,
      })),
      ...(this.rotate() && others.some((account) => hasV5Quota(this.states.get(account.id) ?? {}))
        ? { v5Spare: true }
        : {}),
      ...(message ? { message } : {}),
    };
  }

  private async load(): Promise<void> {
    this.secureStorageAvailable = (await this.vault.getStatus()).secureStorageAvailable;
    this.list = await this.vault.accounts();
    const ids = new Set(this.list.accounts.map((account) => account.id));
    for (const id of [...this.states.keys()]) if (!ids.has(id)) this.states.delete(id);
    for (const id of [...this.tokens.keys()]) if (!ids.has(id)) this.tokens.delete(id);
  }

  async status(): Promise<TokenStatus> {
    await this.load();
    return this.compose();
  }

  private async tokenOf(id: string): Promise<string> {
    const cached = this.tokens.get(id);
    if (cached) return cached;
    const token = await this.vault.read(id);
    this.tokens.set(id, token);
    return token;
  }

  /** 사용 중인 계정의 토큰. 없으면 오류 */
  async token(): Promise<string> {
    await this.load();
    if (!this.list.activeId) throw new Error('저장된 NovelAI 토큰이 없습니다.');
    return this.tokenOf(this.list.activeId);
  }

  /**
   * 사용 중인 계정에 V5 할당량이 없어 Anlas가 들 작업이면, 목록에서 그다음부터 할당량이 남은 계정을
   * 찾아 바꾼다. 한 번에 한 계정만 쓴다.
   */
  async tokenFor(job: CostJob): Promise<string> {
    await this.load();
    const { activeId, accounts } = this.list;
    const state = activeId ? this.states.get(activeId) : undefined;
    if (
      activeId &&
      state &&
      accounts.length > 1 &&
      this.rotate() &&
      needsSpareV5Quota(job, state)
    ) {
      const start = accounts.findIndex((account) => account.id === activeId);
      const order = [...accounts.slice(start + 1), ...accounts.slice(0, start)];
      for (const candidate of order) {
        const checked = await this.check(candidate.id).catch(() => undefined);
        if (!checked || !hasV5Quota(checked)) continue;
        await this.vault.setActive(candidate.id);
        await this.load();
        this.publish(this.compose());
        break;
      }
    }
    return this.token();
  }

  private async check(id: string): Promise<AccountState> {
    const state = {
      ...(await this.checker.validateToken(await this.tokenOf(id))),
      checkedAt: new Date().toISOString(),
    };
    this.states.set(id, state);
    return state;
  }

  /** 유효할 때만 저장하고, 첫 계정이면 사용 중으로 둔다. */
  async addAccount(name: string, token: string): Promise<TokenStatus> {
    const normalized = token.trim();
    const checked = await this.checker.validateToken(normalized);
    const id = await this.vault.add(name, normalized);
    this.states.set(id, { ...checked, checkedAt: new Date().toISOString() });
    await this.load();
    const status = this.compose('NovelAI 계정을 확인하고 안전하게 저장했습니다.');
    this.publish(status);
    return status;
  }

  async renameAccount(id: string, name: string): Promise<TokenStatus> {
    await this.vault.rename(id, name);
    return this.changed();
  }

  async setActive(id: string): Promise<TokenStatus> {
    await this.vault.setActive(id);
    await this.load();
    await this.check(id).catch(() => undefined);
    return this.changed();
  }

  async removeAccount(id: string): Promise<TokenStatus> {
    await this.vault.remove(id);
    return this.changed();
  }

  private async changed(): Promise<TokenStatus> {
    await this.load();
    const status = this.compose();
    this.publish(status);
    return status;
  }

  /** 모든 계정을 차례로 조회한다. */
  async validateStored(): Promise<TokenStatus> {
    await this.load();
    if (!this.list.activeId) throw new Error('저장된 NovelAI 토큰이 없습니다.');
    for (const account of this.list.accounts) await this.check(account.id);
    const status = this.compose('저장된 NovelAI 계정을 확인했습니다.');
    this.publish(status);
    return status;
  }

  /** 그 토큰의 계정을, 없으면 사용 중인 계정을 조회한다. 토큰이 없으면 아무것도 하지 않는다. */
  async refresh(token?: string): Promise<AccountState | undefined> {
    await this.load();
    const id = token
      ? [...this.tokens].find(([, value]) => value === token)?.[0]
      : this.list.activeId;
    if (!id) return token ? this.checker.validateToken(token) : undefined;
    const state = await this.check(id);
    this.publish(this.compose());
    return state;
  }

  /** 생성하지 않을 때도 V5 할당량 회복이 보이도록. 창이 보일 때만. */
  startAutoRefresh(isVisible: () => boolean): void {
    setInterval(() => {
      if (!isVisible()) return;
      const all = this.ticks++ % OTHERS_EVERY === 0;
      void this.load()
        .then(async () => {
          if (!this.list.activeId) return;
          for (const account of this.list.accounts)
            if (all || account.id === this.list.activeId)
              await this.check(account.id).catch(() => undefined);
          this.publish(this.compose());
        })
        .catch(() => undefined);
    }, ACCOUNT_REFRESH_MS);
  }
}
