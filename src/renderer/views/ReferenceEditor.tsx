import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  CanvasLayout,
  DividerLine,
  FreePlacement,
  Rect,
  Reference,
  ReferenceSide,
} from '../../core/domain/types';
import {
  computeLayout,
  CUSTOM_MAX,
  CUSTOM_MIN,
  freePlacementOf,
  imageBoxOf,
  resolveResolution,
  RESOLUTION_PRESETS,
  snapDimension,
} from '../../core/imaging/CanvasLayout';
import { normalizeCanvasSize } from '../../core/imaging/CanvasNormalizer';
import type { ImageBox } from '../../core/imaging/FreeTransform';
import { dividerPixels } from '../../core/imaging/Divider';
import { maskHasGeneratePixels } from '../../core/imaging/MaskBuilder';
import { cropOutside, suggestOutputRect } from '../../core/imaging/OutputCropper';
import { clampRect, expandRect } from '../../core/imaging/rects';
import { effectiveGenerationSettings } from '../../core/model/defaults';
import { patchItem } from '../../core/model/mutations';
import { checkFreeGeneration } from '../../core/providers/NaiCost';
import { confirmDialog } from '../components/Dialogs';
import { DrawCanvas } from '../components/DrawCanvas';
import { PanelResizer } from '../components/PanelResizer';
import { ReferenceCanvas } from '../components/ReferenceCanvas';
import { Icon } from '../components/Icon';
import { Stepper } from '../components/Stepper';
import { EmptyState, SelectField, Toggle } from '../components/ui';
import type { CanvasImage } from '../lib/image';
import {
  composeCanvas,
  decodeMask,
  finalCanvasDataUrl,
  imageSizeOf,
  isBlank,
  layoutMaskFor,
  loadCanvas,
  loadOriginal,
  maskToDataUrl,
  masksEqual,
  prepareImage,
  repaintComposed,
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

/** 영역이 그대로인 값. 다시 구성하면 붓으로 고친 마스크와 결과 영역이 초기화된다. */
const REPAINT_KEYS: ReadonlySet<string> = new Set<keyof CanvasLayout>(['background', 'fit', 'anchor', 'free']);

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
  // 재구성은 비동기로 끝나 그때의 값을 ref로 읽는다.
  const expansionRef = useRef(expansionPx);
  expansionRef.current = expansionPx;
  const [threshold, setThreshold] = useState(reference.backgroundThreshold);
  const [divider, setDivider] = useState<DividerLine>(reference.divider);
  const [initialMask, setInitialMask] = useState<Uint8Array>();
  const [mask, setMask] = useState<Uint8Array>();
  const savedMask = useRef<Uint8Array | undefined>(undefined);
  const dirty = useRef(false);
  const queuedRebuild = useRef<[Source, CanvasLayout, number] | null>(null);
  const rebuildRunning = useRef(false);
  const rebuildSeq = useRef(0);
  /** 캔버스 객체는 그대로라 이 값으로 다시 그리게 한다. */
  const [imageVersion, setImageVersion] = useState(0);
  const queuedRepaint = useRef<CanvasLayout | null>(null);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement>();
  const [stage, setStage] = useState<'mask' | 'draw'>('mask');
  /** 그린 것이 없으면 undefined. 저장 전까지 PNG로 바꾸지 않는다. */
  const [paint, setPaint] = useState<HTMLCanvasElement>();
  const paintChanged = useRef(false);
  const transformStart = useRef<CanvasLayout | null>(null);
  const repaintRunning = useRef(false);

  useEffect(() => {
    if (!reference.image) return;
    let active = true;
    void (async () => {
      try {
        const image = reference.image!;
        const images = await libraryApi().readReferenceImages(reference);
        if (!images || !active) return;
        const loadedMask = await decodeMask(images.maskDataUrl, image.canvasWidth, image.canvasHeight);
        const loadedPaint = images.paintDataUrl ? await loadCanvas(images.paintDataUrl) : undefined;
        // canvas.png에 층이 합쳐져 있으면 원본에서 base를 다시 만든다.
        const layered = reference.divider.enabled || Boolean(loadedPaint);
        let canvas: CanvasImage;
        let backgroundMask: Uint8Array;
        let detectionLabel = '저장된 마스크';
        if (reference.layout.mode === 'auto') {
          backgroundMask = layoutMaskFor(reference.layout);
          const composed = layered ? await composeCanvas(images.originalDataUrl, reference.layout) : undefined;
          canvas =
            composed && composed.width === image.canvasWidth && composed.height === image.canvasHeight
              ? composed.canvas
              : await loadCanvas(images.canvasDataUrl);
        } else {
          const prepared = await prepareImage(
            layered ? images.originalDataUrl : images.canvasDataUrl,
            reference.backgroundThreshold,
          );
          canvas = prepared.canvas;
          backgroundMask = prepared.backgroundMask;
          detectionLabel = `저장된 마스크 · ${detectionText(prepared.detection.mode, prepared.detection.confidence)}`;
        }
        if (!active) return;
        savedMask.current = loadedMask;
        setPaint(loadedPaint);
        setSource({ dataUrl: images.originalDataUrl, name: image.originalName, changed: false });
        setWorking({
          canvas,
          width: image.canvasWidth,
          height: image.canvasHeight,
          backgroundMask,
          detectionLabel,
        });
        setInitialMask(loadedMask);
        // 예전 버전의 크롭이 보호 영역과 겹치면 바깥으로 맞춘다.
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
    // key로 레퍼런스마다 새로 마운트된다.
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

  // 진행 중이면 마지막 값만 남겼다가 끝나는 즉시 잇는다. 일정 시간 기다리는 방식은 늦게 따라와 답답하다.
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

  /** 캔버스 크기가 바뀌면 그린 층을 맞출 수 없어 지운다. */
  const keepsPaint = async (next: CanvasLayout, image?: { width: number; height: number }) => {
    const size =
      next.mode === 'auto'
        ? resolveResolution(next)
        : image && normalizeCanvasSize(image.width, image.height, 64);
    if (!paint || !size || isBlank(paint)) return true;
    if (size.width === paint.width && size.height === paint.height) return true;
    return confirmDialog({
      title: '그린 내용 지우기',
      message: '캔버스 크기가 바뀌어 그리기 탭에서 그린 내용이 지워집니다.',
      confirmLabel: '지우고 바꾸기',
      danger: true,
    });
  };

  const sourceSize = sourceImage && {
    width: sourceImage.naturalWidth,
    height: sourceImage.naturalHeight,
  };

  const applySource = async (dataUrl: string, name: string) => {
    if (layout.mode === 'prepared' && !(await keepsPaint(layout, await imageSizeOf(dataUrl))))
      return;
    const next = { dataUrl, name, changed: true };
    setSource(next);
    void rebuild(next, layout, threshold);
  };

  const changeCanvasSize = async (patch: Partial<CanvasLayout>) => {
    if (await keepsPaint({ ...layout, ...patch }, sourceSize)) changeLayout(patch);
  };

  useEffect(() => {
    if (!paint || !working) return;
    if (paint.width === working.width && paint.height === working.height) return;
    setPaint(undefined);
    paintChanged.current = true;
    dirty.current = true;
  }, [paint, working]);

  const changePaint = useCallback((layer: HTMLCanvasElement) => {
    setPaint(layer);
    paintChanged.current = true;
    dirty.current = true;
  }, []);

  const showStage = (next: 'mask' | 'draw') => {
    // 마스크 편집기는 다시 열릴 때 이 마스크에서 붓으로 고친 곳을 되찾는다.
    if (next === 'draw') setInitialMask(mask);
    setStage(next);
  };

  const applySourceRef = useRef(applySource);
  applySourceRef.current = applySource;
  useEffect(() => {
    if (!pendingReference || pendingReference.referenceId !== reference.id || loading) return;
    setPendingReference(undefined);
    void applySourceRef.current(pendingReference.dataUrl, pendingReference.name);
  }, [pendingReference, reference.id, loading]);

  /** 프레임마다 한 번 */
  const repaint = (canvas: HTMLCanvasElement, dataUrl: string, next: CanvasLayout) => {
    queuedRepaint.current = next;
    if (repaintRunning.current) return;
    repaintRunning.current = true;
    void (async () => {
      try {
        for (let target = queuedRepaint.current; target; target = queuedRepaint.current) {
          queuedRepaint.current = null;
          await repaintComposed(canvas, dataUrl, target);
          setImageVersion((version) => version + 1);
          await new Promise(requestAnimationFrame);
        }
      } catch (error) {
        toast(`캔버스를 다시 칠할 수 없습니다: ${errorMessage(error)}`, 'error');
      } finally {
        repaintRunning.current = false;
      }
    })();
  };

  const changeLayout = (patch: Partial<CanvasLayout>) => {
    const next = { ...layout, ...patch };
    setLayout(next);
    dirty.current = true;
    if (
      Object.keys(patch).every((key) => REPAINT_KEYS.has(key)) &&
      next.mode === 'auto' &&
      source &&
      working?.canvas instanceof HTMLCanvasElement &&
      !rebuildRunning.current
    )
      repaint(working.canvas, source.dataUrl, next);
    else scheduleRebuild(source, next, threshold);
  };

  const sourceUrl = source?.dataUrl;
  useEffect(() => {
    if (!sourceUrl) return;
    let active = true;
    loadOriginal(sourceUrl)
      .then((image) => active && setSourceImage(image))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [sourceUrl]);

  const composedLayout = useMemo(
    () =>
      layout.mode === 'auto' && sourceImage
        ? computeLayout(layout, sourceImage.naturalWidth, sourceImage.naturalHeight)
        : undefined,
    [layout, sourceImage],
  );
  const imageBox = useMemo(() => composedLayout && imageBoxOf(composedLayout), [composedLayout]);

  const placeImage = (box: ImageBox) => {
    if (!composedLayout || !sourceImage) return;
    changeLayout({
      fit: 'free',
      free: freePlacementOf(
        box,
        composedLayout.referenceArea,
        sourceImage.naturalWidth,
        sourceImage.naturalHeight,
      ),
    });
  };

  const changeFree = (patch: Partial<FreePlacement>) => {
    if (layout.free) changeLayout({ free: { ...layout.free, ...patch } });
  };

  /** 회전과 반전은 그대로 두고 크기와 위치만 맞춘다. */
  const fitImage = (fit: 'contain' | 'cover') => {
    if (!sourceImage || !imageBox) return;
    const fitted = computeLayout(
      { ...layout, fit, anchor: 'center' },
      sourceImage.naturalWidth,
      sourceImage.naturalHeight,
    );
    placeImage({ ...imageBoxOf(fitted), rotation: imageBox.rotation, flipX: imageBox.flipX });
  };

  const handleMaskChange = useCallback((data: Uint8Array) => {
    setMask(data);
    if (!masksEqual(data, savedMask.current)) dirty.current = true;
  }, []);

  const changeDivider = (patch: Partial<DividerLine>) => {
    setDivider((current) => ({ ...current, ...patch }));
    dirty.current = true;
  };

  const latest = useRef({ source, layout, working, referenceRect, outputRect, expansionPx, threshold, mask, divider, paint });
  latest.current = { source, layout, working, referenceRect, outputRect, expansionPx, threshold, mask, divider, paint };

  useEffect(() => {
    if (!dirty.current || rebuilding) return;
    scheduleSave(
      `reference:${reference.id}`,
      async () => {
        const value = latest.current;
        if (value.working && value.mask && value.source && value.mask.length === value.working.width * value.working.height) {
          const { width, height } = value.working;
          const painted = value.paint && !isBlank(value.paint) ? value.paint : undefined;
          const paintSaved = paintChanged.current;
          paintChanged.current = false;
          const result = await libraryApi().saveReferenceImages({
            referenceId: reference.id,
            originalDataUrl: value.source.changed ? value.source.dataUrl : undefined,
            paintDataUrl: paintSaved ? (painted?.toDataURL('image/png') ?? null) : undefined,
            canvasDataUrl: finalCanvasDataUrl(value.working.canvas, width, height, {
              paint: painted,
              divider: value.divider.enabled
                ? { pixels: dividerPixels(value.mask, width, height, value.divider.widthPx), color: value.divider.color }
                : undefined,
            }),
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
                paintFile: painted ? 'paint.png' : undefined,
              },
              layout: value.layout,
              divider: value.divider,
              maskExpansionPx: value.expansionPx,
              backgroundThreshold: value.threshold,
              updatedAt: new Date().toISOString(),
            })),
          );
        } else {
          updateLibrary((library) =>
            patchItem(library, 'references', reference.id, (item) => ({
              ...item,
              layout: value.layout,
              divider: value.divider,
            })),
          );
        }
        dirty.current = false;
      },
      800,
    );
  }, [reference.id, rebuilding, source, layout, working, referenceRect, outputRect, expansionPx, threshold, mask, divider, paint]);

  const pickImage = () =>
    void run('이미지를 여는 중', () => fileApi().openImageFile()).then(
      (file) => file && applySource(file.dataUrl, file.name),
    );

  if (loading) return <p className="hint pad">인페인트를 불러오는 중…</p>;

  const free = working
    ? checkFreeGeneration({ steps: Math.min(...presets.map((preset) => effectiveGenerationSettings(preset.generation).steps), 28) }, working.width, working.height)
    : undefined;
  const maskOk = mask ? maskHasGeneratePixels(mask) : false;
  const auto = layout.mode === 'auto';

  return (
    <div className="canvas-view">
      <section className="canvas-panel">
        {working && (
          <div className="segmented stage-tabs" role="group" aria-label="편집할 것">
            <button
              className={stage === 'mask' ? 'active' : ''}
              aria-pressed={stage === 'mask'}
              onClick={() => showStage('mask')}
            >
              <Icon name="brush" size={14} /> 영역·마스크
            </button>
            <button
              className={stage === 'draw' ? 'active' : ''}
              aria-pressed={stage === 'draw'}
              title="i2i 그리기처럼 캔버스에 덧칠합니다. 그린 것은 NovelAI에 보내는 캔버스에 합쳐집니다."
              onClick={() => showStage('draw')}
            >
              <Icon name="pen" size={14} /> 그리기
            </button>
          </div>
        )}
        <div className="canvas-stage">
          {working && stage === 'draw' ? (
            <DrawCanvas
              key={`${working.width}x${working.height}`}
              base={working.canvas}
              baseVersion={imageVersion}
              width={working.width}
              height={working.height}
              initialLayer={paint}
              onLayerChange={changePaint}
            />
          ) : working ? (
            <ReferenceCanvas
              key={`${working.width}x${working.height}`}
              image={working.canvas}
              paint={paint}
              imageVersion={imageVersion}
              width={working.width}
              height={working.height}
              backgroundMask={working.backgroundMask}
              referenceRect={referenceRect}
              outputRect={outputRect}
              expansionPx={expansionPx}
              initialMask={initialMask}
              divider={divider.enabled ? divider : undefined}
              transform={
                imageBox && sourceImage
                  ? {
                      box: imageBox,
                      image: sourceImage,
                      onBegin: () => (transformStart.current = layout),
                      onChange: placeImage,
                      onCancel: () => {
                        const start = transformStart.current;
                        if (start)
                          changeLayout({ fit: start.fit, anchor: start.anchor, free: start.free });
                      },
                    }
                  : undefined
              }
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
        </div>
      </section>

      <aside className="canvas-settings">
        <section className="detail-card settings-card">
          <div className="detail-card-head">
            <b>참고 이미지</b>
          </div>
          <button className="import-card" onClick={pickImage}>
            <span className="file-icon image">IMG</span>
            <span>
              <b>{source ? source.name : '이미지 선택'}</b>
              <small>{source ? '클릭해서 교체 · 창에 드롭해도 됩니다' : 'PNG, JPG, WebP · 창에 드롭해도 됩니다'}</small>
            </span>
          </button>
        </section>

        <section className="detail-card settings-card">
          <div className="detail-card-head">
            <b>캔버스 구성</b>
          </div>
          <div className="segmented full">
            <button className={auto ? 'active' : ''} onClick={() => void changeCanvasSize({ mode: 'auto' })}>
              자동 구성
            </button>
            <button className={!auto ? 'active' : ''} onClick={() => void changeCanvasSize({ mode: 'prepared' })}>
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
                  void changeCanvasSize(
                    preset ? { resolution, width: preset.width, height: preset.height } : { resolution },
                  );
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
                      onChange={(width) => void changeCanvasSize({ width: snapDimension(width) })}
                    />
                  </SettingRow>
                  <SettingRow label="세로" unit="px">
                    <Stepper
                      label="세로"
                      value={layout.height}
                      min={CUSTOM_MIN}
                      max={CUSTOM_MAX}
                      step={64}
                      onChange={(height) => void changeCanvasSize({ height: snapDimension(height) })}
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
                    { value: 'free', label: '자유 배치' },
                  ]}
                  onChange={(fit) => {
                    if (fit !== 'free') changeLayout({ fit });
                    else if (imageBox) placeImage(imageBox);
                  }}
                />
                {layout.fit !== 'free' && (
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
                )}
              </div>
              {layout.fit === 'free' && layout.free && (
                <FreePlacementFields
                  free={layout.free}
                  onChange={changeFree}
                  onFit={fitImage}
                />
              )}
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
              <p className="hint">배경을 감지해 참고 영역을 찾습니다.</p>
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
        </section>

        <section className="detail-card settings-card">
          <div className="detail-card-head">
            <b>영역</b>
          </div>
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
          <p className="hint">결과 영역은 이 여백 바깥에서 자릅니다.</p>
          <div title="생성 영역 바로 바깥에 선을 그어 따로 나뉜 칸임을 알립니다. 선은 다시 그리지 않습니다.">
            <Toggle label="분리선" checked={divider.enabled} onChange={(enabled) => changeDivider({ enabled })} />
          </div>
          {divider.enabled && (
            <>
              <SettingRow label="선 색">
                <input
                  type="color"
                  className="color-swatch"
                  aria-label="분리선 색"
                  value={divider.color}
                  onChange={(event) => changeDivider({ color: event.target.value })}
                />
              </SettingRow>
              <SettingRow label="선 두께" unit="px" title="NovelAI 마스크 한 칸(8px) 단위입니다">
                <Stepper
                  label="선 두께"
                  value={divider.widthPx}
                  min={8}
                  max={32}
                  step={8}
                  onChange={(widthPx) => changeDivider({ widthPx: Math.max(8, Math.min(32, Math.round(widthPx / 8) * 8)) })}
                />
              </SettingRow>
            </>
          )}
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
        </section>
      </aside>
      <PanelResizer panel="side-panel" />
    </div>
  );
}

function FreePlacementFields(props: {
  free: FreePlacement;
  onChange: (patch: Partial<FreePlacement>) => void;
  onFit: (fit: 'contain' | 'cover') => void;
}) {
  const { free, onChange } = props;
  return (
    <>
      <div>
        <SettingRow label="가로 위치" unit="%" title="참고 영역 안에서 이미지 중심의 위치입니다">
          <Stepper
            label="가로 위치"
            value={Math.round(free.x * 100)}
            min={-100}
            max={200}
            step={1}
            onChange={(percent) => onChange({ x: percent / 100 })}
          />
        </SettingRow>
        <SettingRow label="세로 위치" unit="%">
          <Stepper
            label="세로 위치"
            value={Math.round(free.y * 100)}
            min={-100}
            max={200}
            step={1}
            onChange={(percent) => onChange({ y: percent / 100 })}
          />
        </SettingRow>
        <SettingRow label="가로 크기" unit="%" title="100%가 전체 보이기 크기입니다">
          <Stepper
            label="가로 크기"
            value={Math.round(free.scaleX * 100)}
            min={5}
            max={1000}
            step={5}
            onChange={(percent) => onChange({ scaleX: percent / 100 })}
          />
        </SettingRow>
        <SettingRow label="세로 크기" unit="%">
          <Stepper
            label="세로 크기"
            value={Math.round(free.scaleY * 100)}
            min={5}
            max={1000}
            step={5}
            onChange={(percent) => onChange({ scaleY: percent / 100 })}
          />
        </SettingRow>
        <SettingRow label="회전" unit="°">
          <Stepper
            label="회전"
            value={Math.round(free.rotation)}
            min={-180}
            max={180}
            step={1}
            onChange={(rotation) => onChange({ rotation })}
          />
        </SettingRow>
        <Toggle label="좌우 반전" checked={free.flipX} onChange={(flipX) => onChange({ flipX })} />
      </div>
      <div className="button-row">
        <button onClick={() => props.onFit('contain')}>전체 보이기로</button>
        <button onClick={() => props.onFit('cover')}>꽉 채우기로</button>
        <button onClick={() => onChange({ x: 0.5, y: 0.5 })}>가운데로</button>
      </div>
    </>
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
