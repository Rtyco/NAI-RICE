import type { AppSettings } from '../../../core/domain/types';
import { updateLibrary } from '../../store';

export function patchSettings(recipe: (settings: AppSettings) => AppSettings) {
  updateLibrary((library) => ({ ...library, settings: recipe(library.settings) }));
}

export function patchLayout(value: Partial<AppSettings['layout']>) {
  patchSettings((current) => ({ ...current, layout: { ...current.layout, ...value } }));
}
