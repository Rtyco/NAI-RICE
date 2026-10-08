import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OUTPUT_FILENAME_TEMPLATE,
  exportFileNames,
  renderOutputFilename,
  validateOutputFilenameTemplate,
} from '../../src/core/output/OutputFilename';

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

describe('exportFileNames', () => {
  it('감정 이름을 파일 이름으로 쓰고 중복과 금지 문자를 처리해', () => {
    expect(exportFileNames(['기쁨', '슬픔?', '기쁨'], 'webp')).toEqual(['기쁨.webp', '슬픔_.webp', '기쁨_2.webp']);
  });
});
