import { describe, expect, it } from 'vitest';
import { exportPieceSet, mergeBundle, parseImportFile } from '../../src/core/backup/Backups';
import type { PieceSet } from '../../src/core/domain/types';
import { composeRequestPrompts } from '../../src/core/jobs/JobBuilder';
import {
  createCharacter,
  createDefaultLibrary,
  createEmotionSet,
  createPieceSet,
  createPreset,
  createProject,
  projectsUsing,
} from '../../src/core/model/defaults';
import { renamePiece, renamePieceSet } from '../../src/core/model/mutations';
import { expandPieces, pieceRefsIn } from '../../src/core/prompts/PromptPieces';

const sets: PieceSet[] = [
  createPieceSet('에셋봇', [
    { name: 'eyes', prompt: 'red eyes, slit pupils' },
    { name: 'empty', prompt: '' },
    { name: 'pose', prompt: 'standing\nsitting\nkneeling', multi: true },
    { name: 'outfit', prompt: 'school uniform, <에셋봇.eyes>' },
    { name: 'loop', prompt: '<에셋봇.loop>' },
  ]),
];

describe('expandPieces', () => {
  it('참조를 조각 내용으로 바꾸고 조각 안의 참조도 펼쳐', () => {
    expect(expandPieces('<에셋봇.eyes>, looking at viewer', sets).text).toBe(
      'red eyes, slit pupils, looking at viewer',
    );
    expect(expandPieces('<에셋봇.outfit>', sets).text).toBe(
      'school uniform, red eyes, slit pupils',
    );
  });

  it('빈 조각이 남긴 쉼표를 정리해', () => {
    expect(expandPieces('<에셋봇.empty>, looking at viewer, {{angry}}', sets).text).toBe(
      'looking at viewer, {{angry}}',
    );
    expect(expandPieces('smile, <에셋봇.empty>', sets).text).toBe('smile');
  });

  it('multi 조각의 빈 줄도 SDStudio처럼 후보야', () => {
    const optional: PieceSet[] = [
      createPieceSet('s', [{ name: 'hat', prompt: 'hat\n', multi: true }]),
    ];
    const results = new Set<string>();
    for (let seed = 0; seed < 40; seed += 1)
      results.add(expandPieces('smile, <s.hat>', optional, seed).text);
    expect([...results].sort()).toEqual(['smile', 'smile, hat']);
  });

  it('multi 조각은 seed마다 한 줄을 고르고 같은 seed면 같은 줄이야', () => {
    const picked = new Set<string>();
    for (let seed = 0; seed < 40; seed += 1) {
      const text = expandPieces('<에셋봇.pose>', sets, seed).text;
      expect(['standing', 'sitting', 'kneeling']).toContain(text);
      expect(expandPieces('<에셋봇.pose>', sets, seed).text).toBe(text);
      picked.add(text);
    }
    expect(picked.size).toBe(3);
    // 미리보기(seed 없음)는 첫 줄
    expect(expandPieces('<에셋봇.pose>', sets).text).toBe('standing');
  });

  it('없는 조각과 순환 참조는 원문으로 두고 알려', () => {
    const result = expandPieces('<에셋봇.nope>, <없는세트.eyes>, <에셋봇.loop>', sets);
    expect(result.missing).toEqual(['<에셋봇.nope>', '<없는세트.eyes>', '<에셋봇.loop>']);
    expect(result.text).toContain('<에셋봇.nope>');
  });

  it('참조가 없는 프롬프트와 가중치 문법은 그대로 둬', () => {
    const text = '1.2::artist:toi8::, {{smile}}, [blush]';
    expect(expandPieces(text, sets)).toEqual({ text, missing: [] });
    expect(pieceRefsIn('<a.b>, <a.b>, <c.d e>')).toEqual([
      { setName: 'a', pieceName: 'b' },
      { setName: 'c', pieceName: 'd e' },
    ]);
  });
});

describe('라이브러리와 함께', () => {
  function libraryWithPieces() {
    const library = createDefaultLibrary();
    const set = createPieceSet('에셋봇', [{ name: 'eyes', prompt: 'red eyes' }]);
    const character = createCharacter('아리아');
    character.promptSets[0].positive = 'girl, <에셋봇.eyes>';
    const emotions = createEmotionSet('감정', [{ name: '기쁨', prompt: '<에셋봇.eyes>, smile' }]);
    const project = createProject('작업', {
      presetId: library.presets[0].id,
      character,
      emotionSetId: emotions.id,
      referenceId: 'ref',
    });
    return {
      library: {
        ...library,
        pieceSets: [set],
        characters: [character],
        emotionSets: [emotions],
        projects: [project],
      },
      set,
    };
  }

  it('세트·조각 이름을 바꾸면 참조도 함께 바뀌어', () => {
    const { library, set } = libraryWithPieces();
    const renamed = renamePieceSet(library, set.id, '캐릭터공통');
    expect(renamed.characters[0].promptSets[0].positive).toBe('girl, <캐릭터공통.eyes>');
    expect(renamed.emotionSets[0].emotions[0].prompt).toBe('<캐릭터공통.eyes>, smile');
    const piece = renamePiece(renamed, set.id, set.pieces[0].id, '눈');
    expect(piece.characters[0].promptSets[0].positive).toBe('girl, <캐릭터공통.눈>');
  });

  it('조각을 부르는 작업을 찾아', () => {
    const { library, set } = libraryWithPieces();
    expect(projectsUsing(library, 'pieceSet', set.id).map((item) => item.name)).toEqual(['작업']);
  });

  it('최종 프롬프트에서 조각이 펼쳐지고 없는 조각을 알려', () => {
    const { library } = libraryWithPieces();
    const preset = createPreset('p', { commonPositive: 'masterpiece' });
    const prompts = composeRequestPrompts(
      preset,
      library.characters[0].promptSets[0],
      '<에셋봇.eyes>, smile',
      { sets: library.pieceSets },
    );
    expect(prompts.characterPrompt).toBe('girl, red eyes, red eyes, smile');
    expect(prompts.missingPieces).toEqual([]);
    expect(
      composeRequestPrompts(preset, { positive: '<x.y>', negative: '' }, undefined, { sets: [] })
        .missingPieces,
    ).toEqual(['<x.y>']);
  });
});

describe('SDStudio 프롬프트 조각 파일', () => {
  const file = JSON.stringify({
    name: '에셋봇 프롬프트조각',
    version: 1,
    pieces: [{ name: 'eyes', prompt: 'red eyes', multi: false }],
  });

  it('조각 파일을 가져오고 같은 형식으로 내보내', () => {
    const bundle = parseImportFile(file, '에셋봇.json', 'preset');
    expect(bundle.pieceSets).toHaveLength(1);
    expect(bundle.pieceSets[0].pieces[0]).toMatchObject({ name: 'eyes', prompt: 'red eyes' });
    expect(exportPieceSet(bundle.pieceSets[0])).toEqual(JSON.parse(file));
  });

  it('덮어쓰면 기존 세트 ID와 조각 ID를 유지해', () => {
    const library = {
      ...createDefaultLibrary(),
      pieceSets: [createPieceSet('에셋봇 프롬프트조각', [{ name: 'eyes', prompt: 'blue eyes' }])],
    };
    const old = library.pieceSets[0];
    const bundle = parseImportFile(file, 'x.json', 'preset');
    const merged = mergeBundle(library, bundle, { [bundle.pieceSets[0].id]: old.id });
    expect(merged.pieceSets).toHaveLength(1);
    expect(merged.pieceSets[0].id).toBe(old.id);
    expect(merged.pieceSets[0].pieces[0]).toMatchObject({
      id: old.pieces[0].id,
      prompt: 'red eyes',
    });
  });

  it('SDStudio 프로젝트 파일의 library에 든 조각도 함께 가져와', () => {
    const project = JSON.stringify({
      name: '80종',
      presets: { SDImageGen: [{ frontPrompt: '', backPrompt: '', uc: '' }] },
      scenes: {
        angry: {
          name: 'angry',
          slots: [[{ prompt: '<에셋봇 프롬프트조각.eyes>, {{angry}}', enabled: true }]],
        },
      },
      library: { '에셋봇 프롬프트조각': JSON.parse(file) },
    });
    const bundle = parseImportFile(project, '80종.json', 'preset');
    expect(bundle.pieceSets.map((set) => set.name)).toEqual(['에셋봇 프롬프트조각']);
    const prompt = bundle.emotionSets[0].emotions[0].prompt;
    expect(expandPieces(prompt, bundle.pieceSets).text).toBe('red eyes, {{angry}}');
  });

  it('변형이 여러 개인 장면은 조합마다 한 줄인 multi 조각이 돼', () => {
    const project = JSON.stringify({
      name: '80종',
      presets: { SDImageGen: [{ frontPrompt: '', backPrompt: '', uc: '' }] },
      scenes: {
        'shy.v2': {
          slots: [
            [
              { prompt: '<에셋봇 프롬프트조각.eyes>, blush', enabled: true },
              { prompt: 'closed eyes,\nblush', enabled: true },
              { prompt: 'off', enabled: false },
            ],
            [{ prompt: 'hands up' }],
          ],
        },
      },
      library: { '에셋봇 프롬프트조각': JSON.parse(file) },
    });
    const bundle = parseImportFile(project, '80종.json', 'preset');
    const variants = bundle.pieceSets.find((set) => set.name === '80종 변형')!;
    expect(variants.pieces[0]).toMatchObject({
      name: 'shy v2',
      multi: true,
      prompt: '<에셋봇 프롬프트조각.eyes>, blush, hands up\nclosed eyes, blush, hands up',
    });
    const prompt = bundle.emotionSets[0].emotions[0].prompt;
    expect(prompt).toBe('<80종 변형.shy v2>');
    const picked = new Set<string>();
    for (let seed = 0; seed < 20; seed += 1)
      picked.add(expandPieces(prompt, bundle.pieceSets, seed).text);
    expect([...picked].sort()).toEqual(['closed eyes, blush, hands up', 'red eyes, blush, hands up']);
  });

  it('SDStudio 옛 조각 형식도 읽어', () => {
    const legacy = JSON.stringify({
      description: '옛 조각',
      pieces: { eyes: 'red eyes', pose: 'sit\nstand' },
      multi: { pose: true },
    });
    const bundle = parseImportFile(legacy, 'old.json', 'preset');
    expect(bundle.pieceSets[0].name).toBe('옛 조각');
    expect(bundle.pieceSets[0].pieces.map(({ name, multi }) => [name, multi])).toEqual([
      ['eyes', false],
      ['pose', true],
    ]);
  });
});
