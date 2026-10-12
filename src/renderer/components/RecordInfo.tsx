import { Fragment, useEffect, useState } from 'react';
import type { GenerationKind, GenerationRecord, GenerationSummary } from '../../core/domain/types';
import { AUGMENT_STRENGTHS, augmentToolInfo, moodLabel } from '../../core/providers/NaiAugment';
import { modelLabel, referenceTargetLabel, usesMedium } from '../../core/providers/NaiModels';
import { libraryApi } from '../desktop';
import { projectMedia } from '../store';

const KIND_LABELS: Record<GenerationKind, string> = {
  inpaint: '인페인트',
  txt2img: '일반 생성',
  img2img: 'i2i',
  augment: '디렉터 툴',
};

/** 선택한 결과의 생성 정보. 목록에는 프롬프트가 없어서, 열 때 기록 하나를 통째로 받아 온다. */
export function RecordInfo({
  projectId,
  record,
}: {
  projectId: string;
  record: GenerationSummary;
}) {
  const [full, setFull] = useState<GenerationRecord | null>();
  useEffect(() => {
    let alive = true;
    setFull(undefined);
    libraryApi()
      .getGeneration(projectId, record.id)
      .then((value) => alive && setFull(value))
      .catch(() => alive && setFull(null));
    return () => {
      alive = false;
    };
  }, [projectId, record.id]);
  const prompt = (pick: (value: GenerationRecord) => string) =>
    full === undefined ? '불러오는 중…' : full === null ? '읽을 수 없습니다' : pick(full);
  return (
    <dl className="record-info">
      <dt>생성 시각</dt>
      <dd>{new Date(record.createdAt).toLocaleString()}</dd>
      <dt>Seed</dt>
      <dd>{record.seed}</dd>
      <dt>방식</dt>
      <dd>
        {KIND_LABELS[record.kind]}
        {record.augment && ` · ${augmentToolInfo(record.augment.tool).label}`}
        {record.augment?.parts && ` · ${(record.augment.part ?? 0) + 1}/${record.augment.parts}장`}
      </dd>
      {record.aid && (
        <>
          <dt>참고 방식</dt>
          <dd>
            {record.aid.kind === 'character'
              ? `캐릭터 레퍼런스 「${record.aid.name}」 · ${referenceTargetLabel(record.aid.target)} · 충실도 ${record.aid.fidelity}`
              : record.aid.vibes.map((vibe, index) => (
                  <div key={index}>
                    바이브 「{vibe.name}」 · 세기 {vibe.strength} · 정보 추출{' '}
                    {vibe.informationExtracted}
                  </div>
                ))}
          </dd>
        </>
      )}
      {record.augment?.mood && (
        <>
          <dt>표정</dt>
          <dd>{moodLabel(record.augment.mood)}</dd>
        </>
      )}
      {record.augment && augmentToolInfo(record.augment.tool).strength && (
        <>
          <dt>강도</dt>
          <dd>{AUGMENT_STRENGTHS[record.augment.defry ?? 0]}</dd>
        </>
      )}
      {record.augment?.toolPrompt && (
        <>
          <dt>툴 프롬프트</dt>
          <dd className="mono">{record.augment.toolPrompt}</dd>
        </>
      )}
      {record.inputFile && (
        <>
          <dt>입력 이미지</dt>
          <dd>
            <img
              className="record-input"
              src={projectMedia(projectId, record.inputFile)}
              alt=""
              title="NovelAI에 실제로 보낸 입력(목표 크기로 맞춘 것)"
            />
          </dd>
        </>
      )}
      <dt>모델</dt>
      <dd>
        {modelLabel(record.model)}
        {full && usesMedium(full.settings) && ' · Effort Medium'}
      </dd>
      <dt>크기</dt>
      <dd>
        {record.width}×{record.height}
      </dd>
      {record.anlasSpent !== undefined && (
        <>
          <dt>사용 Anlas</dt>
          <dd>{record.anlasSpent}</dd>
        </>
      )}
      <dt>조합</dt>
      <dd>
        {[
          record.presetName,
          `${record.characterName} / ${record.promptSetName}`,
          record.emotionSetName,
          record.referenceName,
        ]
          .filter(Boolean)
          .join(' → ')}
      </dd>
      <dt>씬 프롬프트</dt>
      <dd className="mono">{record.emotionPrompt || '—'}</dd>
      <dt>캐릭터 프롬프트</dt>
      <dd className="mono">{prompt((value) => value.characterPrompt)}</dd>
      {full?.extraCharacters?.map((character, index) => (
        <Fragment key={index}>
          <dt>{character.name || `캐릭터 ${index + 2}`}</dt>
          <dd className="mono">{character.prompt || '(비어 있음)'}</dd>
        </Fragment>
      ))}
      {full?.characterCenters && (
        <>
          <dt>캐릭터 위치</dt>
          <dd>
            {full.characterCenters
              .map((center) => `(${center.x.toFixed(2)}, ${center.y.toFixed(2)})`)
              .join(' · ')}
          </dd>
        </>
      )}
      <dt>공통 프롬프트</dt>
      <dd className="mono">{prompt((value) => value.prompt)}</dd>
      <dt>공통 네거티브</dt>
      <dd className="mono">{prompt((value) => value.negativePrompt)}</dd>
    </dl>
  );
}
