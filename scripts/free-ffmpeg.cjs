// electron-builder afterPack 훅: Electron 기본 ffmpeg.dll(H.264·AAC 등 특허 코덱 포함)을
// Electron이 같은 버전으로 따로 배포하는 무료 코덱 전용 빌드로 바꾼다. 이 프로그램은 영상·음성을 쓰지 않는다.
// 받은 파일은 같은 릴리스의 SHASUMS256.txt로 확인하고 .cache/ffmpeg/에 보관해 다음 빌드에서 다시 쓴다.
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { unzipSync } = require('fflate');

const ARCH = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64' };

async function download(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

module.exports = async function freeFfmpeg(context) {
  if (context.electronPlatformName !== 'win32') return;
  const version = require('electron/package.json').version;
  const arch = ARCH[context.arch];
  const name = `ffmpeg-v${version}-win32-${arch}.zip`;
  const base = `https://github.com/electron/electron/releases/download/v${version}`;
  const cacheDir = path.join(__dirname, '..', '.cache', 'ffmpeg');
  const cached = path.join(cacheDir, name);

  let zip = fs.existsSync(cached) ? fs.readFileSync(cached) : await download(`${base}/${name}`);
  const sums = (await download(`${base}/SHASUMS256.txt`)).toString('utf8');
  const expected = sums
    .split('\n')
    .map((line) => line.trim().split(/\s+\*?/))
    .find(([, file]) => file === name)?.[0];
  if (!expected) throw new Error(`SHASUMS256.txt에 ${name}이(가) 없습니다.`);
  const actual = createHash('sha256').update(zip).digest('hex');
  if (actual !== expected) {
    if (fs.existsSync(cached)) fs.rmSync(cached);
    throw new Error(`${name} 해시가 다릅니다. 기대 ${expected}, 실제 ${actual}`);
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cached, zip);

  const dll = unzipSync(new Uint8Array(zip))['ffmpeg.dll'];
  if (!dll) throw new Error(`${name}에 ffmpeg.dll이 없습니다.`);
  fs.writeFileSync(path.join(context.appOutDir, 'ffmpeg.dll'), dll);
  console.log(`  • ffmpeg.dll을 무료 코덱 빌드로 바꿨습니다 (${name}, ${dll.length} bytes)`);
};
