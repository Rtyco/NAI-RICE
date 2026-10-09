import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CanvasLayout, Rect, Reference, ReferenceSide } from '../../core/domain/types';
import { computeLayout, CUSTOM_MAX, CUSTOM_MIN, RESOLUTION_PRESETS, snapDimension } from '../../core/imaging/CanvasLayout';
import { maskHasGeneratePixels } from '../../core/imaging/MaskBuilder';
import { cropOutside, suggestOutputRect } from '../../core/imaging/OutputCropper';
import { clampRect, expandRect } from '../../core/imaging/rects';
import { patchItem } from '../../core/model/mutations';
import { checkFreeGeneration } from '../../core/providers/NaiCost';
import { ReferenceCanvas } from '../components/ReferenceCanvas';
import { Icon } from '../components/Icon';
import { Stepper } from '../components/Stepper';
import { EmptyState, PanelHeading, SelectField } from '../components/ui';
import type { CanvasImage } from '../lib/image';
import {
  canvasImageToDataUrl,
  composeCanvas,
  decodeMask,
  layoutMaskFor,
  loadHtmlImage,
  maskToDataUrl,
  masksEqual,
  prepareImage,
} from '../lib/image';
import { errorMessage, run, scheduleSave, setPendingReference, toast, updateLibrary, useStore } from '../store';
import { fileApi, libraryApi } from '../desktop';

type Source = { dataUrl: string; name: string; changed: boolean };

type Working = {
  canvas: CanvasImage;
  width: number;
  height: number;
  backgroundMask: Uint8Array;
  detectionLabel: string;
};

const SIDES: Array<{ value: ReferenceSide; label: string }> = [
  { value: 'left', label: '왼쪽' },
  { value: 'right', label: '오른쪽' },
  { value: 'top', label: '위쪽' },
  { value: 'bottom', label: '아래쪽' },
];

const CROP_FIELDS = [
  { key: 'x', label: 'X' },
  { key: 'y', label: 'Y' },
  { key: 'width', label: '가로' },
  { key: 'height', label: '세로' },
] as const;

function detectionText(mode: string, confidence: number): string {
  const label = mode === 'transparent' ? '투명 배경' : mode === 'solid' ? '단색 배경' : '수동 확인 필요';
  return `${label} · 신뢰도 ${Math.round(confidence * 100)}%`;
}

export function ReferenceEditor({ reference }: { reference: Reference }) {
  const pendingReference = useStore((state) => state.pendingReference);
  const presets = useStore((state) => state.library?.presets ?? []);
  const [loading, setLoading] = useState(Boolean(reference.image));
  const [source, setSource] = useState<Source | null>(null);
  const [layout, setLayout] = useState<CanvasLayout>(reference.layout);
  const [working, setWorking] = useState<Working | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [referenceRect, setReferenceRect] = useState<Rect>(reference.image?.referenceRect ?? { x: 0, y: 0, width: 1, height: 1 });
  const [outputRect, setOutputRect] = useState<Rect>(reference.image?.outputRect ?? { x: 0, y: 0, width: 1, height: 1 });
  const [expansionPx, setExpansionPx] = useState(reference.maskExpansionPx);
  // 재구성은 비동기로 끝나므로 그때의 확장 값을 ref로 읽는다.
  const expansionRef = useRef(expansionPx);
  expansionRef.current = expansionPx;
  const [threshold, setThreshold] = useState(reference.backgroundThreshold);
  const [initialMask, setInitialMask] = useState<Uint8Array>();
  const [mask, setMask] = useState<Uint8Array>();
  const savedMask = useRef<Uint8Array | undefined>(undefined);
  const dirty = useRef(false);
  const queuedRebuild = useRef<[Source, CanvasLayout, number] | null>(null);
  const rebuildRunning = useRef(false);
  const rebuildSeq = useRef(0);

  // 저장된 레퍼런스 불러오기
  useEffect(() => {
    if (!reference.image) return;
    let active = true;
    void (async () => {
      try {
        const image = reference.image!;
        const images = await libraryApi().readReferenceImages(reference);
        if (!images || !active) return;
        const loadedMask = await decodeMask(images.maskDataUrl, image.canvasWidth, image.canvasHeight);
        const canvas = await loadHtmlImage(images.canvasDataUrl);
        let backgroundMask: Uint8Array;
        let detectionLabel = '저장된 마스크';
        if (reference.layout.mode === 'auto') {
          backgroundMask = layoutMaskFor(reference.layout);
        } else {
          const prepared = await prepareImage(images.canvasDataUrl, reference.backgroundThreshold);
          backgroundMask = prepared.backgroundMask;
          detectionLabel = `저장된 마스크 · ${detectionText(prepared.detection.mode, prepared.detection.confidence)}`;
        }
        if (!active) return;
        savedMask.current = loadedMask;
        setSource({ dataUrl: images.originalDataUrl, name: image.originalName, changed: false });
        setWorking({
          canvas,
          width: image.canvasWidth,
          height: image.canvasHeight,
          backgroundMask,
          detectionLabel,
        });
        setInitialMask(loadedMask);
        // 예전 버전에서 저장한 크롭이 보호 영역과 겹치면 바깥으로 맞추고 저장한다.
        const blocked = expandRect(image.referenceRect, reference.maskExpansionPx, image.canvasWidth, image.canvasHeight);
        const fitted = cropOutside(image.outputRect, blocked);
        if (JSON.stringify(fitted) !== JSON.stringify(image.outputRect)) {
          setOutputRect(fitted);
          dirty.current = true;
        }
      } catch (error) {
        toast(`인페인트를 불러올 수 없습니다: ${errorMessage(error)}`, 'error');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // 레퍼런스가 바뀌면 컴포넌트가 새로 마운트된다(key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rebuild = useCallback(async (nextSource: Source, nextLayout: CanvasLayout, nextThreshold: number) => {
    const sequence = (rebuildSeq.current += 1);
    setRebuilding(true);
    try {
      if (nextLayout.mode === 'auto') {
        const composed = await composeCanvas(nextSource.dataUrl, nextLayout);
        if (sequence !== rebuildSeq.current) return;
        setWorking({
          canvas: composed.canvas,
          width: composed.width,
          height: composed.height,
          backgroundMask: composed.backgroundMask,
          detectionLabel: '자동 구성',
        });
        setReferenceRect(composed.referenceRect);
        // 참고 영역과 여백을 먼저 정하고, 결과 영역은 그 바깥만 쓴다.
        const blocked = expandRect(composed.referenceRect, expansionRef.current, composed.width, composed.height);
        setOutputRect(cropOutside(composed.outputRect, blocked));
      } else {
        const prepared = await prepareImage(nextSource.dataUrl, nextThreshold);
        if (sequence !== rebuildSeq.current) return;
        const rect = prepared.detection.referenceRect;
        setWorking({
          canvas: prepared.canvas,
          width: prepared.width,
          height: prepared.height,
          backgroundMask: prepared.backgroundMask,
          detectionLabel: detectionText(prepared.detection.mode, prepared.detection.confidence),
        });
        setReferenceRect(rect);
        const blocked = expandRect(rect, expansionRef.current, prepared.width, prepared.height);
        setOutputRect(suggestOutputRect(blocked, prepared.width, prepared.height, 1));
      }
      setInitialMask(undefined);
      dirty.current = true;
    } catch (error) {
      toast(`캔버스를 만들 수 없습니다: ${errorMessage(error)}`, 'error');
    } finally {
      if (sequence === rebuildSeq.current) setRebuilding(false);
    }
  }, []);

  // 슬라이더나 색상을 움직이는 동안 바로 다시 그리되, 재구성이 겹치지 않게 진행 중이면 마지막 값만 남겼다가
  // 끝나는 즉시 이어서 한다. 일정 시간 기다리는 방식은 그만큼 늦게 따라와 답답하게 느껴진다.
  const scheduleRebuild = useCallback(
    (nextSource: Source | null, nextLayout: CanvasLayout, nextThreshold: number) => {
      if (!nextSource) return;
      queuedRebuild.current = [nextSource, nextLayout, nextThreshold];
      if (rebuildRunning.current) return;
      rebuildRunning.current = true;
      void (async () => {
        try {
          for (let next = queuedRebuild.current; next; next = queuedRebuild.current) {
            queuedRebuild.current = null;
            await rebuild(...next);
          }
        } finally {
          rebuildRunning.current = false;
        }
      })();
    },
    [rebuild],
  );
  useEffect(
    () => () => {
      queuedRebuild.current = null;
    },
    [],
  );

  const applySource = useCallback(
    (dataUrl: string, name: string) => {
      const next = { dataUrl, name, changed: true };
      setSource(next);
      void rebuild(next, layout, threshold);
    },
    [layout, threshold, rebuild],
  );

  // 드래그앤드롭으로 들어온 이미지
  useEffect(() => {
    if (!pendingReference || pendingReference.referenceId !== reference.id || loading) return;
    setPendingReference(undefined);
    applySource(pendingReference.dataUrl, pendingReference.name);
  }, [pendingReference, reference.id, loading, applySource]);

  const changeLayout = (patch: Partial<CanvasLayout>) => {
    const next = { ...layout, ...patch };
    setLayout(next);
    dirty.current = true;
    scheduleRebuild(source, next, threshold);
  };

  const handleMaskChange = useCallback((data: Uint8Array) => {
    setMask(data);
    if (!masksEqual(data, savedMask.current)) dirty.current = true;
  }, []);

  // 자동 저장
  const latest = useRef({ source, layout, working, referenceRect, outputRect, expansionPx, threshold, mask });
  latest.current = { source, layout, working, referenceRect, outputRect, expansionPx, threshold, mask };

  useEffect(() => {
    if (!dirty.current || rebuilding) return;
    scheduleSave(
      `reference:${reference.id}`,
      async () => {
        const value = latest.current;
        if (value.working && value.mask && value.source && value.mask.length === value.working.width * value.working.height) {
          const result = await libraryApi().saveReferenceImages({
            referenceId: reference.id,
            originalDataUrl: value.source.changed ? value.source.dataUrl : undefined,
            canvasDataUrl: canvasImageToDataUrl(value.working.canvas),
            maskDataUrl: maskToDataUrl(value.mask, value.working.width, value.working.height),
          });
          if (value.source.changed) setSource({ ...value.source, changed: false });
          savedMask.current = value.mask;
          updateLibrary((library) =>
            patchItem(library, 'references', reference.id, (item) => ({
              ...item,
              image: {
                originalFile: result.originalFile ?? item.image?.originalFile ?? 'original.png',
                canvasFile: 'canvas.png',
                maskFile: 'mask.png',
                originalName: value.source!.name,
                canvasWidth: value.working!.width,
                canvasHeight: value.working!.height,
                referenceRect: value.referenceRect,
                outputRect: value.outputRect,
              },
              layout: value.layout,
              maskExpansionPx: value.expansionPx,
              backgroundThreshold: value.threshold,
              updatedAt: new Date().toISOString(),
            })),
          );
        } else {
          updateLibrary((library) =>
            patchItem(library, 'references', reference.id, (item) => ({ ...item, layout: value.layout })),
          );
        }
        dirty.current = false;
      },
      800,
    );
  }, [reference.id, rebuilding, source, layout, working, referenceRect, outputRect, expansionPx, threshold, mask]);

  const pickImage = () =>
    void run('이미지를 여는 중', async () => {
      const file = await fileApi().openImageFile();
      if (file) applySource(file.dataUrl, file.name);
    });

  if (loading) return <p className="hint pad">인페인트를 불러오는 중…</p>;

  const free = working
    ? checkFreeGeneration({ steps: Math.min(...presets.map((preset) => preset.generation.steps), 28) }, working.width, working.height)
    : undefined;
  const maskOk = mask ? maskHasGeneratePixels(mask) : false;
  const auto = layout.mode === 'auto';

  return (
    <div className="canvas-view">
      <aside className="canvas-settings">
        <PanelHeading title="참고 이미지" subtitle="" />
        <button className="import-card" onClick={pickImage}>
          <span className="file-icon image">IMG</span>
          <span>
            <b>{source ? source.name : '이미지 선택'}</b>
            <small>{source ? '클릭해서 교체 · 창에 드롭해도 됩니다' : 'PNG, JPG, WebP · 창에 드롭해도 됩니다'}</small>
          </span>
        </button>

        <PanelHeading title="캔버스 구성" />
        <div className="segmented full">
          <button className={auto ? 'active' : ''} onClick={() => changeLayout({ mode: 'auto' })}>
            자동 구성
          </button>
          <button className={!auto ? 'active' : ''} onClick={() => changeLayout({ mode: 'prepared' })}>
            직접 준비한 캔버스
          </button>
        </div>
        {auto ? (
          <>
            <SelectField
              label="해상도 (NovelAI에 보내는 전체 캔버스)"
              value={layout.resolution}
              options={[
                ...RESOLUTION_PRESETS.map((item) => ({ value: item.id, label: `${item.label} (무료)` })),
                { value: 'custom' as const, label: '커스텀' },
              ]}
              onChange={(resolution) => {
                const preset = RESOLUTION_PRESETS.find((item) => item.id === resolution);
                changeLayout(preset ? { resolution, width: preset.width, height: preset.height } : { resolution });
              }}
            />
            {layout.resolution === 'custom' && (
              <>
                <SettingRow label="가로" unit="px">
                  <Stepper
                    label="가로"
                    value={layout.width}
                    min={CUSTOM_MIN}
                    max={CUSTOM_MAX}
                    step={64}
                    onChange={(width) => changeLayout({ width: snapDimension(width) })}
                  />
                </SettingRow>
                <SettingRow label="세로" unit="px">
                  <Stepper
                    label="세로"
                    value={layout.height}
                    min={CUSTOM_MIN}
                    max={CUSTOM_MAX}
                    step={64}
                    onChange={(height) => changeLayout({ height: snapDimension(height) })}
                  />
                </SettingRow>
              </>
            )}
            <SelectField
              label="참고 이미지 위치"
              value={layout.referenceSide}
              options={SIDES}
              onChange={(referenceSide) => changeLayout({ referenceSide })}
            />
            <SettingRow
              label="참고 영역 비율"
              unit="%"
              title="캔버스에서 참고 이미지가 차지하는 몫입니다. 나머지가 결과 쪽 크기입니다."
            >
              <Stepper
                label="참고 영역 비율"
                value={Math.round(layout.referenceRatio * 100)}
                min={20}
                max={80}
                step={5}
                onChange={(percent) => changeLayout({ referenceRatio: percent / 100 })}
              />
            </SettingRow>
            <div className="two-column-fields">
              <SelectField
                label="이미지 맞춤"
                value={layout.fit}
                options={[
                  { value: 'contain', label: '전체 보이기' },
                  { value: 'cover', label: '꽉 채우기' },
                ]}
                onChange={(fit) => changeLayout({ fit })}
              />
              <SelectField
                label="세로 맞춤"
                value={layout.anchor}
                options={[
                  { value: 'top', label: '상단' },
                  { value: 'center', label: '중앙' },
                  { value: 'bottom', label: '하단' },
                ]}
                onChange={(anchor) => changeLayout({ anchor })}
              />
            </div>
            <SettingRow label="배경색">
              <input
                type="color"
                className="color-swatch"
                aria-label="배경색"
                value={layout.background}
                onChange={(event) => changeLayout({ background: event.target.value })}
              />
            </SettingRow>
          </>
        ) : (
          <>
            <p className="hint">
              참고 그림과 빈 칸이 이미 배치된 이미지를 씁니다. 배경을 감지해 참고 영역을 찾습니다.
            </p>
            <SettingRow label="배경 임계값">
              <Stepper
                label="배경 임계값"
                value={threshold}
                min={4}
                max={64}
                step={1}
                onChange={(value) => {
                  setThreshold(value);
                  scheduleRebuild(source, layout, value);
                }}
              />
            </SettingRow>
          </>
        )}
        <button
          className="with-icon full-width"
          disabled={!source || rebuilding}
          title="참고 영역·결과 영역·생성 영역을 처음 상태로 다시 만듭니다"
          onClick={() => source && void rebuild(source, layout, threshold)}
        >
          <Icon name="refresh" size={14} /> {auto ? '자동 배치로 되돌리기' : '배경 다시 감지'}
        </button>

        <PanelHeading title="영역" />
        <SettingRow label="참고 영역 여백" unit="px">
          <Stepper
            label="참고 영역 여백"
            value={expansionPx}
            min={0}
            max={64}
            step={4}
            onChange={(value) => {
              setExpansionPx(value);
              if (working) {
                // 자동 구성은 생성 영역 전체에서 다시 자르고, 직접 준비한 캔버스는 지금 크롭에서 겹치는 부분만 뺀다.
                const base =
                  layout.mode === 'auto' ? computeLayout(layout, 1, 1).generationArea : outputRect;
                setOutputRect(
                  cropOutside(
                    base,
                    expandRect(referenceRect, value, working.width, working.height),
                  ),
                );
              }
              dirty.current = true;
            }}
          />
        </SettingRow>
        <p className="hint">
          참고 영역 둘레를 이만큼 더 그대로 남깁니다. 결과 영역은 그 바깥에서 자릅니다.
        </p>
        {working && (
          <details className="crop-details">
            <summary>결과 영역 숫자로 맞추기</summary>
            <div className="two-column-fields">
              {CROP_FIELDS.map(({ key, label }) => (
                <SettingRow key={key} label={label}>
                  <Stepper
                    label={`결과 영역 ${label}`}
                    value={Math.round(outputRect[key])}
                    min={key === 'width' || key === 'height' ? 16 : 0}
                    max={key === 'x' || key === 'width' ? working.width : working.height}
                    step={8}
                    onChange={(value) => {
                      setOutputRect(
                        clampRect(
                          { ...outputRect, [key]: value },
                          working.width,
                          working.height,
                          16,
                        ),
                      );
                      dirty.current = true;
                    }}
                  />
                </SettingRow>
              ))}
            </div>
          </details>
        )}
      </aside>

      <section className="canvas-panel">
        {working ? (
          <ReferenceCanvas
            key={`${working.width}x${working.height}`}
            image={working.canvas}
            width={working.width}
            height={working.height}
            backgroundMask={working.backgroundMask}
            referenceRect={referenceRect}
            outputRect={outputRect}
            expansionPx={expansionPx}
            initialMask={initialMask}
            detectionLabel={rebuilding ? '다시 구성하는 중…' : working.detectionLabel}
            status={
              <>
                <span title="NovelAI에는 캔버스 전체를 보내고, 결과 영역만 잘라 저장합니다">
                  저장 {Math.round(outputRect.width)}×{Math.round(outputRect.height)}
                </span>
                {free?.free ? (
                  <span
                    className="ok"
                    title="Opus 무료 크기 기준(1024×1024 이하 면적)을 충족합니다"
                  >
                    무료 크기
                  </span>
                ) : (
                  free?.reasons.map((reason) => (
                    <span key={reason} className="warn">
                      ⚠ {reason}
                    </span>
                  ))
                )}
                {!maskOk && <span className="warn">⚠ 생성 영역(청록색)이 비어 있습니다</span>}
              </>
            }
            onReferenceRectChange={(rect) => {
              setReferenceRect(rect);
              setOutputRect((current) =>
                cropOutside(current, expandRect(rect, expansionPx, working.width, working.height)),
              );
              setInitialMask(undefined);
              dirty.current = true;
            }}
            onOutputRectChange={(rect) => {
              setOutputRect(rect);
              dirty.current = true;
            }}
            onMaskChange={handleMaskChange}
          />
        ) : (
          <EmptyState title="참고 이미지가 필요합니다">
            <p>캐릭터 이미지 한 장을 선택하면 NovelAI 무료 해상도에 맞춰 참고 이미지와 생성 영역을 자동으로 배치합니다.</p>
            <button className="accent" onClick={pickImage}>
              이미지 선택
            </button>
          </EmptyState>
        )}
      </section>
    </div>
  );
}

function SettingRow(props: { label: string; unit?: string; title?: string; children: ReactNode }) {
  return (
    <div className="setting-row" title={props.title}>
      <span>{props.label}</span>
      <span>
        {props.children}
        {props.unit}
      </span>
    </div>
  );
}
