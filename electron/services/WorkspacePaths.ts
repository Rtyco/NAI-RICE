import path from 'node:path';
import type { GenerationKind } from '../../src/core/domain/types';
import { KIND_FOLDERS, sanitizeFilenameStem } from '../../src/core/output/OutputFilename';
import { FOLDER_ID } from '../../src/core/validation/schemas';
import { assertRealInside, resolveInside, toPosix } from './fsUtils';

/**
 * NAI RICE/
 *   library.json
 *   backups/                     library.json 자동 백업
 *   references/<id>/             원본·캔버스·마스크
 *   sources/                     자유 인페인팅 이미지·마스크
 *   pictures/                    캐릭터 레퍼런스·바이브 그림(내용 해시 이름)
 *   vibes/                       바이브 인코딩 캐시
 *   projects/<id>/               generations.json, inputs/, outputs/, thumbs/, diagnostic/
 *   exports/
 */
export class WorkspacePaths {
  constructor(readonly root: string) {}

  referenceDir(id: string): string {
    if (!FOLDER_ID.test(id)) throw new Error('잘못된 인페인트 ID입니다.');
    return resolveInside(path.join(this.root, 'references'), id);
  }

  projectDir(id: string): string {
    if (!FOLDER_ID.test(id)) throw new Error('잘못된 작업 ID입니다.');
    return resolveInside(path.join(this.root, 'projects'), id);
  }

  resolveProject(projectId: string, relative: string): string {
    return resolveInside(this.projectDir(projectId), relative);
  }

  resolveReference(referenceId: string, relative: string): string {
    return resolveInside(this.referenceDir(referenceId), relative);
  }

  resolveMedia(relative: string): string {
    return resolveInside(this.root, relative);
  }

  /** 링크·정션을 따라가도 작업 폴더 안인지 확인한다. 읽기·삭제 직전에 쓴다. */
  async verifyReal(absolute: string): Promise<string> {
    await assertRealInside(this.root, absolute);
    return absolute;
  }

  resolveProjectReal(projectId: string, relative: string): Promise<string> {
    return this.verifyReal(this.resolveProject(projectId, relative));
  }

  resolveReferenceReal(referenceId: string, relative: string): Promise<string> {
    return this.verifyReal(this.resolveReference(referenceId, relative));
  }

  pictureFile(file: string): string {
    return resolveInside(path.join(this.root, 'pictures'), file);
  }

  sourceFile(file: string): string {
    return resolveInside(path.join(this.root, 'sources'), file);
  }

  /** 작업과 상관없이 다시 쓰므로 작업 폴더 밖에 둔다. */
  vibeFile(key: string): string {
    return resolveInside(path.join(this.root, 'vibes'), `${key}.bin`);
  }

  /** 감정 이름이 바뀌면 이후 결과는 새 이름 폴더에 간다. */
  emotionOutputDir(projectId: string, kind: GenerationKind, folder: string): string {
    return path.join(
      this.projectDir(projectId),
      'outputs',
      KIND_FOLDERS[kind],
      sanitizeFilenameStem(folder),
    );
  }

  toProjectRelative(projectId: string, absolute: string): string {
    return toPosix(path.relative(this.projectDir(projectId), absolute));
  }
}
