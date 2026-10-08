// release/ 의 설치·포터블 실행 파일마다 SHA-256 해시를 구해 SHA256SUMS.txt로 남긴다.
// 릴리스에 함께 올리면 받은 사람이 `certutil -hashfile <파일> SHA256`으로 비교할 수 있다.
import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const directory = path.resolve(process.argv[2] ?? 'release');
// release/ 에 이전 버전 파일이 남아 있을 수 있으므로 지금 버전의 파일만 고른다.
const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'));

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

const files = (await fs.readdir(directory))
  .filter((name) => name.endsWith('.exe') && name.includes(`-${version}-`))
  .sort();
if (!files.length) throw new Error(`${directory}에 ${version} 실행 파일이 없습니다.`);
const lines = [];
for (const name of files) lines.push(`${await hashFile(path.join(directory, name))}  ${name}`);
await fs.writeFile(path.join(directory, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
process.stdout.write(`${lines.join('\n')}\n`);
