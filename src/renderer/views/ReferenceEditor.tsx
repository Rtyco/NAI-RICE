import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CanvasLayout,
  DividerLine,
  FreePlacement,
  Rect,
  Reference,
} from '../../core/domain/types';
import {
  computeLayout,
  freePlacementOf,
  imageBoxOf,
  resolveResolution,
} from '../../core/imaging/CanvasLayout';
import { normalizeCanvasSize } from '../../core/imaging/CanvasNormalizer';
import type { ImageBox } from '../../core/imaging/FreeTransform';
import { maskHasGeneratePixels } from '../../core/imaging/MaskBuilder';
import { cropOutside, suggestOutputRect } from '../../core/imaging/OutputCropper';
import { expandRect } from '../../core/imaging/rects';
import { effectiveGenerationSettings } from '../../core/model/defaults';
import { checkFreeGeneration } from '../../core/providers/NaiCost';
import { confirmDialog } from '../components/dialogStack';
import { DrawCanvas } from '../components/DrawCanvas';
import { SidePanelLayout } from '../components/SidePanel';
import { ReferenceCanvas } from '../components/ReferenceCanvas';
import { Icon } from '../components/Icon';
import { Stepper } from '../components/Stepper';
import { EmptyState } from '../components/ui';
import {
  composeCanvas,
  imageSizeOf,
  isBlank,
  loadOriginal,
  masksEqual,
  prepareImage,
  repaintComposed,
} from '../lib/image';
import { LatestOnly } from '../lib/LatestOnly';
import { errorMessage, run, scheduleSave, setPendingReference, toast, useStore } from '../store';
import { fileApi } from '../desktop';
import { CanvasLayoutCard } from './reference/CanvasLayoutCard';
import {
  DividerFields,
  InpaintRequestCard,
  OutputRectFields,
  SettingRow,
} from './reference/ReferenceFields';
import {
  canSaveImages,
  detectionText,
  loadReference,
  saveReferenceImages,
  saveReferenceLayout,
  type Source,
  type Working,
} from './reference/referenceStorage';

/** 영역이 그대로인 값. 다시 구성하면 붓으로 고친 마스크와 결과 영역이 초기화된다. */
const REPAINT_KEYS: ReadonlySet<string> = new Set<keyof CanvasLayout>([
  'background',
  'fit',
  'anchor',
  'free',
]);

type Repaint = { canvas: HTMLCanvasElement; dataUrl: string; layout: CanvasLayout };

export function ReferenceEditor({ reference }: { reference: Reference }) {
  const pendingReference = useStore((state) => state.pendingReference);
  const presets = useStore((state) => state.library?.presets ?? []);
  const [loading, setLoading] = useState(Boolean(reference.image));
  const [source, setSource] = useState<Source | null>(null);
  const [layout, setLayout] = useState<CanvasLayout>(reference.layout);
  const [working, setWorking] = useState<Working | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [referenceRect, setReferenceRect] = useState<Rect>(
    reference.image?.referenceRect ?? { x: 0, y: 0, width: 1, height: 1 },
  );
  const [outputRect, setOutputRect] = useState<Rect>(
    reference.image?.outputRect ?? { x: 0, y: 0, width: 1, height: 1 },
  );
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
  const rebuildSeq = useRef(0);
  /** 캔버스 객체는 그대로라 이 값으로 다시 그리게 한다. */
  const [imageVersion, setImageVersion] = useState(0);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement>();
  const [stage, setStage] = useState<'mask' | 'draw'>('mask');
  /** 그린 것이 없으면 undefined. 저장 전까지 PNG로 바꾸지 않는다. */
  const [paint, setPaint] = useState<HTMLCanvasElement>();
  const paintChanged = useRef(false);
  const transformStart = useRef<CanvasLayout | null>(null);

  // key로 레퍼런스마다 새로 마운트되니 처음 받은 것만 불러온다.
  const [mounted] = useState(reference);
  useEffect(() => {
    if (!mounted.image) return;
    let active = true;
    loadReference(mounted)
      .then((loaded) => {
        if (!loaded || !active) return;
        savedMask.current = loaded.mask;
        setPaint(loaded.paint);
        setSource(loaded.source);
        setWorking(loaded.working);
        setInitialMask(loaded.mask);
        if (loaded.fittedOutputRect) {
          setOutputRect(loaded.fittedOutputRect);
          dirty.current = true;
        }
      })
      .catch((error) => toast(`인페인트를 불러올 수 없습니다: ${errorMessage(error)}`, 'error'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [mounted]);

  const rebuild = useCallback(
    async (nextSource: Source, nextLayout: CanvasLayout, nextThreshold: number) => {
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
          const blocked = expandRect(
            composed.referenceRect,
            expansionRef.current,
            composed.width,
            composed.height,
          );
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
    },
    [],
  );

  const [rebuilds] = useState(
    () => new LatestOnly<[Source, CanvasLayout, number]>((args) => rebuild(...args)),
  );
  useEffect(() => () => rebuilds.clear(), [rebuilds]);
  const scheduleRebuild = (
    nextSource: Source | null,
    nextLayout: CanvasLayout,
    nextThreshold: number,
  ) => {
    if (nextSource) rebuilds.push([nextSource, nextLayout, nextThreshold]);
  };

  /** 프레임마다 한 번 */
  const [repaints] = useState(
    () =>
      new LatestOnly<Repaint>(async ({ canvas, dataUrl, layout: next }) => {
        try {
          await repaintComposed(canvas, dataUrl, next);
          setImageVersion((version) => version + 1);
        } catch (error) {
          toast(`캔버스를 다시 칠할 수 없습니다: ${errorMessage(error)}`, 'error');
        }
        await new Promise(requestAnimationFrame);
      }),
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

  const changeLayout = (patch: Partial<CanvasLayout>) => {
    const next = { ...layout, ...patch };
    setLayout(next);
    dirty.current = true;
    if (
      Object.keys(patch).every((key) => REPAINT_KEYS.has(key)) &&
      next.mode === 'auto' &&
      source &&
      working?.canvas instanceof HTMLCanvasElement &&
      !rebuilds.busy
    )
      repaints.push({ canvas: working.canvas, dataUrl: source.dataUrl, layout: next });
    else scheduleRebuild(source, next, threshold);
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

  const selectFit = (fit: CanvasLayout['fit']) => {
    if (fit !== 'free') changeLayout({ fit });
    else if (imageBox) placeImage(imageBox);
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

  const changeExpansion = (value: number) => {
    setExpansionPx(value);
    if (working) {
      // 자동 구성은 생성 영역 전체에서 다시 자르고, 직접 준비한 캔버스는 지금 크롭에서 겹치는 부분만 뺀다.
      const base = layout.mode === 'auto' ? computeLayout(layout, 1, 1).generationArea : outputRect;
      setOutputRect(
        cropOutside(base, expandRect(referenceRect, value, working.width, working.height)),
      );
    }
    dirty.current = true;
  };

  const latest = useRef({
    source,
    layout,
    working,
    referenceRect,
    outputRect,
    expansionPx,
    threshold,
    mask,
    divider,
    paint,
  });
  latest.current = {
    source,
    layout,
    working,
    referenceRect,
    outputRect,
    expansionPx,
    threshold,
    mask,
    divider,
    paint,
  };

  useEffect(() => {
    if (!dirty.current || rebuilding) return;
    scheduleSave(
      `reference:${reference.id}`,
      async () => {
        const value = latest.current;
        if (canSaveImages(value)) {
          const paintSaved = paintChanged.current;
          paintChanged.current = false;
          await saveReferenceImages(reference.id, value, paintSaved);
          if (value.source.changed) setSource({ ...value.source, changed: false });
          savedMask.current = value.mask;
        } else {
          saveReferenceLayout(reference.id, value);
        }
        dirty.current = false;
      },
      800,
    );
  }, [
    reference.id,
    rebuilding,
    source,
    layout,
    working,
    referenceRect,
    outputRect,
    expansionPx,
    threshold,
    mask,
    divider,
    paint,
  ]);

  const pickImage = () =>
    void run('이미지를 여는 중', () => fileApi().openImageFile()).then(
      (file) => file && applySource(file.dataUrl, file.name),
    );

  if (loading) return <p className="hint pad">인페인트를 불러오는 중…</p>;

  const free = working
    ? checkFreeGeneration(
        {
          steps: Math.min(
            ...presets.map((preset) => effectiveGenerationSettings(preset.generation).steps),
            28,
          ),
        },
        working.width,
        working.height,
      )
    : undefined;
  const maskOk = mask ? maskHasGeneratePixels(mask) : false;

  const settings = (
    <>
      <section className="detail-card settings-card">
        <div className="detail-card-head">
          <b>참고 이미지</b>
        </div>
        <button className="import-card" onClick={pickImage}>
          <span className="file-icon image">IMG</span>
          <span>
            <b>{source ? source.name : '이미지 선택'}</b>
            <small>
              {source
                ? '클릭해서 교체 · 창에 드롭해도 됩니다'
                : 'PNG, JPG, WebP · 창에 드롭해도 됩니다'}
            </small>
          </span>
        </button>
      </section>

      <CanvasLayoutCard
        layout={layout}
        threshold={threshold}
        canReset={Boolean(source) && !rebuilding}
        onCanvasSize={(patch) => void changeCanvasSize(patch)}
        onLayout={changeLayout}
        onFit={selectFit}
        onFree={changeFree}
        onFitFree={fitImage}
        onThreshold={(value) => {
          setThreshold(value);
          scheduleRebuild(source, layout, value);
        }}
        onReset={() => source && void rebuild(source, layout, threshold)}
      />

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
            onChange={changeExpansion}
          />
        </SettingRow>
        <DividerFields divider={divider} onChange={changeDivider} />
        {working && (
          <OutputRectFields
            rect={outputRect}
            width={working.width}
            height={working.height}
            onChange={(rect) => {
              setOutputRect(rect);
              dirty.current = true;
            }}
          />
        )}
      </section>

      <InpaintRequestCard reference={reference} />
    </>
  );

  return (
    <SidePanelLayout className="canvas-view" panelClassName="canvas-settings" panel={settings}>
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
                  <span>
                    저장 {Math.round(outputRect.width)}×{Math.round(outputRect.height)}
                  </span>
                  {free?.free ? (
                    <span className="ok" title="Opus 무료 크기 (1024×1024 이하)">
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
                  cropOutside(
                    current,
                    expandRect(rect, expansionPx, working.width, working.height),
                  ),
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
              <button className="accent" onClick={pickImage}>
                이미지 선택
              </button>
            </EmptyState>
          )}
        </div>
      </section>
    </SidePanelLayout>
  );
}
