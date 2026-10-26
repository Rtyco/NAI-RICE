import type { AppSettings } from '../core/domain/types';
import { DEFAULT_SETTINGS } from '../core/model/defaults';
import { useStore } from './store';

export type UiOption = keyof Pick<
  AppSettings['layout'],
  | 'simpleUi'
  | 'chipEdit'
  | 'chipNames'
  | 'refineChip'
  | 'welcomeChips'
  | 'narrowOverlay'
  | 'iconFolders'
>;

const fallback = DEFAULT_SETTINGS.layout;

export const useUiOption = (key: UiOption): boolean =>
  useStore((state) => state.library?.settings.layout[key] ?? fallback[key]);

export const uiOption = (key: UiOption): boolean =>
  useStore.getState().library?.settings.layout[key] ?? fallback[key];
