import type { AppSettings } from '../../../core/domain/types';
import {
  DEFAULT_EXPORT_FILENAME_TEMPLATE,
  DEFAULT_OUTPUT_FILENAME_TEMPLATE,
  EXPORT_FILENAME_TOKENS,
  OUTPUT_FILENAME_TOKENS,
  renderOutputFilename,
  validateOutputFilenameTemplate,
} from '../../../core/output/OutputFilename';
import { LineFixFields } from '../../components/LineFixDialog';
import { EXPORT_SCOPES } from '../../exportPicks';
import { Card, NumberField, SelectField, TemplateField, Toggle } from '../../components/ui';
import { useLibrary } from '../../store';
import { patchSettings } from './patchSettings';

export function OutputTab() {
  const settings = useLibrary().settings;
  const template = settings.outputFilenameTemplate;
  const error = validateOutputFilenameTemplate(template);
  const preview = error
    ? ''
    : renderOutputFilename(template, {
        character: '아리아',
        emotion: '기쁨',
        emotionId: 'a1b2c3d4',
        variant: 1,
        seed: 1669366302,
        model: 'nai-diffusion-4-5-full-inpainting',
        createdAt: new Date().toISOString(),
      });
  const setTemplate = (value: string) =>
    patchSettings((current) => ({ ...current, outputFilenameTemplate: value }));
  const setExport = (value: Partial<AppSettings['export']>) =>
    patchSettings((current) => ({ ...current, export: { ...current.export, ...value } }));
  const exportTemplate = settings.export.filenameTemplate;
  const exportError = validateOutputFilenameTemplate(
    exportTemplate,
    Object.keys(EXPORT_FILENAME_TOKENS),
  );
  return (
    <>
      <Card title="결과 파일">
        <TemplateField
          label="파일명 규칙"
          value={template}
          tokens={OUTPUT_FILENAME_TOKENS.map((token) => [token])}
          initial={DEFAULT_OUTPUT_FILENAME_TEMPLATE}
          onChange={setTemplate}
        />
        {error ? (
          <p className="field-error">{error}</p>
        ) : (
          <p className="hint">
            미리보기:{' '}
            <code>
              {preview}.{settings.storageFormat === 'png' ? 'png' : 'webp'}
            </code>
          </p>
        )}
        <SelectField
          label="저장 형식 (결과·전체 캔버스)"
          value={settings.storageFormat}
          options={[
            { value: 'webp-lossless', label: 'WebP 무손실 (약 40% 작음)' },
            { value: 'png', label: 'PNG' },
          ]}
          onChange={(storageFormat) => patchSettings((current) => ({ ...current, storageFormat }))}
        />
        <Toggle
          label="결과를 지우기 전에 확인 (휴지통으로 이동)"
          checked={settings.confirmResultDelete}
          onChange={(confirmResultDelete) =>
            patchSettings((current) => ({ ...current, confirmResultDelete }))
          }
        />
        <Toggle
          label="생성에 쓴 전체 캔버스도 보관 (diagnostic 폴더)"
          checked={settings.keepDiagnosticCanvas}
          onChange={(keepDiagnosticCanvas) =>
            patchSettings((current) => ({ ...current, keepDiagnosticCanvas }))
          }
        />
      </Card>
      <Card title="내보내기 기본값">
        <div className="four-column-fields three">
          <SelectField
            label="형식"
            value={settings.export.format}
            options={[
              { value: 'png', label: 'PNG (메타데이터 유지)' },
              { value: 'webp', label: 'WebP' },
              { value: 'avif', label: 'AVIF' },
            ]}
            onChange={(format) => setExport({ format })}
          />
          <NumberField
            label="WebP·AVIF 품질"
            value={settings.export.quality}
            min={1}
            max={100}
            integer
            onChange={(quality) => setExport({ quality })}
          />
          <SelectField
            label="갤러리·내보내기 이미지"
            value={settings.export.target}
            options={[
              { value: 'favorite', label: '대표 (없으면 최신)' },
              { value: 'latest', label: '항상 최신' },
            ]}
            onChange={(target) => setExport({ target })}
          />
        </div>
        <SelectField
          label="내보낼 이미지"
          value={settings.export.scope}
          options={EXPORT_SCOPES.map((choice) => ({ value: choice.id, label: choice.label }))}
          onChange={(scope) => setExport({ scope })}
        />
        <TemplateField
          label="파일 이름"
          value={exportTemplate}
          tokens={Object.entries(EXPORT_FILENAME_TOKENS)}
          initial={DEFAULT_EXPORT_FILENAME_TEMPLATE}
          onChange={(filenameTemplate) => setExport({ filenameTemplate })}
        />
        {exportError && <p className="field-error">{exportError}</p>}
      </Card>
      <Card title="구분선 지우기">
        <LineFixFields
          value={settings.lineFix}
          onChange={(lineFix) => patchSettings((current) => ({ ...current, lineFix }))}
        />
      </Card>
    </>
  );
}
