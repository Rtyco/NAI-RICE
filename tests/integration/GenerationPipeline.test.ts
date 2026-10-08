import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { GenerationQueue } from '../../electron/services/GenerationQueue';
import { Library } from '../../electron/services/Library';
import { WorkspaceShell } from '../../electron/services/WorkspaceShell';
import type { GenerationRecord, QueueView, Reference } from '../../src/core/domain/types';
import { buildJobs } from '../../src/core/jobs/JobBuilder';
import { interpretMetadata } from '../../src/core/metadata/NaiMetadata';
import { insertPngChunks, makeITextChunk, readPngText } from '../../src/core/metadata/PngChunks';
import {
  createCharacter,
  createEmotion,
  createPreset,
  createProject,
  createPromptSet,
  DEFAULT_LAYOUT,
  DEFAULT_SETTINGS,
} from '../../src/core/model/defaults';
import type { ImageGenerator } from '../../electron/services/ports';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function png(width: number, height: number, color: string): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: color } })
    .png()
    .toBuffer();
}

const dataUrl = (buffer: Buffer) => `data:image/png;base64,${buffer.toString('base64')}`;

function makeReference(width: number, height: number): Reference {
  return {
    id: 'ref-test',
    name: '레퍼런스',
    image: {
      originalFile: 'original.png',
      canvasFile: 'canvas.png',
      maskFile: 'mask.png',
      originalName: 'a.png',
      canvasWidth: width,
      canvasHeight: height,
      referenceRect: { x: 0, y: 0, width: width / 2, height },
      outputRect: { x: width / 2, y: 0, width: width / 2, height },
    },
    layout: { ...DEFAULT_LAYOUT, resolution: 'custom', width, height },
    maskExpansionPx: 0,
    backgroundThreshold: 16,
    updatedAt: new Date().toISOString(),
  };
}

async function setupLibrary() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'desk-'));
  temporary.push(root);
  const library = new Library(root);
  await library.load();
  return { root, library };
}

describe('generation pipeline', () => {
  it('큐가 감정 폴더에 결과를 저장하고 메타데이터·썸네일·Anlas 차감량을 남겨', async () => {
    const { root, library } = await setupLibrary();
    const reference = makeReference(256, 128);
    await library.saveReferenceImages(reference.id, {
      originalDataUrl: dataUrl(await png(64, 64, '#ff0000')),
      canvasDataUrl: dataUrl(await png(256, 128, '#ffffff')),
      maskDataUrl: dataUrl(await png(256, 128, '#000000')),
    });
    const promptSet = createPromptSet('기본', { positive: 'silver hair', negative: 'bad hands' });
    const character = createCharacter('아리아', [promptSet]);
    const emotionSet = { id: 'set', name: '감정', emotions: [createEmotion('기쁨', 'smile')] };
    const preset = createPreset('P', { commonPositive: 'masterpiece', commonNegative: 'lowres' });
    preset.generation = { ...preset.generation, qualityTags: true, ucPreset: 'heavy' };
    const project = createProject('작업', {
      presetId: preset.id,
      character,
      emotionSetId: emotionSet.id,
      referenceId: reference.id,
    });

    const requests: Array<{ prompt: string }> = [];
    const requestTimes: number[] = [];
    const generated = Buffer.from(
      insertPngChunks(await png(256, 128, '#00ff00'), [
        makeITextChunk(
          'Comment',
          JSON.stringify({ prompt: 'reference inset, masterpiece', seed: 5 }),
        ),
      ]),
    );
    const provider: ImageGenerator = {
      generate: async (request) => {
        requests.push(request);
        requestTimes.push(Date.now());
        return generated;
      },
    };
    let anlas = 100;
    const records: GenerationRecord[] = [];
    let snapshot: QueueView | undefined;
    const queue = new GenerationQueue({
      persistencePath: path.join(root, 'queue.json'),
      library,
      provider,
      token: async () => 'token',
      emit: (next) => (snapshot = next),
      onRecord: (record) => records.push(record),
      // 두 번째 조회(생성 후)에서 2 Anlas가 줄었다고 가정한다.
      anlas: async () => {
        const value = anlas;
        anlas -= 1;
        return value;
      },
      requestDelayMs: () => 250,
    });
    await queue.initialize();

    const input = await library.prepareInputs(project.id, reference);
    const jobs = buildJobs({
      project,
      preset,
      characterName: character.name,
      promptSet,
      emotionSet,
      reference,
      emotionIds: [emotionSet.emotions[0].id],
      input,
      settings: { ...DEFAULT_SETTINGS, outputFilenameTemplate: '{character}__{emotion}__{seed}' },
      seedOverride: 42,
      variantsOverride: 2,
    });
    await queue.enqueue(jobs);
    for (let tries = 0; tries < 100 && records.length < 2; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 30));
    }

    expect(requests).toHaveLength(2);
    // 설정한 요청 간격만큼 두 번째 요청이 늦게 나간다.
    expect(requestTimes[1] - requestTimes[0]).toBeGreaterThanOrEqual(240);
    expect(requests[0].prompt).toContain('very aesthetic');
    expect(records.map((record) => record.seed)).toEqual([42, 43]);
    expect(records[0].anlasSpent).toBe(1);
    expect(snapshot?.jobs.every((job) => job.status === 'completed')).toBe(true);

    const record = records[0];
    expect(record.file).toBe('outputs/기쁨/아리아__기쁨__42.png');
    expect(record).toMatchObject({
      projectId: project.id,
      width: 128,
      height: 128,
      emotionPrompt: 'smile',
      referenceName: '레퍼런스',
    });

    const output = await readFile(library.resolveProject(project.id, record.file));
    const parsed = interpretMetadata(readPngText(output));
    expect(parsed?.source).toBe('desk');
    expect(parsed?.desk?.emotion).toEqual({ name: '기쁨', prompt: 'smile' });
    // 품질 태그·UC가 섞이지 않은 원래 프롬프트와 설정을 보존한다.
    expect(parsed?.commonPositive).toBe('masterpiece');
    expect(parsed?.commonNegative).toBe('lowres');
    expect(parsed).toMatchObject({ qualityTags: true, ucPreset: 'heavy' });
    expect(parsed?.characters).toEqual([{ positive: 'silver hair', negative: 'bad hands' }]);

    await expect(
      readFile(library.resolveProject(project.id, record.thumbFile!)),
    ).resolves.toBeTruthy();
    expect(await library.listGenerations(project.id)).toHaveLength(2);
    // 지운 결과는 이미지·썸네일·진단 캔버스를 한 폴더에 모아 휴지통으로 한 번에 보낸다.
    const trashed: string[] = [];
    const workspace = new WorkspaceShell(library, {
      openPath: async () => '',
      showItemInFolder: () => undefined,
      trashItem: async (item: string) => {
        trashed.push(item);
      },
    });
    await workspace.deleteGenerations(project.id, [record.id]);
    expect(await library.listGenerations(project.id)).toHaveLength(1);
    await expect(readFile(library.resolveProject(project.id, record.file))).rejects.toThrow();
    expect(trashed).toHaveLength(1);
    expect(path.relative(library.projectDir(project.id), trashed[0]).split(path.sep)[0]).toBe(
      '.trash',
    );
    for (const relative of [record.file, record.thumbFile!, record.canvasFile!])
      await expect(readFile(path.join(trashed[0], relative))).resolves.toBeTruthy();
    // 휴지통으로 못 보낸 대기 폴더는 다음 실행 때 다시 보낸다.
    expect(await library.leftoverStaging()).toEqual(trashed);

    // 저장 공간 화면의 영구 삭제는 휴지통을 거치지 않는다.
    const [other] = await library.listGenerations(project.id);
    await workspace.deleteGenerations(project.id, [other.id], true);
    expect(trashed).toHaveLength(1);
    expect(await library.listGenerations(project.id)).toHaveLength(0);
    await expect(readFile(library.resolveProject(project.id, other.file))).rejects.toThrow();
  });

  it('레퍼런스를 고쳐도 이미 등록한 작업의 입력은 바뀌지 않아', async () => {
    const { library } = await setupLibrary();
    const reference = makeReference(64, 64);
    const canvas = dataUrl(await png(64, 64, '#ffffff'));
    await library.saveReferenceImages(reference.id, {
      canvasDataUrl: canvas,
      maskDataUrl: dataUrl(await png(64, 64, '#000000')),
    });
    const first = await library.prepareInputs('project-a', reference);
    await library.saveReferenceImages(reference.id, {
      canvasDataUrl: canvas,
      maskDataUrl: dataUrl(await png(64, 64, '#ffffff')),
    });
    const second = await library.prepareInputs('project-a', reference);
    expect(second.maskPath).not.toBe(first.maskPath);
    await expect(
      readFile(library.resolveProject('project-a', first.maskPath)),
    ).resolves.toBeTruthy();
  });
});
