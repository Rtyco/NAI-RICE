import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TokenVault } from '../../electron/services/TokenVault';

/** 뒤집기만 하는 가짜 암호. 파일에 평문이 남지 않는지 볼 수 있다. */
const cipher = {
  isEncryptionAvailable: () => true,
  encryptString: (text: string) => Buffer.from([...text].reverse().join('')),
  decryptString: (buffer: Buffer) => [...buffer.toString()].reverse().join(''),
};

let root = '';
afterEach(() => rm(root, { recursive: true, force: true }));

describe('TokenVault', () => {
  it('예전 토큰 하나는 「계정 1」로 옮겨 읽어', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'vault-'));
    await writeFile(
      path.join(root, 'novelai-token.vault'),
      cipher.encryptString('old-token').toString('base64'),
    );
    const vault = new TokenVault(root, cipher);
    const { activeId, accounts } = await vault.accounts();
    expect(accounts).toEqual([{ id: activeId, name: '계정 1' }]);
    expect(await vault.read()).toBe('old-token');
    expect((await vault.getStatus()).stored).toBe(true);
  });

  it('계정을 더하고 사용 중인 계정을 바꾸며, 지우면 첫 계정을 써', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'vault-'));
    const vault = new TokenVault(root, cipher);
    expect((await vault.getStatus()).stored).toBe(false);
    const first = await vault.add('', ' one ');
    const second = await vault.add('부계정', 'two');
    expect(await vault.accounts()).toEqual({
      activeId: first,
      accounts: [
        { id: first, name: '계정 1' },
        { id: second, name: '부계정' },
      ],
    });
    expect(await readFile(path.join(root, 'novelai-accounts.vault'), 'utf8')).not.toContain('two');
    await vault.setActive(second);
    expect(await vault.read()).toBe('two');
    await vault.rename(second, '  둘째  ');
    await vault.remove(second);
    expect(await vault.accounts()).toEqual({
      activeId: first,
      accounts: [{ id: first, name: '계정 1' }],
    });
    expect(await vault.read()).toBe('one');
  });
});
