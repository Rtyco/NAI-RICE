# AGENTS.md

NAI RICE: NovelAI 인페인트로 캐릭터 감정 이미지 세트를 만드는 Windows Electron 앱.
구조와 개발 방법은 [docs/개발-가이드.md](docs/개발-가이드.md), 진행 중인 작업은
[docs/작업-계획.md](docs/작업-계획.md)를 먼저 읽는다.

## 규칙

- **사용자가 요청하기 전에는 GitHub에 푸시·태그·릴리스하지 않는다.** 로컬 커밋까지만 한다. 사용자가 로컬에서
  직접 테스트한 뒤 올린다.
- 사용자와는 한국어로 대화한다. 화면 문구는 "~합니다/~십시오" 존댓말로 통일하고, 번역투를 피한다.
- 버전은 사용자가 정한다. 아직 공개 전이면 버전을 올리지 않는다.
- NovelAI 실제 호출은 Opus 무료 범위(1024×1024 이하, 28스텝 이하, 1장)에서만 한다. 유료일 수 있는 기능은
  사용자 허락을 받고 한 장씩 시험한다. 토큰은 NovelAI 요청에만 쓴다.
- 작가 태그 목록 같은 사용자의 프롬프트를 문서나 커밋에 넣지 않는다.

## 명령

- `npm test`, `npm run typecheck`, `npm run lint`: 커밋 전에 모두 통과시킨다.
- 포맷은 바꾼 줄만 맞춘다. 파일 전체에 `prettier --write`를 돌리면 원래 형식과 달라 diff가 커지는 파일이 있다.
- `npm run package:win`: `release/`에 설치·포터블 파일과 `SHA256SUMS.txt`를 만든다.

## 환경 (Windows)

- 실행·패키징 전에 `ELECTRON_RUN_AS_NODE`를 해제한다.
- 패키징 중 EBUSY/EPERM: Windows Defender가 새 exe를 검사하는 중이다. `-c.directories.output=release-new`로
  따로 빌드한 뒤 `release/`와 바꾼다. 사용자가 `release/`의 앱을 실행 중일 수도 있다.
- `legacy/`, `ForTest/`, `release/`는 git에 올리지 않는다. 이전 빌드는 `legacy/release-*`에 둔다.
- 실험 스크립트는 `legacy/tools/nai-exp/`, GitHub 릴리스 스크립트는 `legacy/tools/release/`에 있다.
  GitHub 토큰은 `printf 'protocol=https\nhost=github.com\n\n' | git credential fill`로 얻는다.
- 저장소: `Rtyco/NAI-RICE`. 커밋 작성자는 git 설정(amagi)을 그대로 쓴다.
