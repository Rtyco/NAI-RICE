import { describe, expect, it } from 'vitest';
import { createDefaultLibrary } from '../../src/core/model/defaults';
import { librarySchema } from '../../src/core/validation/schemas';

describe('설정 읽기', () => {
  it('1.1.4 이하 설정에는 새 설정의 기본값이 들어간다', () => {
    const library = createDefaultLibrary();
    const added = [
      'anlasConfirm',
      'notifyWhenDone',
      'confirmResultDelete',
      'keepBackups',
      'keepFinishedJobs',
      'requestRetries',
      'requestTimeoutSec',
    ] as const;
    const old: Record<string, unknown> = { ...library.settings };
    for (const key of added) delete old[key];
    const parsed = librarySchema.parse({ ...library, settings: old });
    for (const key of added) expect(parsed.settings[key]).toEqual(library.settings[key]);
  });

  it('1.1.5 설정에는 알림 세부 설정이 들어가고, 알림을 껐으면 작업 표시줄 깜빡임도 꺼진다', () => {
    const library = createDefaultLibrary();
    const old: Record<string, unknown> = { ...library.settings };
    delete old.flashWhenDone;
    delete old.taskbarProgress;
    const on = librarySchema.parse({ ...library, settings: old }).settings;
    expect([on.flashWhenDone, on.taskbarProgress]).toEqual([true, true]);
    const off = librarySchema.parse({
      ...library,
      settings: { ...old, notifyWhenDone: false },
    }).settings;
    expect([off.notifyWhenDone, off.flashWhenDone, off.taskbarProgress]).toEqual([
      false,
      false,
      true,
    ]);
  });

  it('1.1.4 이하 화면 설정에는 프롬프트 글자 크기 기본값(13px)이 들어간다', () => {
    const library = createDefaultLibrary();
    const parsed = librarySchema.parse({
      ...library,
      settings: { ...library.settings, appearance: { theme: 'rose', mode: 'light' } },
    });
    expect(parsed.settings.appearance).toEqual({
      theme: 'rose',
      mode: 'light',
      promptFontSize: 13,
    });
  });
});
