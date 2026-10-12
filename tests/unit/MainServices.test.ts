import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AccountService } from '../../electron/services/AccountService';
import { GenerationRequests, type CostEstimate } from '../../electron/services/GenerationRequests';
import type { TokenStore, WorkspaceFolders } from '../../electron/services/ports';
import { WorkspaceShell } from '../../electron/services/WorkspaceShell';
import type {
  GenerationJobSnapshot,
  InpaintJobSnapshot,
  QueueSnapshot,
} from '../../src/core/domain/types';
import type { TokenStatus } from '../../src/shared/ipc';

function memoryVault(initial?: string): TokenStore & { value?: string } {
  return {
    value: initial,
    async getStatus() {
      return { stored: this.value !== undefined, secureStorageAvailable: true };
    },
    async read() {
      if (this.value === undefined) throw new Error('저장된 NovelAI 토큰이 없습니다.');
      return this.value;
    },
    async save(token) {
      this.value = token;
    },
    async remove() {
      this.value = undefined;
    },
  };
}

const checker = {
  validateToken: async (token: string) => ({
    valid: token === 'good',
    anlas: 10,
    v5Quota: { percent: 0, isNegative: false, timeUntilNextPercent: 0 },
  }),
};

describe('AccountService', () => {
  it('검증한 뒤 저장하고 마지막 상태를 기억해 알려', async () => {
    const vault = memoryVault();
    const published: TokenStatus[] = [];
    const account = new AccountService(vault, checker, (status) => published.push(status));
    const saved = await account.saveAndValidate('  good  ');
    expect(vault.value).toBe('  good  ');
    expect(saved).toMatchObject({ stored: true, valid: true, anlas: 10 });
    expect(account.latest?.v5Quota?.percent).toBe(0);
    await account.refresh();
    expect(published).toHaveLength(1);
    await account.remove();
    expect(account.latest).toBeUndefined();
    expect(await account.refresh()).toBeUndefined();
  });
});

describe('GenerationRequests', () => {
  const snapshot: QueueSnapshot = { paused: false, updatedAt: '', jobs: [] };
  const job = {
    kind: 'inpaint',
    id: 'j',
    createdAt: '',
    projectId: 'p1',
    projectName: '',
    characterName: '',
    emotionId: 'e',
    emotionName: '',
    emotionPrompt: '',
    presetName: '',
    promptSetName: '',
    emotionSetName: '',
    referenceName: '',
    prompt: '',
    negativePrompt: '',
    characterPrompt: '',
    characterNegativePrompt: '',
    source: { commonPositive: '', commonNegative: '', characterPositive: '' },
    seed: 1,
    variantIndex: 1,
    imagePath: 'inputs/a.png',
    maskPath: 'inputs/b.png',
    imageSha256: 'a'.repeat(64),
    maskSha256: 'b'.repeat(64),
    canvasWidth: 1216,
    canvasHeight: 832,
    outputRect: { x: 0, y: 0, width: 10, height: 10 },
    outputFilenameTemplate: '',
    keepDiagnosticCanvas: false,
    settings: {
      model: 'nai-diffusion-5-full-inpainting',
      sampler: 'k_euler',
      steps: 28,
      promptGuidance: 5,
      cfgRescale: 0,
      noiseSchedule: 'karras',
      inpaintStrength: 1,
      seedMode: 'fixed',
      variantsPerEmotion: 1,
      qualityTags: false,
      qualityLevel: 'standard',
      ucPreset: 'none',
      referenceInset: true,
      referenceInsetPosition: 'common-start',
      emotionPosition: 'character-end',
      width: 832,
      height: 1216,
      img2imgStrength: 0.4,
      img2imgNoise: 0,
      effort: 'high',
    },
    warnings: [],
  } satisfies InpaintJobSnapshot;

  function setup(latest?: TokenStatus, answer = false, cachedVibes: string[] = []) {
    const queued: GenerationJobSnapshot[][] = [];
    const queuedEstimates: (number[] | undefined)[] = [];
    const asked: string[][] = [];
    const estimates: CostEstimate[] = [];
    const requests = new GenerationRequests(
      {
        enqueue: async (jobs, anlas) => (queued.push(jobs), queuedEstimates.push(anlas), snapshot),
        getSnapshot: () => snapshot,
      },
      { latest, token: async () => 'token' },
      async (_count, warnings, estimate) => (
        asked.push(warnings),
        estimates.push(estimate),
        answer
      ),
      {
        readVibe: async (key) =>
          cachedVibes.some((cached) => key.startsWith(cached)) ? Buffer.from('V') : undefined,
      },
    );
    return { requests, queued, queuedEstimates, asked, estimates };
  }

  it('무료 기준 안이면 묻지 않고 큐에 넣어', async () => {
    const { requests, queued, queuedEstimates, asked } = setup();
    expect((await requests.enqueue({ jobs: [job] })).cancelled).toBe(false);
    expect(queued).toHaveLength(1);
    expect(queuedEstimates).toEqual([[0]]);
    expect(asked).toHaveLength(0);
  });

  it('Anlas가 들면 예상 합계와 함께 묻고, 계속하면 작업마다 예상값을 큐에 넘겨', async () => {
    const { requests, queuedEstimates, estimates } = setup(
      { stored: true, secureStorageAvailable: true, tier: 1 },
      true,
    );
    expect((await requests.enqueue({ jobs: [job, { ...job, id: 'j2' }] })).cancelled).toBe(false);
    expect(estimates).toEqual([{ paidJobs: 2, anlas: 40 }]);
    expect(queuedEstimates).toEqual([[20, 20]]);
  });

  it('렌더러가 경고를 빼도 V5 할당량 소진을 직접 판단해 확인을 받아', async () => {
    const exhausted = {
      stored: true,
      secureStorageAvailable: true,
      v5Quota: { percent: 0, isNegative: false, timeUntilNextPercent: 0 },
    };
    const { requests, queued, asked } = setup(exhausted);
    const result = await requests.enqueue({ jobs: [job], costWarnings: [] });
    expect(result.cancelled).toBe(true);
    expect(asked[0]).toHaveLength(1);
    expect(queued).toHaveLength(0);
  });

  it('처음 쓰는 바이브는 인코딩 2 Anlas를 첫 작업에만 더해 묻고, 인코딩한 적이 있으면 묻지 않아', async () => {
    const vibeJob = {
      ...job,
      settings: { ...job.settings, model: 'nai-diffusion-4-5-full-inpainting' },
      aid: {
        kind: 'vibe' as const,
        name: '노을',
        imagePath: 'inputs/v.png',
        imageSha256: 'c'.repeat(64),
        strength: 0.6,
        informationExtracted: 1,
      },
    };
    const fresh = setup(undefined, true);
    await fresh.requests.enqueue({ jobs: [vibeJob, { ...vibeJob, id: 'j2' }] });
    expect(fresh.asked[0]).toEqual([
      '바이브를 이 그림·모델로 처음 써서 인코딩에 2 Anlas가 듭니다(다음부터는 다시 씁니다).',
    ]);
    expect(fresh.queuedEstimates).toEqual([[2, 0]]);
    const cached = setup(undefined, false, ['c'.repeat(64)]);
    expect((await cached.requests.enqueue({ jobs: [vibeJob] })).cancelled).toBe(false);
    expect(cached.asked).toHaveLength(0);
  });

  it('형식이 어긋난 요청은 거부해', async () => {
    const { requests } = setup();
    await expect(requests.enqueue({ jobs: [{ ...job, projectId: '..' }] })).rejects.toThrow('형식');
    await expect(requests.enqueue(null)).rejects.toThrow('형식');
  });
});

describe('WorkspaceShell', () => {
  it('없는 폴더는 휴지통으로 보내지 않고, 있는 폴더는 실제 경로를 확인한 뒤 보내', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'rice-shell-'));
    const trashed: string[] = [];
    const verified: string[] = [];
    const folders = {
      root,
      projectDir: (id: string) => path.join(root, id),
      referenceDir: (id: string) => path.join(root, 'missing', id),
      verifyReal: async (absolute: string) => (verified.push(absolute), absolute),
    } as unknown as WorkspaceFolders;
    const shell = new WorkspaceShell(folders, {
      openPath: async () => '',
      trashItem: async (item: string) => void trashed.push(item),
      showItemInFolder: () => undefined,
    });
    await shell.trashReference('r1');
    expect(trashed).toEqual([]);
    await shell.trashProject('');
    expect(verified).toEqual([root]);
    expect(trashed).toEqual([root]);
  });
});
