# 0단계: NovelAI API·비용 확인 (완료, 2026-10-09)

기록용입니다. 3~6단계에 필요한 결과는 각 단계 파일에 옮겨 두었으므로, 원본 수치나 요청 모양을 다시 확인할
때만 읽습니다.

NovelAI 이미지 API는 공식 문서가 없습니다. NovelAI 웹이 보내는 요청 형식과 커뮤니티 구현체(ComfyUI_NAIDGenerator,
NekoAI-JS 등)를 기준으로 맞췄습니다.

시험 스크립트는 `legacy/tools/nai-exp/probe.ts`(계획 파일 `planS0*.json`, 실행 `run-probe.sh <계획>`)입니다.
앱의 인페인트 요청 본문에서 출발해 `action`, `model`, 이미지 필드만 바꿔 보냅니다. 요청마다 요청 모양(이미지는
해시), 응답 형식, Anlas·V5 할당량 변화를 `ForTest/stage0-*/<이름>.json`에 남깁니다.

## A. 무료 범위 (`ForTest/stage0-a`)

Opus, 832×1216(i2i 한 건은 1024×1024), 28스텝, 1장, seed 1234567. 14건 모두 200, **Anlas 차감 0**. V5 할당량
표시는 시작 10%에서 끝까지 10%로 변하지 않았습니다(V5 요청 6건).

- **응답 형식:** 모든 생성 종류가 지금 인페인트와 같습니다. `binary/octet-stream` ZIP 안에 `image_0.png` 한 장,
  RGBA PNG입니다. 일반 결과도 알파 채널이 있지만 최솟값이 243~254입니다(NovelAI가 알파에 정보를 숨기는 것으로
  보임). 투명 여부는 "알파 최솟값이 0인가"로 판단해야 합니다.
- **일반 생성 모델 ID:** `nai-diffusion-5-full`, `nai-diffusion-5-curated`, `nai-diffusion-4-5-full`,
  `nai-diffusion-4-5-curated`, `nai-diffusion-4-full`, `nai-diffusion-4-curated-preview`, `nai-diffusion-3`이 모두
  됩니다. V5 Curated는 일반 생성만 있고 인페인트 모델은 앱 목록에 없습니다.
- **일반 생성 요청:** 인페인트 본문에서 `action: 'generate'`, 인페인트가 아닌 모델 ID로 바꾸고 `image`, `mask`,
  `strength`, `noise`, `img2img`, `inpaintImg2ImgStrength`, `add_original_image`, `extra_noise_seed`를 빼면
  됩니다. V5는 지금처럼 최상위에 `use_new_shared_trial: true`를 둡니다.
- **i2i 요청:** `action: 'img2img'`, `image`, `strength`, `noise`, `extra_noise_seed`(= seed). V4 이상은
  `img2img: { strength, noise, begin_from_sigma: null, extra_noise_seed, color_correct: true }`도 같은 값으로
  넣었고 그대로 받아들여졌습니다. `mask`, `inpaintImg2ImgStrength`, `add_original_image`는 뺐습니다.
- **i2i 크기:** 서버는 입력 이미지를 요청한 `width`×`height`로 **비율을 무시하고 늘립니다**. 832×1216 입력을
  1024×1024로 요청하면 얼굴이 옆으로 퍼진 결과가 나옵니다. 작은 입력(416×608)을 832×1216으로 요청하는 것은
  문제없고 차감도 없습니다.
- **업스케일 우회:** 416×608 → 832×1216, strength 0.4에서 얼굴과 구도는 유지되고, 단순 확대보다 선과 눈이
  선명하게 다시 그려집니다. 머리카락 그늘 색이 조금 바뀝니다.
- **V5 투명 배경:** `transparent background` 태그로
  - 일반 생성: 배경이 실제로 투명(알파 0)합니다.
  - 인페인트(마스크 전체): 투명합니다. 결과를 앱의 자르기(`cropWithMetadata`의 sharp `extract`)에 넣어도
    알파가 유지됩니다.
  - i2i(불투명 입력, strength 0.5): 투명해지지 않습니다. 입력 배경을 그대로 따라갑니다.
- **V5 할당량 소모:** 6건으로는 표시가 1%도 움직이지 않았습니다.

## B. 디렉터 툴 (`ForTest/stage0-b`)

`POST https://image.novelai.net/ai/augment-image`, 본문 `{ req_type, width, height, image, prompt?, defry? }`.
입력은 832×1216 V4.5 결과입니다. 응답은 생성과 같은 ZIP이고, 결과 PNG의 `Comment`에는 `req_type`(Emotion은
`prompt`, `defry`도)만 들어 있습니다. `Source`는 없습니다.

| req_type     | 실제 차감    | 응답                                                    |
| ------------ | ------------ | ------------------------------------------------------- |
| `emotion`    | 0 (2회 모두) | RGB PNG 1장, 같은 크기. `prompt: "happy;;"`, `defry: 0` |
| `bg-removal` | **65 Anlas** | RGBA PNG **3장**(`image_0~2`), 모두 배경이 투명(알파 0) |

- 배경 제거는 Opus여도 무료가 아닙니다. 차감이 허용치(30)를 넘어 여기서 멈췄고, 나머지는 C에서 보냈습니다.
- 배경 제거의 세 장은 거의 같고 입가 같은 작은 부분만 다릅니다. 각각이 무엇인지는 아직 모릅니다.

## C. 나머지 디렉터 툴, 캐릭터 레퍼런스, 바이브, 업스케일, 계산식 (`ForTest/stage0-c`)

| 시험                                  | 실제 차감 | 결과                                                                |
| ------------------------------------- | --------- | ------------------------------------------------------------------- |
| `declutter`                           | 0         | RGB 1장. 깨끗한 입력이라 변화가 거의 없음                           |
| `lineart`                             | 0         | RGB 1장. 흑백 선화                                                  |
| `sketch`                              | 0         | RGB 1장. 연필 스케치                                                |
| `colorize` (`prompt: ""`, `defry: 0`) | 0         | RGB 1장. 선화에 색을 새로 칠함. 프롬프트가 없으면 머리·눈 색이 바뀜 |
| 캐릭터 레퍼런스, V4.5                 | **5**     | 참고 그림의 머리·옷이 잘 옮겨짐. `Source`는 V4.5                    |
| 캐릭터 레퍼런스, V5                   | 0         | **500 오류**(5번 시도 모두). V4.5로 바뀌지 않고 실패함              |
| 바이브 인코딩, V4.5                   | **2**     | `application/binary` 49,024바이트(ZIP 아님)                         |
| 바이브 사용, V4.5 일반 생성           | 0         | 정상. 인코딩 결과를 base64로 `reference_image_multiple`에 넣음      |
| 바이브 + 인페인트, V4.5               | 0         | 정상(`Source`는 V4.5 인페인트 모델). 인셋 + 바이브 조합은 가능      |
| 바이브 사용, V5 (V4.5 인코딩)         | 0         | **500 오류**(5번 시도 모두)                                         |
| 업스케일 `api.novelai.net/ai/upscale` | 0         | **404** `Cannot POST /ai/upscale`. 주소가 바뀐 것으로 보임          |
| 일반 생성 512×512, 29스텝             | **6**     | 커뮤니티 계산식 값(6)과 같음                                        |

- 500 오류를 다시 시도한 요청에서는 차감이 없었습니다.
- 캐릭터 레퍼런스·바이브 요청 필드는 [6단계 파일](6단계-캐릭터-레퍼런스-바이브.md)에 옮겨 두었습니다.
- 계산식은 NekoAI-JS의 `calculateCost`이고, 1단계에서 `NaiCost.ts`에 넣었습니다.

## D. 업스케일 주소, Emotion 표정, V5 할당량 (`ForTest/stage0-d`)

- **업스케일:** `image.novelai.net/ai/upscale`은 주소는 있지만 400 `Validation error: model  doesn't exist`로,
  본문에 `model`이 필요합니다. 어떤 값을 넣는지는 확인하지 못했습니다.
- **Emotion:** 모두 0 Anlas. `angry`, `sad`는 얼굴만 바뀌고 머리·옷·포즈·배경은 그대로입니다. `defry: 3`(약하게)도
  눈물은 남고 표정이 조금 덜할 뿐이라, 강도 차이는 크지 않습니다.
- **V5 할당량:** 원본 값은 `{"percent":10,"isNegative":false,"timeUntilNextPercent":6048}`입니다. 앱은
  `percent`를 남은 양으로 보여 줍니다. 0단계의 V5 요청(일반 생성, i2i, 인페인트) 9건 동안 10%에서 줄지
  않았습니다. 무료 조건 안의 V5 생성이 이 할당량을 쓰지 않는지, 단위가 커서 안 보이는지는 아직 모릅니다.

## 정리

- 0단계에서 쓴 Anlas: 78(배경 제거 65, 캐릭터 레퍼런스 5, 바이브 인코딩 2, 계산식 검증 6).
- 남은 질문: 업스케일의 `model` 값, V5 할당량 소모 방식(i2i가 두 배인지 포함), 배경 제거의 크기별 비용.
