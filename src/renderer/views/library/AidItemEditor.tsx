import type { CharacterReference, Picture, Vibe } from '../../../core/domain/types';
import { patchItem } from '../../../core/model/mutations';
import { Icon } from '../../components/Icon';
import { REFERENCE_TARGETS } from '../../../core/providers/NaiModels';
import { Card, NumberField, SelectField } from '../../components/ui';
import { fileApi, libraryApi } from '../../desktop';
import { pictureMedia, run, updateLibrary } from '../../store';

/** 캐릭터 레퍼런스·바이브의 그림 카드. 그림을 바꾸면 이전 그림 파일은 다른 항목이 함께 쓸 수 있어 남겨 둔다. */
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
      <Card
        title="값"
        subtitle="작업의 일반 생성에서 이 캐릭터 레퍼런스를 고르면 그림의 캐릭터나 그림체를 따라 그립니다"
      >
        <div className="two-column-fields">
          <NumberField
            label="충실도 (Fidelity)"
            value={item.fidelity}
            min={0}
            max={1}
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
        <p className="hint">
          V4.5 모델 전용입니다. Opus여도 한 장에 5 Anlas가 들고, 바이브와 함께 쓸 수 없습니다.
          그림은 비율이 가까운 캔버스(1024×1536·1536×1024·1472×1472)에 검은 여백으로 맞춰 보냅니다.
        </p>
      </Card>
    </>
  );
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
  return (
    <>
      <PictureCard image={item.image} onChange={(image) => save({ image })} />
      <Card
        title="값"
        subtitle="작업에서 이 바이브를 고르면 그림의 분위기·그림체를 따라갑니다(일반 생성·인페인트)"
      >
        <div className="two-column-fields">
          <NumberField
            label="세기 (Strength)"
            value={item.strength}
            min={0}
            max={1}
            step={0.05}
            onChange={(strength) => save({ strength })}
          />
          <NumberField
            label="정보 추출 (Information Extracted)"
            value={item.informationExtracted}
            min={0}
            max={1}
            step={0.05}
            onChange={(informationExtracted) => save({ informationExtracted })}
          />
        </div>
        <p className="hint">
          V4.5 모델 전용입니다. 작업에서 바이브 여러 개를 함께 쓸 수 있고, 4개를 넘으면 넘는
          바이브마다 한 장에 2 Anlas가 듭니다. 처음 생성할 때 그림을 인코딩해 2 Anlas가 들고, 같은
          그림·모델·정보 추출 값이면 인코딩 결과를 다시 씁니다. 그림이나 정보 추출 값을 바꾸면 다시
          인코딩합니다.
        </p>
      </Card>
    </>
  );
}
