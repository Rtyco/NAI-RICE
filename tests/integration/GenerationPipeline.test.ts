import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { GenerationQueue } from '../../electron/services/GenerationQueue';
import { Library } from '../../electron/services/Library';
import { WorkspaceShell } from '../../electron/services/WorkspaceShell';
import type { GenerationRecord, QueueView, Reference } from '../../src/core/domain/types';
import { buildFreeJobs, buildJobs, buildResultAugmentJobs } from '../../src/core/jobs/JobBuilder';
import { interpretMetadata } from '../../src/core/metadata/NaiMetadata';
import { insertPngChunks, makeITextChunk } from '../../src/core/metadata/PngChunks';
import { readImageText } from '../../src/core/metadata/WebpMetadata';
import {
  createCharacter,
  createEmotion,
  createPreset,
  FREE_PROJECT_ID,
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
      maskDataUrl: dataUrl(await png(256, 128, '#ffffff')),
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
        requests.push(request.job);
        requestTimes.push(Date.now());
        return [generated];
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
      // 조회할 때마다 1씩 줄어, 생성 전후 차이(차감량)는 1이 된다.
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
      characters: [{ name: character.name, promptSet }],
      emotionSet,
      reference,
      emotionIds: [emotionSet.emotions[0].id],
      input,
      settings: { ...DEFAULT_SETTINGS, outputFilenameTemplate: '{character}__{emotion}__{seed}' },
      seedOverride: 42,
      variantsOverride: 2,
    });
    await queue.enqueue(jobs, [0, 0]);
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
    // 화면의 큐 항목은 예상값과 실제 차감량을 함께 받는다.
    expect(snapshot?.jobs[0]).toMatchObject({ anlasEstimate: 0, anlasSpent: 1 });

    const record = records[0];
    // 기본 저장 형식은 WebP 무손실이고, 메타데이터는 XMP에 들어간다.
    expect(record.file).toBe('outputs/인페인트/기쁨/아리아__기쁨__42.webp');
    expect(record).toMatchObject({
      projectId: project.id,
      width: 128,
      height: 128,
      emotionPrompt: 'smile',
      referenceName: '레퍼런스',
    });

    const output = await readFile(library.resolveProject(project.id, record.file));
    const parsed = interpretMetadata(readImageText(output));
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
      maskDataUrl: dataUrl(await png(64, 64, '#c0c0c0')),
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

  it('일반 생성 결과는 자르지 않고 그대로 저장하고 기록에 종류를 남겨', async () => {
    const { root, library } = await setupLibrary();
    const generated = await png(256, 128, '#00ff00');
    const records: GenerationRecord[] = [];
    const sent: Array<{ image?: Buffer; mask?: Buffer }> = [];
    const queue = new GenerationQueue({
      persistencePath: path.join(root, 'queue.json'),
      library,
      provider: {
        generate: async (request) => {
          sent.push({ image: request.image, mask: request.mask });
          return [generated];
        },
      },
      token: async () => 'token',
      emit: () => undefined,
      onRecord: (record) => records.push(record),
      requestDelayMs: () => 0,
    });
    await queue.initialize();
    const preset = createPreset('P', { commonPositive: '1girl', commonNegative: '' });
    await queue.enqueue(
      [
        {
          kind: 'txt2img',
          id: 'text-1',
          createdAt: new Date().toISOString(),
          projectId: 'project-a',
          projectName: '작업',
          characterName: '아리아',
          emotionId: 'e1',
          emotionName: '기쁨',
          emotionPrompt: 'smile',
          presetName: preset.name,
          promptSetName: '기본',
          emotionSetName: '감정',
          referenceName: '',
          prompt: '1girl',
          negativePrompt: '',
          characterPrompt: '',
          characterNegativePrompt: '',
          source: { commonPositive: '1girl', commonNegative: '', characterPositive: '' },
          seed: 3,
          variantIndex: 1,
          canvasWidth: 256,
          canvasHeight: 128,
          outputFilenameTemplate: '',
          settings: preset.generation,
          warnings: [],
        },
      ],
      [0],
    );
    // 다른 작업이 몰려 느릴 때도 버티도록 다른 큐 테스트처럼 5초까지 기다린다.
    for (let tries = 0; tries < 250 && !records.length; tries += 1)
      await new Promise((resolve) => setTimeout(resolve, 20));

    expect(sent).toEqual([{ image: undefined, mask: undefined }]);
    expect(records[0]).toMatchObject({
      kind: 'txt2img',
      width: 256,
      height: 128,
      anlasEstimate: 0,
    });
    expect(records[0].canvasFile).toBeUndefined();
    const output = await readFile(library.resolveProject('project-a', records[0].file));
    expect(interpretMetadata(readImageText(output))?.desk?.emotion).toEqual({
      name: '기쁨',
      prompt: 'smile',
    });
    expect((await library.listGenerations('project-a'))[0].kind).toBe('txt2img');
  });

  it('자유 생성 결과는 작업과 따로 free 폴더의 날짜별 폴더에 쌓여', async () => {
    const { root, library } = await setupLibrary();
    const generated = await png(64, 64, '#0000ff');
    const records: GenerationRecord[] = [];
    const queue = new GenerationQueue({
      persistencePath: path.join(root, 'queue.json'),
      library,
      provider: { generate: async () => [generated] },
      token: async () => 'token',
      emit: () => undefined,
      onRecord: (record) => records.push(record),
      requestDelayMs: () => 0,
    });
    await queue.initialize();
    const preset = createPreset('P', { commonPositive: 'masterpiece', commonNegative: '' });
    const createdAt = new Date(2026, 9, 10, 23, 30);
    const jobs = buildFreeJobs({ preset, prompt: 'cafe', count: 1, now: () => createdAt });
    await queue.enqueue(jobs, [0]);
    for (let tries = 0; tries < 250 && !records.length; tries += 1)
      await new Promise((resolve) => setTimeout(resolve, 20));

    expect(records[0]).toMatchObject({
      projectId: FREE_PROJECT_ID,
      emotionId: '',
      emotionPrompt: 'cafe',
    });
    expect(records[0].file.startsWith('outputs/일반 생성/2026-10-10/')).toBe(true);
    expect(library.projectDir(FREE_PROJECT_ID)).toBe(path.join(root, 'projects', 'free'));
    await expect(
      readFile(library.resolveProject(FREE_PROJECT_ID, records[0].file)),
    ).resolves.toBeTruthy();
    expect(await library.listGenerations(FREE_PROJECT_ID)).toHaveLength(1);
  });

  it('배경 제거처럼 한 번에 여러 장이 오면 장마다 결과로 쌓고 Anlas는 첫 장에만 적어', async () => {
    const { root, library } = await setupLibrary();
    const records: GenerationRecord[] = [];
    const parts = await Promise.all(['#ff0000', '#00ff00', '#0000ff'].map((c) => png(64, 64, c)));
    const queue = new GenerationQueue({
      persistencePath: path.join(root, 'queue.json'),
      library,
      provider: {
        generate: async (request) =>
          request.job.kind === 'augment' ? parts : [await png(64, 64, '#ffffff')],
      },
      token: async () => 'token',
      emit: () => undefined,
      onRecord: (record) => records.push(record),
      requestDelayMs: () => 0,
    });
    await queue.initialize();
    const wait = async (count: number) => {
      for (let tries = 0; tries < 250 && records.length < count; tries += 1)
        await new Promise((resolve) => setTimeout(resolve, 20));
    };
    const preset = createPreset('P', { commonPositive: 'masterpiece', commonNegative: '' });
    await queue.enqueue(buildFreeJobs({ preset, prompt: 'cafe', count: 1 }), [0]);
    await wait(1);
    const source = await library.findGeneration(FREE_PROJECT_ID, records[0].id);
    const image = await library.prepareImageInput({
      projectId: FREE_PROJECT_ID,
      source: { kind: 'record', projectId: FREE_PROJECT_ID, generationId: source.id },
      width: 64,
      height: 64,
      fit: 'crop',
    });
    const jobs = buildResultAugmentJobs({
      record: source,
      image,
      width: 64,
      height: 64,
      tool: 'bg-removal',
      toolPrompt: '',
      defry: 0,
      projectName: '자유 생성',
      outputFilenameTemplate: '{seed}',
    });
    await queue.enqueue(jobs, [65]);
    await wait(4);

    const results = records.slice(1);
    expect(results.map((record) => record.augment)).toEqual(
      [0, 1, 2].map((part) => ({ tool: 'bg-removal', defry: 0, part, parts: 3 })),
    );
    expect(results.map((record) => record.sourceRecordId)).toEqual([
      source.id,
      source.id,
      source.id,
    ]);
    expect(results.map((record) => record.anlasEstimate)).toEqual([65, undefined, undefined]);
    expect(new Set(results.map((record) => record.file)).size).toBe(3);
    expect(results[1].file).toMatch(/__2\.\w+$/);
    expect(await library.listGenerations(FREE_PROJECT_ID)).toHaveLength(4);
  });

  it('생성 마스크가 비어 있으면 입력을 만들지 않고 막아', async () => {
    const { library } = await setupLibrary();
    const reference = makeReference(64, 64);
    await library.saveReferenceImages(reference.id, {
      canvasDataUrl: dataUrl(await png(64, 64, '#ffffff')),
      maskDataUrl: dataUrl(await png(64, 64, '#000000')),
    });
    await expect(library.prepareInputs('project-a', reference)).rejects.toThrow(
      '생성 영역(청록색)이 비어 있어',
    );
  });
});
