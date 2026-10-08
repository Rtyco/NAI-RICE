import { describe, expect, it } from 'vitest';
import { UpdateChecker } from '../../electron/services/UpdateChecker';
import {
  compareVersions,
  interpretLatestRelease,
  REPOSITORY_PATTERN,
  UPDATE_REPOSITORY,
} from '../../src/core/update/UpdateCheck';

const release = {
  tag_name: 'v1.0.0',
  html_url: 'https://github.com/me/desk/releases/tag/v1.0.0',
  name: '1.0',
  body: '변경 사항',
  assets: [
    {
      name: 'NAI.RICE-1.0.0-x64-setup.exe',
      browser_download_url: 'https://github.com/me/desk/releases/download/v1.0.0/setup.exe',
    },
    {
      name: 'NAI.RICE-1.0.0-x64-portable.exe',
      browser_download_url: 'https://github.com/me/desk/releases/download/v1.0.0/portable.exe',
    },
    { name: 'SHA256SUMS.txt', browser_download_url: 'https://github.com/me/desk/sums' },
  ],
};

describe('update check', () => {
  it('버전을 숫자로 비교해', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
    expect(compareVersions('v1.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.9.0', '0.9.1')).toBeLessThan(0);
    expect(compareVersions('0.17.10', '0.17.3')).toBeGreaterThan(0);
  });

  it('GitHub 최신 릴리스 응답을 해석해', () => {
    expect(interpretLatestRelease(release, '0.9.0')).toMatchObject({
      latest: '1.0.0',
      newer: true,
      url: 'https://github.com/me/desk/releases/tag/v1.0.0',
      downloadUrl: 'https://github.com/me/desk/releases/download/v1.0.0/setup.exe',
    });
    expect(
      interpretLatestRelease({ tag_name: '0.9.0', html_url: 'https://evil.example/' }, '0.9.0'),
    ).toMatchObject({ newer: false, url: undefined });
  });

  it('포터블이면 포터블 파일을, GitHub 밖 주소는 버려', () => {
    expect(interpretLatestRelease(release, '0.9.0', true).downloadUrl).toBe(
      'https://github.com/me/desk/releases/download/v1.0.0/portable.exe',
    );
    const outside = {
      ...release,
      assets: [{ name: 'x-setup.exe', browser_download_url: 'https://evil.example/setup.exe' }],
    };
    expect(interpretLatestRelease(outside, '0.9.0').downloadUrl).toBeUndefined();
  });

  it('저장소 이름 형식만 허용해', () => {
    expect(REPOSITORY_PATTERN.test(UPDATE_REPOSITORY)).toBe(true);
    expect(REPOSITORY_PATTERN.test('https://github.com/a/b')).toBe(false);
    expect(REPOSITORY_PATTERN.test('a/b/../c')).toBe(false);
  });
});

describe('UpdateChecker', () => {
  it('정해진 저장소의 최신 릴리스를 묻고, 404는 비공개·릴리스 없음으로 알려', async () => {
    const urls: string[] = [];
    const checker = new UpdateChecker('0.16.0', async (url) => {
      urls.push(url);
      return new Response('', { status: 404 });
    });
    expect(await checker.check()).toMatchObject({ newer: false, current: '0.16.0' });
    expect(urls).toEqual([`https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`]);
  });

  it('새 버전과 포터블 파일을 찾아', async () => {
    const checker = new UpdateChecker(
      '0.9.0',
      async () => new Response(JSON.stringify(release), { status: 200 }),
      true,
    );
    expect(await checker.check()).toMatchObject({
      newer: true,
      latest: '1.0.0',
      downloadUrl: 'https://github.com/me/desk/releases/download/v1.0.0/portable.exe',
    });
  });

  it('연결 실패와 서버 오류를 알려', async () => {
    const offline = new UpdateChecker('0.9.0', async () => {
      throw new Error('offline');
    });
    await expect(offline.check()).rejects.toThrow('인터넷 연결');
    const broken = new UpdateChecker('0.9.0', async () => new Response('', { status: 500 }));
    await expect(broken.check()).rejects.toThrow('500');
  });
});
