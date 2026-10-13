import { promises as fs } from 'node:fs';
import sharp from 'sharp';
import type { Reference } from '../../src/core/domain/types';
import type {
  ImageInputRequest,
  PreparedImage,
  PreparedInputs,
  PreparedSourceInput,
  SourceInputRequest,
} from '../../src/shared/ipc';
import { atomicWrite, exists, sha256 } from './fsUtils';
import {
  fitCharacterReference,
  fitImage,
  imageSize,
  integerCrop,
  maskHasGeneratePixels,
} from './Images';
import type { StoredFiles } from './StoredFiles';
import type { WorkspacePaths } from './WorkspacePaths';

/** 작업 입력(`projects/<id>/inputs/`). 큐에 넣기 전에 만들어 두는, 내용 해시 이름의 바뀌지 않는 파일이다. */
export class ProjectInputs {
  constructor(
    private readonly paths: WorkspacePaths,
    private readonly files: StoredFiles,
  ) {}

  /**
   * 레퍼런스의 현재 캔버스·마스크를 작업 폴더에 해시 이름으로 복사해 불변 입력으로 만든다.
   * 대기 중에 레퍼런스를 고쳐도 이미 등록한 작업은 원래 입력으로 생성된다.
   */
  async prepareInputs(projectId: string, reference: Reference): Promise<PreparedInputs> {
    const image = reference.image;
    if (!image) throw new Error('인페인트에 참고 이미지가 없습니다.');
    const canvas = await fs.readFile(
      await this.paths.resolveReferenceReal(reference.id, image.canvasFile),
    );
    const mask = await fs.readFile(
      await this.paths.resolveReferenceReal(reference.id, image.maskFile),
    );
    // 마스크가 비면 다시 그릴 영역이 없으므로, 요청을 보내기 전에 막는다.
    if (!(await maskHasGeneratePixels(mask)))
      throw new Error(
        '생성 영역(청록색)이 비어 있어 생성할 수 없습니다. 인페인트 편집에서 생성 영역을 칠하십시오.',
      );
    return this.writeInpaintInputs(projectId, canvas, mask);
  }

  async prepareAidInput(
    projectId: string,
    file: string,
    kind: 'character' | 'vibe',
  ): Promise<PreparedImage> {
    const picture = await fs.readFile(await this.paths.verifyReal(this.paths.pictureFile(file)));
    return this.writeInput(
      projectId,
      kind === 'character' ? await fitCharacterReference(picture) : picture,
    );
  }

  /** 자유 생성 i2i의 이미지(와 인페인팅 마스크)를 작업 폴더에 해시 이름으로 복사한다. */
  async prepareSourceInput(request: SourceInputRequest): Promise<PreparedSourceInput> {
    const read = async (file: string) =>
      fs.readFile(await this.paths.verifyReal(this.paths.sourceFile(file)));
    const canvas = await read(request.file);
    if (request.crop && !request.maskFile) {
      const size = await imageSize(canvas);
      const rect = integerCrop(request.crop.rect, size.width, size.height);
      const png = await sharp(canvas)
        .extract({ left: rect.x, top: rect.y, width: rect.width, height: rect.height })
        .resize(request.crop.width, request.crop.height, { fit: 'fill' })
        .png()
        .toBuffer();
      return this.writeInput(request.projectId, png);
    }
    if (!request.maskFile) return this.writeInput(request.projectId, canvas);
    const mask = await read(request.maskFile);
    const [canvasSize, maskSize] = await Promise.all([imageSize(canvas), imageSize(mask)]);
    if (canvasSize.width !== maskSize.width || canvasSize.height !== maskSize.height)
      throw new Error('마스크 크기가 이미지와 다릅니다. 마스크를 다시 칠하십시오.');
    if (!(await maskHasGeneratePixels(mask)))
      throw new Error('다시 그릴 영역이 비어 있습니다. 이미지에 마스크를 칠하십시오.');
    const { maskPath, maskSha256, ...image } = await this.writeInpaintInputs(
      request.projectId,
      canvas,
      mask,
    );
    return { ...image, mask: { maskPath, maskSha256 } };
  }

  private async writeInpaintInputs(
    projectId: string,
    canvas: Buffer,
    mask: Buffer,
  ): Promise<PreparedInputs> {
    const imageSha256 = sha256(canvas);
    const maskSha256 = sha256(mask);
    const imagePath = `inputs/${imageSha256}.png`;
    const maskPath = `inputs/${maskSha256}.png`;
    for (const [relative, buffer] of [
      [imagePath, canvas],
      [maskPath, mask],
    ] as const) {
      const target = await this.paths.resolveProjectReal(projectId, relative);
      if (!(await exists(target))) await atomicWrite(target, buffer);
    }
    return { imagePath, maskPath, imageSha256, maskSha256 };
  }

  /** 해시 이름으로 저장하므로 같은 입력은 한 번만 쓰고, 대기 중에 원본이 바뀌어도 작업 입력은 그대로다. */
  private async writeInput(projectId: string, png: Buffer): Promise<PreparedImage> {
    const imageSha256 = sha256(png);
    const imagePath = `inputs/${imageSha256}.png`;
    const target = await this.paths.resolveProjectReal(projectId, imagePath);
    if (!(await exists(target))) await atomicWrite(target, png);
    return { imagePath, imageSha256 };
  }

  async prepareImageInput(request: ImageInputRequest): Promise<PreparedImage> {
    const side = (value: number) => Number.isInteger(value) && value >= 64 && value <= 4096;
    if (!side(request.width) || !side(request.height))
      throw new Error('i2i 크기가 올바르지 않습니다.');
    const source = await this.files.readImageSource(request.source);
    const png = await fitImage(source, request.width, request.height, request.fit);
    return this.writeInput(request.projectId, png);
  }
}
