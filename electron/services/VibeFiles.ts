import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { Picture, Vibe } from '../../src/core/domain/types';
import { sanitizeFilenameStem } from '../../src/core/output/OutputFilename';
import { parseVibeCacheName, vibeCacheName } from '../../src/core/providers/NovelAIRequestBuilder';
import {
  buildVibeBundle,
  buildVibeDocument,
  documentEncodings,
  parseVibeFile,
  type MetadataVibe,
  type VibeEncoding,
} from '../../src/core/vibes/VibeFile';
import type { ImportedVibe, VibeEncodingInfo } from '../../src/shared/ipc';
import { atomicWrite, sha256 } from './fsUtils';
import type { FileDialogs } from './ports';

/** 바이브 파일이 읽고 쓰는 작업 폴더. Library가 구현한다. */
export interface VibeLibrary {
  readonly root: string;
  addPicture(dataUrl: string): Promise<Omit<Picture, 'name'>>;
  readPicture(file: string): Promise<Buffer>;
  readVibe(key: string): Promise<Buffer | undefined>;
  writeVibe(key: string, data: Buffer): Promise<void>;
  /** 이 owner로 저장한 인코딩 결과 이름들. */
  vibeNames(owner: string): Promise<string[]>;
}

const textSha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/**
 * NovelAI 바이브 파일(`.naiv4vibe`·`.naiv4vibeBundle`) 가져오기·내보내기. 인코딩 결과는 생성 큐가 쓰는
 * `vibes/` 캐시에 넣어, 가져온 모델·정보 추출 값이면 인코딩 비용 없이 바로 쓴다.
 */
export class VibeFiles {
  constructor(
    private readonly library: VibeLibrary,
    private readonly dialog: FileDialogs,
  ) {}

  /** 그림 바이브의 인코딩 이름 앞부분. 작업 입력은 그림을 그대로 복사하므로 큐가 쓰는 그림 해시와 같다. */
  private async owner(vibe: Pick<Vibe, 'image' | 'encodingId'>): Promise<string | undefined> {
    if (vibe.encodingId) return vibe.encodingId;
    return vibe.image ? sha256(await this.library.readPicture(vibe.image.file)) : undefined;
  }

  private async store(owner: string, encodings: VibeEncoding[]): Promise<void> {
    for (const item of encodings)
      await this.library.writeVibe(
        vibeCacheName(owner, item.model, item.informationExtracted),
        Buffer.from(item.encoding, 'base64'),
      );
  }

  /** 원본이 없는 바이브의 보기용 그림. 썸네일이 없으면 인코딩 이름으로 색을 정한 빈 그림을 만든다. */
  private async standIn(encodingId: string, thumbnail?: string | null) {
    if (thumbnail?.startsWith('data:image/'))
      return this.library.addPicture(thumbnail).catch(() => this.plain(encodingId));
    return this.plain(encodingId);
  }

  private async plain(encodingId: string) {
    const [r, g, b] = [0, 2, 4].map((at) => 40 + (parseInt(encodingId.slice(at, at + 2), 16) % 80));
    const png = await sharp({
      create: { width: 256, height: 256, channels: 3, background: { r, g, b } },
    })
      .png()
      .toBuffer();
    return this.library.addPicture(`data:image/png;base64,${png.toString('base64')}`);
  }

  /** 바이브 파일이나 묶음을 읽어 그림과 인코딩 결과를 저장한다. 라이브러리 항목은 화면이 만든다. */
  async importText(text: string, fallbackName: string): Promise<ImportedVibe[]> {
    const documents = parseVibeFile(text);
    const imported: ImportedVibe[] = [];
    for (const [index, document] of documents.entries()) {
      const encodings = documentEncodings(document);
      const name =
        document.name?.trim() ||
        (documents.length > 1 ? `${fallbackName} ${index + 1}` : fallbackName);
      const strength = document.importInfo?.strength ?? 0.6;
      if (document.type === 'image' && document.image) {
        const picture = await this.library.addPicture(`data:image/png;base64,${document.image}`);
        await this.store(sha256(await this.library.readPicture(picture.file)), encodings);
        imported.push({
          name,
          picture,
          strength,
          informationExtracted:
            document.importInfo?.information_extracted ?? encodings[0]?.informationExtracted ?? 1,
        });
        continue;
      }
      if (!encodings.length) continue;
      const encodingId = /^[0-9a-f]{64}$/.test(document.id)
        ? document.id
        : textSha256(encodings[0].encoding);
      await this.store(encodingId, encodings);
      imported.push({
        name,
        picture: await this.standIn(encodingId, document.thumbnail),
        strength,
        informationExtracted: encodings[0].informationExtracted,
        encodingId,
      });
    }
    if (!imported.length)
      throw new Error('가져올 수 있는 바이브가 없습니다. V4·V4.5 인코딩이나 원본 그림이 없습니다.');
    return imported;
  }

  /**
   * NovelAI 이미지의 생성 정보에 든 바이브. 인코딩은 그 이미지의 모델(`model`, 일반 생성 ID)로 저장하고,
   * 그림이 든 바이브는 일반 바이브로 만든다(쓸 때 다시 인코딩한다).
   */
  async importMetadata(request: {
    model: string;
    name: string;
    vibes: MetadataVibe[];
  }): Promise<ImportedVibe[]> {
    const imported: ImportedVibe[] = [];
    for (const [index, vibe] of request.vibes.entries()) {
      const name = request.vibes.length > 1 ? `${request.name} ${index + 1}` : request.name;
      if (vibe.image) {
        imported.push({
          name,
          picture: await this.library.addPicture(`data:image/png;base64,${vibe.image}`),
          strength: vibe.strength,
          informationExtracted: vibe.informationExtracted,
        });
        continue;
      }
      if (!vibe.encoding) continue;
      const encodingId = textSha256(vibe.encoding);
      await this.store(encodingId, [
        {
          model: request.model,
          informationExtracted: vibe.informationExtracted,
          encoding: vibe.encoding,
        },
      ]);
      imported.push({
        name,
        picture: await this.standIn(encodingId),
        strength: vibe.strength,
        informationExtracted: vibe.informationExtracted,
        encodingId,
      });
    }
    return imported;
  }

  /** 이 바이브로 저장해 둔 인코딩 결과(모델·정보 추출 값). */
  async encodings(vibe: Pick<Vibe, 'image' | 'encodingId'>): Promise<VibeEncodingInfo[]> {
    const owner = await this.owner(vibe).catch(() => undefined);
    if (!owner) return [];
    return (await this.library.vibeNames(owner)).flatMap(
      (name) => parseVibeCacheName(name, owner) ?? [],
    );
  }

  private async document(vibe: Vibe) {
    const owner = await this.owner(vibe);
    const encodings: VibeEncoding[] = [];
    for (const info of owner ? await this.encodings(vibe) : []) {
      const data = await this.library.readVibe(
        vibeCacheName(owner!, info.model, info.informationExtracted),
      );
      if (data) encodings.push({ ...info, encoding: data.toString('base64') });
    }
    const png =
      vibe.image && !vibe.encodingId ? await this.library.readPicture(vibe.image.file) : undefined;
    if (!png && !encodings.length) throw new Error(`바이브 「${vibe.name}」에 그림이 없습니다.`);
    const thumbnail =
      png &&
      `data:image/jpeg;base64,${(
        await sharp(png).resize(256, 256, { fit: 'inside' }).jpeg({ quality: 88 }).toBuffer()
      ).toString('base64')}`;
    return buildVibeDocument(
      {
        name: vibe.name,
        imageBase64: png?.toString('base64'),
        thumbnail,
        encodings,
        strength: vibe.strength,
        informationExtracted: vibe.informationExtracted,
        createdAt: Date.now(),
      },
      textSha256,
    );
  }

  /** 하나면 `.naiv4vibe`, 여럿이면 `.naiv4vibeBundle`로 저장할 곳을 물어 저장한다. */
  async export(vibes: Vibe[]): Promise<string | null> {
    if (!vibes.length) return null;
    const documents = [];
    for (const vibe of vibes) documents.push(await this.document(vibe));
    const bundle = documents.length > 1;
    const extension = bundle ? 'naiv4vibeBundle' : 'naiv4vibe';
    const exportsDir = path.join(this.library.root, 'exports');
    await fs.mkdir(exportsDir, { recursive: true });
    const stem = sanitizeFilenameStem(bundle ? `바이브 ${documents.length}개` : vibes[0].name);
    const result = await this.dialog.showSaveDialog({
      title: '바이브 내보내기',
      defaultPath: path.join(exportsDir, `${stem}.${extension}`),
      filters: [
        { name: bundle ? 'NovelAI 바이브 묶음' : 'NovelAI 바이브', extensions: [extension] },
      ],
    });
    if (result.canceled || !result.filePath) return null;
    await atomicWrite(
      result.filePath,
      `${JSON.stringify(bundle ? buildVibeBundle(documents) : documents[0], null, 2)}\n`,
    );
    return result.filePath;
  }
}
