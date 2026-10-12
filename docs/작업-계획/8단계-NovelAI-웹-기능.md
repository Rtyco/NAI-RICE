# 8단계: NovelAI 웹에만 있던 기능 (구현, 사용자 확인 전)

2026-10-12 사용자 요청으로, NovelAI 웹에는 있고 이 앱에는 없던 기능을 넣습니다. 값과 형식은 NovelAI 문서,
NovelAI 웹 코드(2026-10-12에 받은 `image` 페이지 스크립트), 커뮤니티 구현(NekoAI-JS, ComfyUI 노드)에서
가져왔습니다. 실제 요청은 하지 않았습니다.

## 웹 코드의 모델별 기능 표

웹은 모델마다 기능 표를 둡니다. 이 앱에 관계있는 값만 옮깁니다.

| 모델 | Variety+ (`cfgDelaySigma`) | SMEA·DYN·Decrisp | 스트리밍 | 캐릭터 레퍼런스 (인페인트) | 바이브 |
| ---- | -------------------------- | ---------------- | -------- | -------------------------- | ------ |
| V3   | 19                         | 있음             | 없음     | 없음                       | 없음   |
| V4   | 19                         | 없음             | 있음     | 없음                       | 있음   |
| V4.5 | 58                         | 없음             | 있음     | 있음 (있음)                | 있음   |
| V5   | 없음                       | 없음             | 있음     | 없음                       | 없음   |

## 고급 샘플링

- **Variety+**(`GenerationSettings.variety`): 생성 설정의 샘플링 카드에서 켭니다. 요청에는
  `skip_cfg_above_sigma = 기준 sigma × √(가로×세로 ÷ 832×1216)`을 넣습니다(`varietySigma`). 식은 커뮤니티
  실측(V4.5 1280×1856에 88.877…)과 웹이 V4 1024×1024에 보낸 19.343…이 모두 맞습니다. V5는 웹에도 없어 무시합니다.
- **SMEA·SMEA DYN**(`smea`, V3 전용): `sm`·`sm_dyn`. 커뮤니티 구현처럼 일반 생성에만 넣고 i2i·인페인트에서는
  끕니다. 유료일 때 비용이 1.2배·1.4배라 예상 Anlas에 곱합니다.
- **Decrisp**(`decrisp`, V3 전용): `dynamic_thresholding`.
- 이미지에서 설정을 가져올 때 `skip_cfg_above_sigma`가 있으면 Variety+, `sm`·`sm_dyn`·`dynamic_thresholding`도
  읽습니다. 생성 정보의 모델 줄에 켠 것을 붙여 보여 줍니다.

## 캐릭터 레퍼런스(Precise Reference)의 나머지 옵션

- **세기(Strength)**: 항목마다 `CharacterReference.strength`(기본 1)를 두고 `director_reference_strength_values`에
  넣습니다. 이전에는 1로 고정했습니다.
- **값 범위(사용자 요청):** 세기·충실도와 바이브 세기를 ±10(`AID_VALUE_LIMIT`)까지 받습니다. 웹 슬라이더는 0~1이고,
  문서에 숫자를 눌러 음수도 넣을 수 있다고 되어 있습니다. 1을 넘는 값을 서버가 받는지는 실측하지 않았습니다.
- **여러 장:** 작업이 `characterReferenceIds`로 여럿 고르고, 요청의 `director_reference_*` 배열에 고른 순서로
  넣습니다. 문서대로 섞여 한 캐릭터가 되고, 비용은 레퍼런스마다 한 장에 5 Anlas로 계산합니다(여러 장 비용은
  실측하지 않음). 하나만 고르던 `characterReferenceId`와 옛 작업·기록의 `aid`(그림 하나)는 한 개짜리 목록으로
  읽습니다(세기 1).
- **인페인트와 함께:** 웹 기능 표의 `charRefInpainting`이 V4.5에 켜져 있어 인페인트 작업에서도 고를 수 있게
  했습니다.

## 바이브 파일 (`.naiv4vibe`·`.naiv4vibeBundle`)

형식(웹 코드): JSON `{ identifier: "novelai-vibe-transfer", version: 1, type, image?, id, encodings, name,
thumbnail, createdAt, importInfo }`. 묶음은 `{ identifier: "novelai-vibe-transfer-bundle", version: 1, vibes }`.

- `type: "image"`: `image`는 원본 그림 base64, `id`는 그 문자열의 SHA-256. 인코딩은
  `encodings[모델 키][SHA-256("information_extracted:값")] = { encoding, params }`.
- `type: "encoding"`(Export as Encodings·이미지 메타데이터): 원본이 없고 `id`는 인코딩 문자열의 SHA-256, 키는
  `unknown`, 정보 추출 값은 `importInfo`.
- 모델 키: `v4-5full`, `v4-5curated`, `v4full`, `v4curated`(V5 키도 있으나 앱은 V4.5만 바이브를 씀).

구현(`core/vibes/VibeFile.ts`, `electron/services/VibeFiles.ts`):

- **가져오기:** 바이브 파일을 끌어 놓거나 라이브러리 바이브 칸 아래 「바이브 파일 가져오기」. 그림은
  `pictures/`에, 인코딩은 생성 큐가 쓰는 `vibes/<그림 해시>-<모델>-ie<값>.bin`에 넣어, 같은 모델·정보 추출 값이면
  인코딩 비용 없이 씁니다. 열린 작업이 있으면 그 작업의 바이브 뒤에 더합니다.
- **인코딩만 있는 바이브:** `Vibe.encodingId`(문서 `id`)를 그림 해시 대신 인코딩 이름에 씁니다. 그림은 썸네일이나
  색만 있는 보기용이고, 정보 추출 값은 바꿀 수 없습니다. 인코딩이 없는 모델·값으로 생성하면 큐에 넣기 전에
  막습니다(다시 인코딩할 원본이 없음). 원본 그림을 불러오면 보통 바이브가 됩니다. 전체 백업에는 `vibes/`가
  들어가지 않아, 다른 컴퓨터로 옮기면 이런 바이브는 다시 가져와야 합니다.
- **내보내기:** 바이브 편집기 위 「바이브 파일로 내보내기」, 우클릭 메뉴, 여러 개 고른 막대의 「내보내기」.
  하나면 `.naiv4vibe`, 여럿이면 `.naiv4vibeBundle`. 원본 그림(PNG), 256px JPEG 썸네일, 저장해 둔 인코딩을 모두
  넣습니다. 바이브 편집기에 저장된 인코딩(모델·정보 추출 값)이 보입니다.
- **이미지 안의 바이브:** NovelAI 이미지의 생성 정보(Comment)에 `reference_image_multiple`(인코딩)과
  `reference_strength_multiple`·`reference_information_extracted_multiple`이 들어 있습니다. 불러오기 창 ⑤에
  「이미지에 든 바이브 N개 가져오기」가 나오고, 인코딩은 그 이미지의 모델(Source 라벨)로 저장합니다. 그림이
  그대로 든 값(V3 방식)은 보통 바이브로 만듭니다. 웹이 바이브를 넣어 내려받은 이미지는 `naidata` 텍스트 청크에
  바이브 파일·묶음이 base64로 들어 있어 그것을 먼저 씁니다. 생성 정보 없이 `naidata`만 있으면(묶음 PNG) 바로
  가져옵니다. stealth 메타데이터 상한을 1MB에서 8MB로 늘렸습니다(인코딩 하나에 약 65KB).

## 사용자 확인 (무료)

`npm run dev`에서 생성 설정의 샘플링 카드를 봅니다.

1. V4.5에서 Variety+를 켜고 일반 생성 한 장: 오류 없이 나오는지, 생성 정보에 「Variety+」가 붙는지.
2. V3로 바꾸면 SMEA·Decrisp가 나오는지. V3 SMEA 일반 생성 한 장(832×1216, 28스텝은 무료).

## 사용자 확인 (유료, 한 장씩)

1. 인페인트 + 캐릭터 레퍼런스 한 장(5 Anlas): 오류 없이 나오고 참고 그림이 반영되는지.
2. 캐릭터 레퍼런스 두 개 한 장: 실제 차감이 10 Anlas인지, 두 그림이 섞이는지.
3. 세기를 1.5나 -0.5로 넣은 한 장: 서버가 받아들이는지.

## 사용자 확인 (바이브 파일)

1. NovelAI 웹에서 내려받은 `.naiv4vibe`를 끌어 놓기 → 바이브 편집기에 「저장된 인코딩: V4.5 Full · 정보 추출 …」이
   보이는지, 그 값으로 생성할 때 인코딩 비용(2 Anlas)을 묻지 않는지(생성 자체는 무료 범위).
2. 앱에서 내보낸 `.naiv4vibe`·묶음을 NovelAI 웹에 넣어 받아들이는지.
3. 바이브를 쓴 NovelAI 이미지를 끌어 놓아 ⑤의 「이미지에 든 바이브」를 가져오고 같은 모델로 생성.
