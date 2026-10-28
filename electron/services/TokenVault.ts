import { safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWrite } from './fsUtils';

export type TokenVaultStatus = {
  stored: boolean;
  secureStorageAvailable: boolean;
};

export type StoredAccount = { id: string; name: string };

/** 목록 순서가 다음 계정으로 바꿀 때의 순서다. */
export type StoredAccounts = { activeId?: string; accounts: StoredAccount[] };

type Cipher = Pick<typeof safeStorage, 'isEncryptionAvailable' | 'encryptString' | 'decryptString'>;

/** `token`은 운영체제 보안 저장소로 암호화한 base64 */
type VaultFile = { activeId?: string; accounts: Array<StoredAccount & { token: string }> };

function readVaultFile(text: string): VaultFile {
  const value = JSON.parse(text) as Partial<VaultFile>;
  const accounts = Array.isArray(value.accounts)
    ? value.accounts.filter(
        (account) =>
          typeof account?.id === 'string' &&
          typeof account.name === 'string' &&
          typeof account.token === 'string',
      )
    : [];
  const activeId = accounts.some((account) => account.id === value.activeId)
    ? value.activeId
    : accounts[0]?.id;
  return { activeId, accounts };
}

export class TokenVault {
  private readonly filePath: string;
  private readonly legacyPath: string;

  constructor(
    userDataDirectory: string,
    private readonly cipher: Cipher = safeStorage,
  ) {
    this.filePath = path.join(userDataDirectory, 'novelai-accounts.vault');
    this.legacyPath = path.join(userDataDirectory, 'novelai-token.vault');
  }

  status(): TokenVaultStatus {
    return {
      stored: false,
      secureStorageAvailable: this.cipher.isEncryptionAvailable(),
    };
  }

  async getStatus(): Promise<TokenVaultStatus> {
    return { ...this.status(), stored: (await this.load()).accounts.length > 0 };
  }

  private async load(): Promise<VaultFile> {
    try {
      return readVaultFile(await fs.readFile(this.filePath, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    // 1.1.4 전에는 토큰 하나를 암호문 그대로 저장했다.
    const legacy = await fs.readFile(this.legacyPath, 'utf8').catch(() => undefined);
    if (!legacy?.trim()) return { accounts: [] };
    const id = randomUUID();
    const file = { activeId: id, accounts: [{ id, name: '계정 1', token: legacy.trim() }] };
    await this.write(file);
    await fs.rm(this.legacyPath, { force: true });
    return file;
  }

  private write(file: VaultFile): Promise<void> {
    return atomicWrite(this.filePath, JSON.stringify(file));
  }

  private requireCipher(): void {
    if (!this.cipher.isEncryptionAvailable())
      throw new Error('운영체제 보안 저장소를 사용할 수 없어 토큰을 저장하지 않았습니다.');
  }

  async accounts(): Promise<StoredAccounts> {
    const { activeId, accounts } = await this.load();
    return { activeId, accounts: accounts.map(({ id, name }) => ({ id, name })) };
  }

  /** `id`가 없으면 사용 중인 계정 */
  async read(id?: string): Promise<string> {
    if (!this.cipher.isEncryptionAvailable())
      throw new Error('운영체제 보안 저장소를 사용할 수 없습니다.');
    const file = await this.load();
    const account = file.accounts.find((item) => item.id === (id ?? file.activeId));
    if (!account) throw new Error('저장된 NovelAI 토큰이 없습니다.');
    return this.cipher.decryptString(Buffer.from(account.token, 'base64'));
  }

  /** 첫 계정이면 사용 중으로 둔다. */
  async add(name: string, token: string): Promise<string> {
    const normalized = token.trim();
    if (!normalized) throw new Error('NovelAI 토큰을 입력하십시오.');
    this.requireCipher();
    const file = await this.load();
    const id = randomUUID();
    file.accounts.push({
      id,
      name: name.trim() || `계정 ${file.accounts.length + 1}`,
      token: this.cipher.encryptString(normalized).toString('base64'),
    });
    file.activeId ??= id;
    await this.write(file);
    return id;
  }

  async rename(id: string, name: string): Promise<void> {
    const file = await this.load();
    const account = file.accounts.find((item) => item.id === id);
    if (!account || !name.trim()) return;
    account.name = name.trim();
    await this.write(file);
  }

  async setActive(id: string): Promise<void> {
    const file = await this.load();
    if (!file.accounts.some((item) => item.id === id)) return;
    file.activeId = id;
    await this.write(file);
  }

  /** 사용 중인 계정을 지우면 목록의 첫 계정을 쓴다. */
  async remove(id: string): Promise<void> {
    const file = await this.load();
    file.accounts = file.accounts.filter((item) => item.id !== id);
    if (file.activeId === id) file.activeId = file.accounts[0]?.id;
    await this.write(file);
  }
}
