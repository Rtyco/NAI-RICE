import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPORT_FILENAME_TEMPLATE,
  DEFAULT_OUTPUT_FILENAME_TEMPLATE,
  EXPORT_FILENAME_TOKENS,
  exportFileNames,
  renderExportFilename,
  renderOutputFilename,
  validateOutputFilenameTemplate,
} from '../../src/core/output/OutputFilename';
import { exportRequestSchema } from '../../src/core/validation/schemas';

const context = {
  character: '나디아-세론티',
  emotion: 'Suspicion',
  emotionId: 'suspicion',
  variant: 1,
  seed: 1669366302,
  model: 'nai-diffusion-5-full-inpainting',
  createdAt: '2026-09-13T01:02:03.000Z',
};

describe('output filename template', () => {
  it('기본 규칙으로 기존 파일명을 그대로 만들어', () => {
    expect(renderOutputFilename(DEFAULT_OUTPUT_FILENAME_TEMPLATE, context)).toBe(
      '나디아-세론티__Suspicion__v1__1669366302',
    );
  });

  it('사용자 토큰을 치환하고 Windows 금지 문자를 정리해', () => {
    expect(
      renderOutputFilename('{date}_{character}:{emotionId}_{model}_{time}.png', context),
    ).toBe('20260913_나디아-세론티_suspicion_5-full_010203');
  });

  it('알 수 없는 토큰과 잘못 닫힌 괄호를 거부해', () => {
    expect(validateOutputFilenameTemplate('{character}_{unknown}')).toContain('{unknown}');
    expect(validateOutputFilenameTemplate('{character')).toContain('중괄호');
    expect(validateOutputFilenameTemplate('')).toContain('입력');
    expect(validateOutputFilenameTemplate('{emotion}_{seed}')).toBeNull();
  });
});

describe('export filename template', () => {
  const scene = {
    emotion: '기쁨',
    number: 3,
    total: 12,
    character: '아리아',
    project: '아리아 표정',
    seed: 42,
    model: 'nai-diffusion-4-5-full-inpainting',
    createdAt: '2026-09-13T01:02:03.000Z',
  };

  it('기본값은 씬 이름만 쓴다', () => {
    expect(renderExportFilename(DEFAULT_EXPORT_FILENAME_TEMPLATE, scene)).toBe('기쁨');
  });

  it('순서는 씬 수의 자릿수만큼 0을 채우고 확장자는 뺀다', () => {
    expect(renderExportFilename('{number}_{character}_{emotion}.webp', scene)).toBe(
      '03_아리아_기쁨',
    );
    expect(renderExportFilename('{project}-{model}-{seed}-{date}', scene)).toBe(
      '아리아 표정-4-5-full-42-20260913',
    );
  });

  it('씬 이름 속 중괄호 글자는 다시 바꾸지 않는다', () => {
    expect(renderExportFilename('{emotion}', { ...scene, emotion: '{seed}' })).toBe('{seed}');
  });

  it('내보내기 토큰으로 검사한다', () => {
    const tokens = Object.keys(EXPORT_FILENAME_TOKENS);
    expect(validateOutputFilenameTemplate('{number}_{emotion}', tokens)).toBeNull();
    expect(validateOutputFilenameTemplate('{variant}', tokens)).toContain('{variant}');
  });
});

describe('exportFileNames', () => {
  it('감정 이름을 파일 이름으로 쓰고 중복과 금지 문자를 처리해', () => {
    expect(exportFileNames(['기쁨', '슬픔?', '기쁨'], 'webp')).toEqual(['기쁨.webp', '슬픔_.webp', '기쁨_2.webp']);
  });

  it('확장자가 되는 형식은 정해진 값만 받아 고른 폴더 밖을 가리키지 못해', () => {
    const request = {
      projectId: 'aria-abcdef12',
      name: '아리아',
      items: [{ generationId: 'g1', name: '기쁨' }],
      format: 'webp',
      quality: 90,
      mode: 'folder',
    };
    expect(exportRequestSchema.parse(request)).toEqual(request);
    expect(() => exportRequestSchema.parse({ ...request, format: 'png/../../escape' })).toThrow();
    expect(() => exportRequestSchema.parse({ ...request, projectId: '../other' })).toThrow();
    expect(() => exportRequestSchema.parse({ ...request, quality: 0 })).toThrow();
  });
});
