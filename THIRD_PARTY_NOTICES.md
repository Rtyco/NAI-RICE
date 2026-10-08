# 출처 및 오픈소스 고지

NAI RICE를 만드는 데 바탕이 된 프로젝트와, 배포 파일에 포함된 오픈소스 라이브러리의 출처와 라이선스를
적습니다. NAI RICE 자체의 라이선스는 [LICENSE](LICENSE)(MIT)에 있습니다.

## SD Studio

NAI RICE는 [SD Studio](https://github.com/sunho/SDStudio)에서 파생된 프로젝트입니다.

- **원작**: sunho의 [SD Studio](https://github.com/sunho/SDStudio). MIT 라이선스입니다.
- **이어서 개발한 판**: Dd154663의 [SD Studio](https://github.com/Dd154663/SDStudio). MIT
  라이선스이며, 저작권 표시는 아래와 같습니다.
- **기준 커밋**: Dd154663/SDStudio의 `d1b8de5bf9f269f397c08e33fea1e3febe53dd90`. 호환성은 이 커밋을
  기준으로 맞췄습니다.

SD Studio에서 이어받은 것은 다음과 같습니다.

- 프로그램의 범위와 작업 흐름
- NovelAI 요청 방식
- 프롬프트 조각 문법(`<세트.조각>`)과 여러 줄 조각에서 한 줄을 고르는 규칙
- 조각 파일과 프로젝트 파일 형식

NAI RICE는 이 동작을 새로 구현했으며 SD Studio 소스 파일을 그대로 포함하지 않습니다.

```text
MIT License

Copyright (c) 2024 sunho
Copyright (c) 2026 Dd154663

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 배포 파일에 포함된 라이브러리

설치 파일과 포터블 실행 파일에 들어 있는 라이브러리입니다(`npm ls --omit=dev` 기준).

| 라이브러리                                              | 버전   | 라이선스                      | 저작권                              | 쓰는 곳                     |
| ------------------------------------------------------- | ------ | ----------------------------- | ----------------------------------- | --------------------------- |
| [Electron](https://github.com/electron/electron)        | 44.6.0 | MIT                           | Electron contributors, GitHub Inc.  | 데스크톱 실행 환경          |
| [React](https://github.com/facebook/react)              | 19.2.8 | MIT                           | Meta Platforms, Inc. and affiliates | 화면                        |
| [React DOM](https://github.com/facebook/react)          | 19.2.8 | MIT                           | Meta Platforms, Inc. and affiliates | 화면                        |
| [scheduler](https://github.com/facebook/react)          | 0.27.0 | MIT                           | Meta Platforms, Inc. and affiliates | React 내부                  |
| [Zustand](https://github.com/pmndrs/zustand)            | 5.0.15 | MIT                           | Paul Henschel                       | 화면 상태 관리              |
| [Zod](https://github.com/colinhacks/zod)                | 4.5.4  | MIT                           | Colin McDonnell                     | 파일·요청 검증              |
| [fflate](https://github.com/101arrowz/fflate)           | 0.8.3  | MIT                           | Arjun Barrett                       | NovelAI 응답 ZIP·메타데이터 |
| [sharp](https://github.com/lovell/sharp)                | 0.35.5 | Apache-2.0                    | Lovell Fuller and contributors      | 이미지 자르기·변환          |
| [@img/sharp-win32-x64](https://github.com/lovell/sharp) | 0.35.5 | Apache-2.0, LGPL-3.0-or-later | Lovell Fuller and contributors      | sharp의 Windows 실행 파일   |
| [@img/colour](https://github.com/lovell/colour)         | 1.1.0  | MIT                           | Heather Arthur                      | sharp 내부                  |
| [detect-libc](https://github.com/lovell/detect-libc)    | 2.1.2  | Apache-2.0                    | Lovell Fuller                       | sharp 내부                  |
| [semver](https://github.com/npm/node-semver)            | 7.8.5  | ISC                           | Isaac Z. Schlueter and Contributors | sharp 내부                  |

각 라이브러리의 라이선스 전문은 설치 폴더의 다음 위치에 함께 들어 있습니다.

- **Electron**: `LICENSE.electron.txt`
- **Chromium, Node.js, FFmpeg와 그 하위 구성 요소**: `LICENSES.chromium.html`

`ffmpeg.dll`은 Electron이 같은 버전으로 따로 배포하는, 특허 코덱(H.264·AAC 등)이 없는 FFmpeg 빌드로
바꿔 넣었습니다(`scripts/free-ffmpeg.cjs`).

- **나머지 라이브러리**: `resources\app.asar` 안의 `node_modules\<이름>\LICENSE`

MIT·ISC 라이선스 본문은 위 SD Studio 항목과 같은 형식이며, 저작권 표시만 위 표와 같이 다릅니다.
Apache-2.0 전문은 설치 폴더의 `licenses\Apache-2.0.txt`에 있습니다.

### libvips와 그 구성 요소 (LGPL 포함)

sharp는 [libvips](https://github.com/libvips/libvips) 8.18.7과 그 하위 라이브러리를 DLL로 함께
배포합니다. 이 DLL은 다음 폴더에 있습니다.

```text
resources\app.asar.unpacked\node_modules\@img\sharp-win32-x64\lib\
  libvips-42.dll
  libvips-cpp-8.18.7.dll
```

LGPL 라이브러리는 동적으로 연결되어 있으므로 같은 이름의 DLL로 바꿔 쓸 수 있습니다. 이 폴더는 실행
파일의 무결성 검사 대상이 아니므로 바꾼 DLL도 그대로 불러옵니다.

- **DLL 빌드 소스와 스크립트**: [lovell/sharp-libvips v1.3.4](https://github.com/lovell/sharp-libvips/releases/tag/v1.3.4)
- **libvips 소스**: [libvips/libvips v8.18.7](https://github.com/libvips/libvips/releases/tag/v8.18.7)
- **라이선스 전문**: 설치 폴더의 `licenses\LGPL-3.0.txt`, `licenses\GPL-3.0.txt`

포함된 라이브러리와 라이선스는 다음과 같습니다(sharp-libvips 고지 기준).

| 라이브러리    | 라이선스                                                  |
| ------------- | --------------------------------------------------------- |
| aom           | BSD 2-Clause + Alliance for Open Media Patent License 1.0 |
| cairo         | Mozilla Public License 1.1                                |
| cgif          | MIT                                                       |
| expat         | MIT                                                       |
| fontconfig    | fontconfig License (BSD 계열)                             |
| freetype      | FreeType License (BSD 계열)                               |
| fribidi       | LGPLv3                                                    |
| glib          | LGPLv3                                                    |
| harfbuzz      | MIT                                                       |
| highway       | BSD 3-Clause                                              |
| lcms          | MIT                                                       |
| libarchive    | BSD 2-Clause                                              |
| libexif       | LGPLv3                                                    |
| libffi        | MIT                                                       |
| libheif       | LGPLv3                                                    |
| libimagequant | BSD 2-Clause                                              |
| libnsgif      | MIT                                                       |
| libpng        | libpng License                                            |
| librsvg       | LGPLv3                                                    |
| libtiff       | libtiff License (BSD 계열)                                |
| libultrahdr   | MIT                                                       |
| libvips       | LGPLv3                                                    |
| libwebp       | New BSD                                                   |
| libxml2       | MIT                                                       |
| mozjpeg       | zlib License, IJG License, BSD 3-Clause                   |
| pango         | LGPLv3                                                    |
| pixman        | MIT                                                       |
| proxy-libintl | LGPLv3                                                    |
| zlib-ng       | zlib License                                              |

LGPLv3로 표시된 라이브러리는 LGPLv2/LGPLv2.1의 "any later version" 조항에 따라 LGPLv3로 씁니다.

## 태그 자동완성 목록

프롬프트 칸의 태그 자동완성은
[a1111-sd-webui-tagcomplete](https://github.com/DominikDoom/a1111-sd-webui-tagcomplete)의
`tags/danbooru.csv`(커밋 209b1dd, 2025-01-03)를 그대로 씁니다. 태그 이름·분류·게시물 수·별칭은
[Danbooru](https://danbooru.donmai.us)에서 모은 것입니다. 파일은 `src/renderer/data/danbooru-tags.csv`에 있습니다.

```text
MIT License

Copyright (c) 2022 Dominik Reh

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 개발에만 쓰는 도구

다음 도구는 빌드와 개발에만 쓰며 배포 파일에는 포함되지 않습니다.

- **언어·빌드**: TypeScript, Vite, @vitejs/plugin-react, electron-builder
- **테스트·검사**: Vitest, ESLint(typescript-eslint, eslint-plugin-react-hooks,
  eslint-plugin-react-refresh), Prettier
- **기타**: concurrently, cross-env, wait-on

각 도구의 라이선스는 `package-lock.json`과 npm 저장소 기록에 있습니다.

## 글꼴

프로그램은 글꼴 파일을 포함하지 않습니다. Pretendard, 맑은 고딕, D2Coding, Consolas 등 PC에 설치된
글꼴을 씁니다.

## NovelAI

NovelAI는 외부 서비스이며 그 이름과 상표는 해당 소유자에게 있습니다. NAI RICE는 NovelAI와 관련이
없는 비공식 프로그램입니다.

- 실제 생성에는 사용자 본인의 토큰이 필요하며, 계정의 Anlas나 구독 할당량을 쓸 수 있습니다.
- 요청 주소와 마스크 동작은 공개된 서비스와 함께 쓰기 위해 구현했습니다. 서비스가 바뀌면 고쳐야 할
  수 있습니다.
- 품질 태그와 UC 프리셋 문구는 [docs.novelai.net](https://docs.novelai.net/)의 공개 값을 따릅니다.
