# 7단계: V5 Effort 토글, 다중 캐릭터와 위치

2026-10-10에 사용자가 추가했습니다. 순서는 사용자가 정합니다. Effort 토글은 작고 비용을 줄이므로 3단계 다음에
먼저 해도 됩니다.

## 7-1. V5 Full Effort 토글

[NovelAI 공지](https://journal.novelai.net/novelai-diffusion-v5-full-effort-toggle/)(2026-10-08)와 NovelAI
웹 코드(2026-10-10)에서 확인한 것:

- V5 Full과 그 인페인트에 **High**(지금까지의 방식)와 **Medium**(새 방식)이 생겼습니다. 다른 모델에는 없습니다.
- 공지 기준으로 Medium은 기본 설정에서 사용량이 약 42% 적습니다. Anlas와 Opus 무료 할당량이 모두
  해당됩니다. 품질은 내부 블라인드 테스트에서 비슷했다고 합니다.
- 웹은 토글을 **모델 ID 전환**으로 처리합니다. `nai-diffusion-5-full` ↔ `nai-diffusion-5-full-medium`,
  `nai-diffusion-5-full-inpainting` ↔ `nai-diffusion-5-full-medium-inpainting`.
- Medium에서 고정되는 값(웹의 `fixedSettings`):
  - Steps 14
  - Sampler `k_euler_ancestral`
  - UC 프리셋 Heavy
  - CFG Rescale 없음
- 공지에 따르면 Medium에서는 직접 쓴 네거티브(UC)를 쓸 수 없습니다. 대신 포지티브에 `-3::hat::`처럼 음수 강조를
  씁니다. Prompt Guidance는 바꿀 수 있습니다.

할 일:

- `GenerationSettings`에 V5 Full 전용 `effort: 'high' | 'medium'`(기본 `high`)을 둡니다. 요청할 때 모델 ID를
  바꿉니다. 이렇게 하면 저장된 모델 값은 그대로 유지됩니다.
- Medium이면 생성 설정 화면에서 Steps·Sampler·UC 프리셋·CFG Rescale을 잠그고, 고정값을 보여 줍니다.
  공통·캐릭터 네거티브에 내용이 있으면 쓰이지 않는다고 경고합니다.
- 결과 메타데이터·생성 정보에 Effort를 남기고, 가져오기에서 `-medium` 모델을 V5 Full + Medium으로 읽습니다.
- 비용 추정: Steps 14로 계산하면 되는지 확인합니다.

확인할 것(무료 범위에서 한 장씩):

- Medium에서 웹이 실제로 보내는 `negative_prompt`·`v4_negative_prompt`. 직접 쓴 네거티브를 비우는지, 캐릭터
  네거티브는 어떻게 하는지.
- Steps 14가 아닌 값을 보내면 거부하는지.
- 인페인트(Medium Inpainting)가 지금 레퍼런스 생성 요청 형식 그대로 되는지.

## 7-2. 다중 캐릭터와 위치

웹 코드에서 확인한 모델별 기능:

| 모델            | 캐릭터 수 | 위치 지정                                            |
| --------------- | --------- | ---------------------------------------------------- |
| V5 Full·Curated | 최대 32   | 한 명일 때도 지정 가능, 자유 위치(웹 코드 확인 필요) |
| V4·V4.5         | 최대 6    | 두 명 이상일 때만, 5×5 칸(A1~E5)                     |
| V3              | 없음      | 캐릭터 프롬프트를 공통 프롬프트 뒤에 합쳐 보냅니다   |

지금 구조:

- 요청은 이미 `v4_prompt.caption.char_captions` 배열과 캐릭터마다 `centers`를 보냅니다. 하지만 작업
  (`Project`)에는 캐릭터와 프롬프트 세트가 하나뿐이고, `use_coords`는 항상 `false`(AI가 위치를 정함)입니다.
- 감정 프롬프트는 "캐릭터 프롬프트 맨 끝"이나 "공통 포지티브 맨 끝"에 붙습니다.

할 일:

- 작업(과 자유 생성)에 캐릭터 목록을 둡니다. 예: `characters: Array<{ characterId, promptSetId, center? }>`.
  옛 데이터의 `characterId`·`promptSetId`는 한 명짜리 목록으로 읽습니다.
- 위치: 「AI가 정함」(`use_coords: false`)과 「직접 지정」을 고릅니다. V4·V4.5는 5×5 칸에서 고르고, V5는
  캔버스 위를 눌러 자유롭게 고릅니다. 모델이 바뀌면 칸에 맞춰 반올림합니다.
- 모델의 최대 캐릭터 수를 넘으면 생성을 막습니다.

사용자가 정한 것(2026-10-10):

- 감정 모드에서는 **캐릭터마다 감정 프롬프트를 따로** 붙입니다. 감정 하나에 캐릭터별 프롬프트 칸을 두고,
  비어 있으면 그 캐릭터에는 감정을 붙이지 않습니다(형태는 구현할 때 정합니다).
- 레퍼런스 생성(인페인트)에서도 여러 캐릭터를 쓸 수 있게 합니다. 참고 이미지는 한 장이라 첫 캐릭터만
  참고가 된다고 화면에 알립니다.
- 여러 명일 때 결과 파일 이름의 `{character}`는 이름을 이어 붙입니다(예: `아리아+리나`).

## 결과

### 7-1 (2026-10-12)

- `GenerationSettings.effort`(기본 `high`). V5 Full에서만 쓰고, Medium이면 요청할 때만 `-medium` 모델 ID로
  보냅니다(`requestModelId`). 저장된 모델·Steps 등은 그대로이고, 작업을 만들 때
  `effectiveGenerationSettings`가 고정값(Steps 14, `k_euler_ancestral`, UC Heavy, CFG Rescale 0)을 덮어씁니다.
  비용 계산·미리보기도 같은 함수를 씁니다.
- 네거티브: 웹은 Medium이면 `uc`를 UC 프리셋 문구로만 다시 만들고(포지티브에 nsfw가 없으면 `nsfw, ` 포함)
  캐릭터 네거티브를 모두 비웁니다. 앱도 같게 했습니다. 편집기·프롬프트 패널의 네거티브 칸에 "Medium에서는
  쓰이지 않음"을 표시합니다.
- 웹은 Effort를 바꿀 때 Steps·Sampler·Noise Schedule·UC 프리셋·CFG Rescale을 모델별로 따로 기억합니다. 앱은
  값을 덮어쓰지 않고 잠가서 보여 주므로 High로 돌리면 원래 값이 그대로입니다.
- 실측(무료 범위 3장, Anlas·V5 할당량 변화 없음, `ForTest/stage7-effort/`):
  - Medium 생성·인페인트 모두 지금 요청 형식 그대로 됩니다(`-medium-inpainting`).
  - Steps 28을 보내도 거부하지 않고 서버가 14로 바꿔 생성합니다(메타데이터 steps 14).
  - Source 라벨은 Medium도 "NovelAI Diffusion V5 <해시>"입니다. V5 해시: Full 생성 `0ADF9AB7`, Full 인페인트
    `657484A5`, Medium 생성 `70AB5786`, Medium 인페인트 `93F4BD30`, Curated `DB276663`. 가져오기는 이 해시로
    모델·Effort를 알아봅니다(전에는 V5 Curated 이미지를 Full로 읽었습니다).
- V5 Curated 인페인트: 웹 코드에 `nai-diffusion-5-curated-inpainting`이 있지만 서버는 "model doesn't exist"(400)로
  거부합니다(2026-10-12). 웹도 아직 V4.5 Curated 인페인트로 보냅니다. 열리면 `NaiModels`의
  `requestIds.inpaint`만 넣으면 됩니다.
- 비용: 유료 크기에서 Steps 14로 계산하는 것이 맞는지는 확인하지 않았습니다(유료 호출 필요).

### 7-2 (2026-10-12, 사용자 확인 전)

- 데이터: `Project`·`FreeGeneration`에 `characters: CharacterSlot[]`(`characterId`, `promptSetId`, `center?`)와
  `positionMode: 'ai' | 'manual'`. 옛 `characterId`·`promptSetId`는 스키마에서 한 명짜리 목록으로 읽습니다
  (`readSingleCharacter`). 백업 다시 매핑, 항목 지우기·대체, 프롬프트 세트 고치기, 이미지 가져오기도 목록을
  다룹니다.
- 씬: `Emotion.prompt`는 첫 캐릭터 칸(생성 설정의 씬 프롬프트 위치를 따름), `extraPrompts[i]`는 i+2번째 캐릭터
  칸(그 캐릭터 프롬프트 끝)입니다. 사용자 결정대로 **순서 기준**이고, 빈 칸은 붙이지 않습니다. 어느 칸이든
  있으면 생성 대상입니다(`hasScenePrompt`).
- 작업: 첫 캐릭터는 지금처럼 `characterPrompt`, 두 번째부터는 `extraCharacters`(이름·최종 프롬프트·네거티브),
  직접 지정한 위치는 `characterCenters`. reference inset은 첫 캐릭터 쪽에만 붙고, 파일 이름의 `{character}`·
  `promptSetName`은 `+`로 잇습니다. 모델의 최대 인원(웹의 `maxCharacters`: V5 32, V4·V4.5 6)을 넘으면 작업을
  만들지 않습니다. V3은 모든 캐릭터 프롬프트를 공통 뒤에 합칩니다(인원 제한은 6으로 둠).
- 위치(웹 코드 2026-10-12): V4·V4.5는 0.1·0.3·0.5·0.7·0.9의 5×5 칸이고 두 명부터(`canPositionOneCharacter`
  false), V5는 한 명부터 자유 위치(0.001 단위)입니다. 새 캐릭터는 웹처럼 가운데 줄(0.5 → 0.3 → 0.7 → 0.1 → 0.9)
  부터 채웁니다. AI가 정하면 `use_coords: false`에 가운데 값을 넣어 보냅니다. V5에서 정한 자유 위치는 V4로
  바꾸면 보여 줄 때와 보낼 때 칸에 맞춥니다(저장 값은 그대로).
- 화면: 구성 막대의 캐릭터 칩(＋ 캐릭터, ←, ×)과 위치 칩·캐릭터 위치 창, 프롬프트 패널의 캐릭터별 칸(인페인트면
  "참고 이미지는 첫 캐릭터만 참고가 됩니다"), 씬 상세의 캐릭터별 씬 프롬프트 칸, 라이브러리 씬 모음 편집기의
  ＋(다음 캐릭터 칸). 최종 요청 미리보기·생성 정보도 캐릭터를 모두 보여 줍니다.
- 가져오기: 캐릭터 고르기에 「모든 캐릭터」(캐릭터마다 새로 만들어 순서대로 작업에 넣음). 이미지가
  `use_coords`면 위치도 옮깁니다. 이 앱의 보조 메타데이터에도 두 번째 캐릭터부터를 남깁니다.
- 실측(무료 범위 2장, `ForTest/stage7-characters/`): 1216×832, 두 캐릭터를 좌우로 지정.
  - V5: 지정한 대로 왼쪽·오른쪽에 나뉘고 표정·옷도 캐릭터마다 따로 들어갔습니다.
  - V4.5(A3·E3): 오른쪽 캐릭터는 맞았고 왼쪽 캐릭터는 가운데에 크게 나왔습니다. 요청은 받아들여집니다.
- 사용자가 확인할 것: 실제 작업에서 두 캐릭터 인페인트·일반 생성, 씬 모음의 두 번째 칸, 위치 창.
