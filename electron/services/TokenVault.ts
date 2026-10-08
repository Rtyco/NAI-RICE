import { safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export type TokenVaultStatus = {
  stored: boolean;
  secureStorageAvailable: boolean;
};

export class TokenVault {
  private readonly filePath: string;

  constructor(userDataDirectory: string) {
    this.filePath = path.join(userDataDirectory, 'novelai-token.vault');
  }

  status(): TokenVaultStatus {
    return {
      stored: false,
      secureStorageAvailable: safeStorage.isEncryptionAvailable(),
    };
  }

  async getStatus(): Promise<TokenVaultStatus> {
    const base = this.status();
    try {
      await fs.access(this.filePath);
      return { ...base, stored: true };
    } catch {
      return base;
    }
  }

  async save(token: string): Promise<void> {
    const normalized = token.trim();
    if (!normalized) throw new Error('NovelAI 토큰을 입력하십시오.');
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('운영체제 보안 저장소를 사용할 수 없어 토큰을 저장하지 않았습니다.');
    }
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const encrypted = safeStorage.encryptString(normalized);
    await fs.writeFile(this.filePath, encrypted.toString('base64'), {
      encoding: 'utf8',
      mode: 0o600,
    });
  }

  async read(): Promise<string> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('운영체제 보안 저장소를 사용할 수 없습니다.');
    }
    try {
      const encoded = await fs.readFile(this.filePath, 'utf8');
      return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('저장된 NovelAI 토큰이 없습니다.');
      }
      throw error;
    }
  }

  async remove(): Promise<void> {
    await fs.rm(this.filePath, { force: true });
  }
}
