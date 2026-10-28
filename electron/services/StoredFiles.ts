import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { Reference } from '../../src/core/domain/types';
import type {
  BorderLineMaskRequest,
  ImageDataSource,
  ImageInputSource,
  ReferenceImages,
  ReferenceImageSave,
  ReferenceSource,
  SourceImageAdd,
  StoredSource,
} from '../../src/shared/ipc';
import {
  atomicWrite,
  decodeDataUrl,
  exists,
  extensionForMime,
  imageMime,
  sha256,
  toDataUrl,
} from './fsUtils';
import type { GenerationIndex } from './GenerationIndex';
import { findBorderLineMask, imageSize, padToMultiple } from './Images';
import type { WorkspacePaths } from './WorkspacePaths';

export type ReferenceImageWrite = Omit<ReferenceImageSave, 'referenceId'>;

/** `references/<id>/`, `pictures/`, `sources/`, `vibes/` */
export class StoredFiles {
  constructor(
    private readonly paths: WorkspacePaths,
    private readonly generations: GenerationIndex,
  ) {}

  async saveReferenceImages(
    referenceId: string,
    payload: ReferenceImageWrite,
  ): Promise<{ originalFile?: string }> {
    const directory = await this.paths.verifyReal(this.paths.referenceDir(referenceId));
    const canvas = decodeDataUrl(payload.canvasDataUrl);
    const mask = decodeDataUrl(payload.maskDataUrl);
    const writes = [
      atomicWrite(path.join(directory, 'canvas.png'), canvas.buffer),
      atomicWrite(path.join(directory, 'mask.png'), mask.buffer),
    ];
    const paintPath = path.join(directory, 'paint.png');
    if (payload.paintDataUrl)
      writes.push(atomicWrite(paintPath, decodeDataUrl(payload.paintDataUrl).buffer));
    else if (payload.paintDataUrl === null) writes.push(fs.rm(paintPath, { force: true }));
    let originalFile: string | undefined;
    if (payload.originalDataUrl) {
      const original = decodeDataUrl(payload.originalDataUrl);
      originalFile = `original${extensionForMime(original.mimeType)}`;
      for (const entry of await fs.readdir(directory).catch(() => [] as string[])) {
        if (entry.startsWith('original.') && entry !== originalFile)
          await fs.rm(path.join(directory, entry), { force: true });
      }
      writes.push(atomicWrite(path.join(directory, originalFile), original.buffer));
    }
    await Promise.all(writes);
    return { originalFile };
  }

  async readReferenceImages(reference: Reference): Promise<ReferenceImages | null> {
    const image = reference.image;
    if (!image) return null;
    const read = async (relative: string) => {
      const file = await this.paths.resolveReferenceReal(reference.id, relative);
      return toDataUrl(await fs.readFile(file), imageMime(file));
    };
    const [originalDataUrl, canvasDataUrl, maskDataUrl, paintDataUrl] = await Promise.all([
      read(image.originalFile),
      read(image.canvasFile),
      read(image.maskFile),
      // 그린 내용은 canvas.png에 합쳐져 있어 없어도 생성은 된다.
      image.paintFile ? read(image.paintFile).catch(() => undefined) : undefined,
    ]);
    return { originalDataUrl, canvasDataUrl, maskDataUrl, paintDataUrl };
  }

  async copyReferenceFiles(fromId: string, toId: string): Promise<void> {
    const from = await this.paths.verifyReal(this.paths.referenceDir(fromId));
    const to = await this.paths.verifyReal(this.paths.referenceDir(toId));
    if (await exists(from)) await fs.cp(from, to, { recursive: true });
  }

  async addPicture(dataUrl: string): Promise<{ file: string; width: number; height: number }> {
    const png = await sharp(decodeDataUrl(dataUrl).buffer).rotate().png().toBuffer();
    const { width, height } = await imageSize(png);
    const file = `${sha256(png).slice(0, 24)}.png`;
    const target = this.paths.pictureFile(file);
    if (!(await exists(target))) await atomicWrite(target, png);
    return { file, width, height };
  }

  async readPicture(file: string): Promise<Buffer> {
    return fs.readFile(await this.paths.verifyReal(this.paths.pictureFile(file)));
  }

  async readVibe(key: string): Promise<Buffer | undefined> {
    return fs.readFile(this.paths.vibeFile(key)).catch(() => undefined);
  }

  async vibeNames(owner: string): Promise<string[]> {
    const names = await fs.readdir(path.join(this.paths.root, 'vibes')).catch(() => [] as string[]);
    return names
      .filter((name) => name.startsWith(`${owner}-`) && name.endsWith('.bin'))
      .map((name) => name.slice(0, -'.bin'.length));
  }

  async writeVibe(key: string, data: Buffer): Promise<void> {
    await atomicWrite(this.paths.vibeFile(key), data);
  }

  async readImageSource(source: ImageInputSource): Promise<Buffer> {
    const record = await this.generations.find(source.projectId, source.generationId);
    return fs.readFile(await this.paths.resolveProjectReal(source.projectId, record.file));
  }

  /** 해시 이름이라 같은 내용은 한 번만 저장된다. */
  private async writeSource(png: Buffer): Promise<string> {
    const file = `${sha256(png).slice(0, 24)}.png`;
    const target = this.paths.sourceFile(file);
    if (!(await exists(target))) await atomicWrite(target, png);
    return file;
  }

  async addSourceImage(request: SourceImageAdd): Promise<StoredSource> {
    const original =
      request.kind === 'data'
        ? decodeDataUrl(request.dataUrl).buffer
        : await this.readImageSource(request);
    const { png, width, height, content } = await padToMultiple(original);
    return { file: await this.writeSource(png), width, height, outputRect: content };
  }

  async readImageDataUrl(source: ImageDataSource): Promise<string> {
    const file =
      source.kind === 'source'
        ? await this.paths.verifyReal(this.paths.sourceFile(source.file))
        : source.kind === 'picture'
          ? await this.paths.verifyReal(this.paths.pictureFile(source.file))
          : await this.paths.resolveProjectReal(
              source.projectId,
              (await this.generations.find(source.projectId, source.generationId)).file,
            );
    return toDataUrl(await fs.readFile(file), imageMime(file));
  }

  async addBorderLineMask(
    request: BorderLineMaskRequest,
  ): Promise<{ maskFile: string; lines: number } | undefined> {
    const read = async (file: string) =>
      fs.readFile(await this.paths.verifyReal(this.paths.sourceFile(file)));
    const found = await findBorderLineMask(
      await read(request.file),
      request.outputRect,
      request.marginPx,
      request.baseMaskFile ? await read(request.baseMaskFile) : undefined,
    );
    return found && { maskFile: await this.writeSource(found.mask), lines: found.lines };
  }

  async addSourceMask(dataUrl: string): Promise<string> {
    return this.writeSource(await sharp(decodeDataUrl(dataUrl).buffer).png().toBuffer());
  }

  /** 인페인트 캔버스는 이미 64 배수라 여백을 넣지 않는다. 마스크는 작업 인페인트가 보내는 그대로다. */
  async addSourceFromReference(reference: Reference): Promise<ReferenceSource> {
    const image = reference.image;
    if (!image) throw new Error('인페인트에 참고 이미지가 없습니다.');
    const read = async (relative: string) =>
      fs.readFile(await this.paths.resolveReferenceReal(reference.id, relative));
    const [canvas, mask] = await Promise.all([read(image.canvasFile), read(image.maskFile)]);
    const [size, maskSize] = await Promise.all([imageSize(canvas), imageSize(mask)]);
    if (size.width !== maskSize.width || size.height !== maskSize.height)
      throw new Error(
        '인페인트의 마스크 크기가 캔버스와 다릅니다. 인페인트 편집에서 다시 저장하십시오.',
      );
    const [file, maskFile] = await Promise.all([this.writeSource(canvas), this.writeSource(mask)]);
    return { file, maskFile, ...size, outputRect: { ...image.outputRect } };
  }

  async deleteSource(file: string): Promise<void> {
    await fs.rm(await this.paths.verifyReal(this.paths.sourceFile(file)), { force: true });
  }
}
