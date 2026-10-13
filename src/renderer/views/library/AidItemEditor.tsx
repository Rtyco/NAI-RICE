import { useEffect, useState } from 'react';
import type { CharacterReference, Picture, Vibe } from '../../../core/domain/types';
import type { VibeEncodingInfo } from '../../../shared/ipc';
import { patchItem } from '../../../core/model/mutations';
import { Icon } from '../../components/Icon';
import { NAI_MODELS, REFERENCE_TARGETS } from '../../../core/providers/NaiModels';
import { AID_VALUE_LIMIT } from '../../../core/validation/schemas';
import { Card, NumberField, SelectField } from '../../components/ui';
import { fileApi, libraryApi } from '../../desktop';
import { pictureMedia, run, updateLibrary } from '../../store';

/** 그림을 바꿔도 이전 파일은 다른 항목이 쓸 수 있어 남긴다. */
function PictureCard({ image, onChange }: { image?: Picture; onChange: (image: Picture) => void }) {
  const load = () =>
    void run('그림을 불러오는 중', async () => {
      const file = await fileApi().openImageFile();
      if (!file) return;
      const stored = await libraryApi().addPicture(file.dataUrl);
      onChange({ ...stored, name: file.name });
    });
  return (
    <Card
      title="그림"
      subtitle={image ? `${image.name} · ${image.width}×${image.height}` : '아직 없음'}
    >
      <div className="aid-picture">
        {image ? (
          <img src={pictureMedia(image.file)} alt="" />
        ) : (
          <span className="aid-picture-empty" />
        )}
        <button className="with-icon" onClick={load}>
          <Icon name="plus" size={14} /> {image ? '다른 그림 불러오기' : '파일에서 불러오기'}
        </button>
      </div>
    </Card>
  );
}

export function CharacterReferenceEditor({ item }: { item: CharacterReference }) {
  const save = (patch: Partial<CharacterReference>) =>
    updateLibrary((current) =>
      patchItem(current, 'characterReferences', item.id, (entry) => ({
        ...entry,
        ...patch,
        updatedAt: new Date().toISOString(),
      })),
    );
  return (
    <>
      <PictureCard image={item.image} onChange={(image) => save({ image })} />
      <Card title="값" subtitle="V4.5 전용 · Opus여도 장당 5 Anlas">
        <div className="four-column-fields three">
          <NumberField
            label="세기 (Strength)"
            value={item.strength}
            min={-AID_VALUE_LIMIT}
            max={AID_VALUE_LIMIT}
            step={0.05}
            onChange={(strength) => save({ strength })}
          />
          <NumberField
            label="충실도 (Fidelity)"
            value={item.fidelity}
            min={-AID_VALUE_LIMIT}
            max={AID_VALUE_LIMIT}
            step={0.05}
            onChange={(fidelity) => save({ fidelity })}
          />
          <SelectField
            label="따라 그리기"
            value={item.target}
            options={REFERENCE_TARGETS.map((target) => ({
              value: target.value,
              label: `${target.label} (${target.hint})`,
            }))}
            onChange={(target) => save({ target })}
          />
        </div>
      </Card>
    </>
  );
}

function generateModelLabel(model: string): string {
  return NAI_MODELS.find((item) => item.requestIds.generate === model)?.label ?? model;
}

export function VibeEditor({ item }: { item: Vibe }) {
  const save = (patch: Partial<Vibe>) =>
    updateLibrary((current) =>
      patchItem(current, 'vibes', item.id, (entry) => ({
        ...entry,
        ...patch,
        updatedAt: new Date().toISOString(),
      })),
    );
  const [encodings, setEncodings] = useState<VibeEncodingInfo[]>();
  useEffect(() => {
    let alive = true;
    libraryApi()
      .vibeEncodings({ image: item.image, encodingId: item.encodingId })
      .then((list) => alive && setEncodings(list))
      .catch(() => alive && setEncodings([]));
    return () => {
      alive = false;
    };
  }, [item.image, item.encodingId]);
  const encodedOnly = Boolean(item.encodingId);
  return (
    <>
      {/* 새 그림을 불러오면 다시 인코딩하는 보통 바이브가 된다. */}
      <PictureCard
        image={item.image}
        onChange={(image) => save({ image, encodingId: undefined })}
      />
      <Card title="값" subtitle="V4.5 전용 · 인코딩 2 Anlas · 5개째부터 장당 2 Anlas">
        <div className="two-column-fields">
          <NumberField
            label="세기 (Strength)"
            value={item.strength}
            min={-AID_VALUE_LIMIT}
            max={AID_VALUE_LIMIT}
            step={0.05}
            onChange={(strength) => save({ strength })}
          />
          <NumberField
            label="정보 추출 (Information Extracted)"
            value={item.informationExtracted}
            min={0}
            max={1}
            step={0.05}
            disabled={encodedOnly}
            onChange={(informationExtracted) => save({ informationExtracted })}
          />
        </div>
        {encodedOnly && (
          <p className="field-error">
            원본 그림 없이 인코딩만 가져온 바이브입니다. 아래의 저장된 인코딩과 같은 모델·정보 추출
            값으로만 쓸 수 있고, 위 그림은 보기용입니다. 원본 그림을 불러오면 보통 바이브가 됩니다.
          </p>
        )}
        <p className="hint">
          저장된 인코딩:{' '}
          {encodings === undefined
            ? '확인하는 중'
            : encodings.length
              ? encodings
                  .map(
                    (encoding) =>
                      `${generateModelLabel(encoding.model)} · 정보 추출 ${encoding.informationExtracted}`,
                  )
                  .join(', ')
              : '없음(처음 생성할 때 인코딩합니다)'}
        </p>
      </Card>
    </>
  );
}
