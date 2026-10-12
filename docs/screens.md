# Screens and names

What each part of the UI is called. The user names screens in Korean, so each entry gives the Korean UI name
first, then the English meaning and the code name (component or CSS class) to search for.

## Layout

```text
[사이드바] [왼쪽 패널] [ 화면 머리줄 header      ] [오른쪽 패널]
                       [ 구성 막대 chain bar     ]
                       [ 가운데 body             ]
[사이드바] [ 생성 큐 막대 queue bar ············ 생성 묶음 ]
```

- **위 줄** title bar (`TitleBar`, 40 px, full width): sidebar toggle (Ctrl+B), app name (「저장 실패」 on save
  failure), current location in the middle (e.g. 작업 › 리나 › 기쁨), then JSON 가져오기 (Ctrl+O), 작업 폴더 and
  프로그램 설정 (Ctrl+, with version or update badge) before the Windows buttons. Drag to move the window.
- **사이드바** sidebar (`Sidebar`): always visible; Ctrl+B folds it to icons.
- **왼쪽 패널** left panel: 프롬프트 패널 on project/free screens, 라이브러리 목록 in the library.
- **가운데** body: images, canvas, cards.
- **오른쪽 패널 (입력 패널)** right panel (`detail-side`, `canvas-settings`): scene detail, free generation and
  inpaint editor only; holds generation inputs, plus the generate dock at the bottom on scene detail and free.
- **생성 큐 막대** queue bar (`QueueBar`): queue on the left, per-screen generate group (`BottomSlot`) on the right.

**Panel resizing** (`PanelResizer`, widths in `panelWidths.ts`, `localStorage` `panel-width:<panel>`): drag the
edge; double-click resets; ←/→ move 16 px when focused. The right panel width is shared by scene detail, free
generation and the inpaint editor.

| Panel           | Default | Range   |
| --------------- | ------- | ------- |
| 사이드바        | 240 px  | 200–400 |
| 라이브러리 목록 | 260 px  | 200–480 |
| 프롬프트 패널   | 300 px  | 240–600 |
| 오른쪽 패널     | 360 px  | 280–640 |

## Sidebar

1. **자유 생성** free generation.
2. **작업** projects card: project list (header folds; ＋ new project, Ctrl+N); supports list folders.
3. **라이브러리** card: 생성 설정 (2), 캐릭터 (3), 씬 모음 (4), 인페인트 (5), 캐릭터 레퍼런스 (6), 바이브 (7),
   프롬프트 조각 (8). Numbers are shortcut keys; 1 opens the last project.

## Screens

### 시작 화면 welcome (`Welcome`)

Shown with no projects or nothing selected: new project, JSON import, settings.

### 작업 화면 project screen (`ProjectView`)

- **화면 머리줄** header (`project-header`): project name, **모드 버튼** [인페인트 | 일반 생성], **계정 표시**
  (`AccountMeter`, V5 free quota and Anlas), **⋯ 메뉴** (최종 요청 미리보기, open folder, duplicate, delete).
- **구성 막대** chain bar (`chain-bar`): **구성 칩** (`ChainChip`) for each library item the project uses. A chip
  shows the chosen name; clicking opens the **고르기 창** picker (`ChecklistChip`) with list folders (folded state
  remembered separately from the library), a check and accent on chosen items, a pencil per row (edit popup) and
  「라이브러리에서 관리」 at the bottom. Hovering a chip also shows a pencil for the current item. In 일반 생성 the
  인페인트 chip is replaced by the **해상도** chip, whose 「직접 입력…」 opens a small size window (64 px steps).
  - **캐릭터 칩** (`CharacterChip`): names (「첫 이름 외 N명」 from three). Multi-pick with order numbers; picked
    rows get a prompt set select and 「앞 순서로 옮기기」. Order = scene prompt slot order; in inpaint only the first
    character is referenced. None picked = 「캐릭터 없음」 (scene prompt and reference inset go to common).
  - **위치 칩** (`PositionChip`): 「AI가 정함」/「직접 지정」; opens the 캐릭터 위치 window.
  - **참고 칩** (`AidChip`): one button inside the chip shows the current mode (레퍼런스/바이브) and flips it on each
    click (`Project.aidMode`); the picker lists that mode's items. Both allow any number (order numbers); none =
    not used. The vibe picker has the 「세기 합 맞추기 (Normalize Reference Strengths)」 toggle. Picks on the other
    side are kept. Works with both modes. In an inpaint request the character reference picker shows a warning (bad
    results in the user's test).
- **경고 띠** warning band (`missing-banner`): only when something required is missing.
- Body: gallery or scene detail.

#### 작업영역 gallery (`GalleryView`)

- **카드 막대** card bar (`gallery-toolbar`): left **카드 고르기** select all (Ctrl+A); with picked cards it becomes
  the **고른 카드 막대** (i2i로 보내기, 디렉터 툴, 결과만 삭제, 씬 삭제, cancel). Right: export, **카드 비율** icons
  (832×1216, 1216×832, 1024²) and **한 줄 카드 수** (3–7).
- **씬 카드** scene card (`EmotionCard`): favorite image (else newest), **생성 체크** (include in batch), scene name,
  count. Hover shows ▶ (generate this scene) and ⋯ (menu) at the top right. While streaming, the in-progress frame
  shows over the card (`StreamPreview`).
  - **카드 고르기** (Ctrl/Shift click, drag on empty space) targets bulk actions; **생성 체크** targets batch
    generation. They are different.
- **생성 묶음** generate group (queue bar right): 생성할 씬 N/M, check all/none, × per-scene count, estimate,
  ▶ 생성.

#### 씬 상세 scene detail (`EmotionDetail`)

- **씬 이동 막대** (`detail-nav`): ← gallery, **씬 ⋯ 메뉴** (duplicate, delete scene), ‹ prev · n/m · next ›.
- Center:
  - **미리보기** preview (`ImageStage`): wheel zoom at cursor, drag to pan anywhere, ⌖ recenter, click the zoom
    number to fit and center, double-click fit/original, original-size window. Zoom and position persist across
    results.
  - **결과 막대** 「선택한 결과」 (`ResultBar`): ⓘ record info | favorite, same seed again, restore prompt | i2i로
    보내기, 디렉터 툴, 자유 생성 i2i, 인페인트 만들기 …… save, show in folder, delete. The image context menu has
    the same list (`ResultActions`). Transparent results show on a checkerboard.
  - **이미지 목록** filmstrip (`filmstrip`): newest first, collapsible, multi-select delete (`filmstrip-bar`).
- Right panel: scene name, scene prompts (one per character, `ScenePromptFields`), include in batch, **생성 독**
  generate dock (`generate-dock`).
- Keys: ←/→ results, Del delete, Tab/Shift+Tab (or PageDown/PageUp) scenes, Esc gallery.

### 자유 생성 free generation (`FreeView`)

Results in `projects/free/`, separate from projects.

- Header: [일반 생성 | i2i | 디렉터 툴], account, results folder.
- Chain bar: preset, characters (none or many), position, resolution, 참고; hidden in 디렉터 툴.
- Center: same preview, result bar and filmstrip. i2i and 디렉터 툴 add tabs [i2i 이미지 (or 마스크 칠하기, 디렉터 툴
  이미지) | 그리기 (i2i only) | 원본과 결과]. Streaming frames show over the stage.
- **그리기** Draw (`DrawCanvas`, like the NovelAI web canvas's Draw): pen, eraser, fill (tolerance), eyedropper
  (also Ctrl+click), color and palette, round/soft/square tips, size, opacity, undo/redo, wheel zoom, middle button
  or Space drag to pan. Strokes sit on one layer over the i2i image; the eraser removes only strokes.
  「이미지에 합치기」 (or generating, or leaving the tab) bakes them into a new i2i image. Without an image it offers a
  blank white canvas at the preset size. Keys B/E/G/C, [ ]. Selection, lasso, blur, clone, HSV and 3D layers from the
  web are not implemented.
- Right panel: in i2i the **i2i 이미지** card (image, 전체 다시 그리기/인페인팅, strength, noise); prompt; **붙일 위치**
  insert position; dock (count, estimate, generate).
- 디렉터 툴: **디렉터 툴 이미지** card and **디렉터 툴** card (`DirectorToolFields`), dock (▶ N번 적용, estimate).
  「이 결과로 디렉터 툴」 on the result bar sends a result as the image. Sent at original size without padding;
  results in `outputs/디렉터 툴/<date>/`.

### 프롬프트 패널 prompt panel (`PromptPanel`)

Left panel of project and free screens. Edits the chosen preset's common positive/negative and the character prompt
sets directly. Stacked **프롬프트 카드** (`PromptCard`): one for the preset, then one per character under 「캐릭터
프롬프트」. Headers fold the card (folded shows the start of the positive); 「모두 접기」 with several characters;
folded state is remembered. Values save to the library items. On the project screen 「최종 요청 미리보기」 is at the
bottom.

### 라이브러리 library (`LibraryView`)

- **라이브러리 목록** (`library-list`): items, ＋ add, fold; same context menu (`listMenu`) and folders as the
  sidebar project list.
- **편집기** editor (`library-editor`): **편집기 머리줄** (name, used by, open folder, JSON export, duplicate,
  delete) and the section editor:

| Section         | Editor                     | Holds                                                               |
| --------------- | -------------------------- | ------------------------------------------------------------------- |
| 생성 설정       | `PresetEditor`             | common prompts, model, txt2img/i2i, quality tags/UC, sampling, seed |
| 캐릭터          | `CharacterEditor`          | prompt sets (positive/negative per outfit or version)               |
| 씬 모음         | `EmotionSetEditor`         | scene names and prompts; ＋ opens slots for later characters        |
| 인페인트        | `ReferenceEditor`          | reference image and canvas (below)                                  |
| 캐릭터 레퍼런스 | `CharacterReferenceEditor` | picture, strength, fidelity, target                                 |
| 바이브          | `VibeEditor`               | picture, strength, information extracted, saved encodings           |
| 프롬프트 조각   | `PieceSetEditor`           | pieces called as `<set.piece>`                                      |

The same editors open as the **편집 팝업** (`LibraryEditorDialog`) from project and free screens.

Character references and vibes: values go to ±10 beyond the web's 0–1. Pictures live in `pictures/` by content hash
(duplicates share them); no per-item JSON export, full backups include pictures. Vibes export as NovelAI vibe files
(`.naiv4vibe`, several → `.naiv4vibeBundle`) from the editor, context menu or multi-select bar, and import via
「바이브 파일 가져오기」 or drag and drop.

#### 인페인트 편집 inpaint editor (`ReferenceEditor`)

- Center **캔버스** (`ReferenceCanvas`): toolbar [영역 상자: 참고 영역·결과 영역] | [붓: 칠하기·지우기·모양·크기] |
  [반전·모두 지우기·↶↷] …… [보기: 불투명도·확대]; status line (saved size, free size or not, warnings).
  Wheel zooms at the cursor; middle button or Space drag pans freely (`canvasViewport`, also in free i2i masks).
- Right panel cards: **참고 이미지**, **캔버스 구성** (auto/prepared canvas, resolution, position, ratio, fit,
  background, reset), **영역** (참고 영역 여백, result area numbers).
- Areas: **참고 영역** reference area (not redrawn), **결과 영역** result area (cropped and saved), **생성 영역**
  generate area (teal, painted with the brush, redrawn by NovelAI).

### 목록 폴더 list folders (`ListFolder`)

One level of folders in the sidebar project list and library lists.

- Group: pick items (Ctrl/Shift click, drag on empty space) then **Ctrl+G**, or 「폴더로 묶기」 / the selection bar's
  「묶기」. With nothing picked, groups the current item. A rename field opens right away.
- Folder header: click folds, double-click renames (an existing name merges). Context menu: fold, rename, select
  all inside, ungroup.
- Drag an item onto a header (end of that folder) or next to an item (that item's folder); drag a header to move
  the folder; 「폴더에서 빼기」 takes an item out.
- Stored only as each item's `folder` name, so an empty folder disappears. The narrow sidebar shows items only.

## Overlays

| Name (UI)                | Code                      | Opened from                                   |
| ------------------------ | ------------------------- | --------------------------------------------- |
| 프로그램 설정            | `SettingsModal`           | title bar, Ctrl+,                             |
| 새 작업                  | `NewProjectDialog`        | sidebar ＋, Ctrl+N                            |
| 편집 팝업                | `LibraryEditorDialog`     | chip pencils, prompt panel pencils            |
| i2i로 보내기             | `Img2ImgDialog`           | result bar, picked-cards bar, scene card menu |
| 디렉터 툴                | `DirectorToolDialog`      | result bar, picked-cards bar, scene card menu |
| 씬 표정 만들기           | `SceneSetDialog`          | scene card menu, Emotion in the tool window   |
| 씬 이미지 내보내기       | `ExportDialog`            | card bar export                               |
| 생성 정보                | `RecordInfo`              | ⓘ on the result bar                           |
| 최종 요청 미리보기       | `PreviewDialog`           | project ⋯ menu, prompt panel                  |
| 캐릭터 위치              | `CharacterPositionDialog` | position chip                                 |
| 크게 편집                | `TextEditorDialog`        | expand button on prompt fields                |
| 이미지에서 설정 불러오기 | `ImageImportDialog`       | drop or Ctrl+V a NovelAI image                |
| 이미지 사용              | `PlainImageDialog`        | drop or Ctrl+V a plain image                  |
| 결과 정리                | inside `StorageTab`       | 프로그램 설정 > 저장 공간                     |
| 새 버전이 있습니다       | `UpdateDialog`            | app start (auto check)                        |
| 확인 창                  | `confirmDialog`           | deletes etc.                                  |
| 우클릭 메뉴              | `ContextMenu`             | cards, images, lists                          |
| 알림                     | `Toasts`                  | bottom right                                  |

- **디렉터 툴 window:** tool list (Emotion, 배경 제거, Declutter, Line Art, Sketch, Colorize). Emotion takes mood (24),
  strength and optional prompt; Colorize takes prompt and strength; all take a count (max 4). Shows the estimate;
  warns that bg removal costs Anlas even on Opus. Inputs above 1024² area shrink by default. Results stack on the
  source scene (bg removal adds three).
- **씬 표정 만들기 window** (menu 「이 이미지로 씬 표정 만들기」): runs Emotion per scene on one image for a set with
  the same body, outfit and pose. Per-scene check, mood, strength, count; mood and strength save to the scene set.
- **프로그램 설정 tabs:** NovelAI 계정 · 요청 (includes streaming) / 결과 · 내보내기 / 태그 / 화면 · 테마 / 저장 공간 ·
  백업 / 단축키 / 정보 · 업데이트.

## Glossary

| UI term     | Meaning                                                                  | Code / storage                    |
| ----------- | ------------------------------------------------------------------------ | --------------------------------- |
| 작업        | project: preset + characters + scene set + reference; results stack here | `Project`                         |
| 씬          | one scene (e.g. joy); formerly 「감정」                                  | `Emotion`, `emotionId`            |
| 씬 모음     | scene list                                                               | `EmotionSet`, `emotionSets`       |
| 생성 설정   | preset: common prompts, model, steps, …                                  | `Preset`, `presets`               |
| 캐릭터      | character with prompt sets                                               | `Character`, `CharacterPromptSet` |
| 캐릭터 목록 | characters in a project or free generation; order matters                | `characters`, `CharacterSlot`     |
| 캐릭터 위치 | AI or manual (V4/V4.5 5×5 grid, V5 free)                                 | `positionMode`, `center`          |
| 고르기 창   | picker popover of a chip                                                 | `ChecklistChip`                   |
| 목록 폴더   | folder in project/library lists (Ctrl+G)                                 | `folder`, `ListFolder`            |
| Effort      | V5 Full High/Medium; Medium ~42% cheaper with fixed values               | `effort`                          |
| 인페인트    | reference image and canvas; formerly 「레퍼런스 생성」                   | `Reference`, mode `reference`     |
| 일반 생성   | txt2img                                                                  | mode `txt2img`                    |
| i2i         | img2img                                                                  | `img2img`                         |
| 디렉터 툴   | NovelAI tools on one result (Emotion, bg removal, …)                     | kind `augment`, `AugmentTool`     |
| 대표 이미지 | favorite result per scene, used by cards and export                      | `Project.favorites`               |
| 참고        | character references or vibes added to generation (V4.5 only)            | `characterReferences`, `vibes`    |
| 결과        | one generated image and its record                                       | `GenerationRecord`                |
| 생성 큐     | generation queue                                                         | `GenerationQueue`                 |
| 예상 Anlas  | estimated cost; may differ from the actual charge                        | `estimateJobAnlas`                |
