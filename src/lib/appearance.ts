export const COLORS = [
  { value: 'violet', label: 'パープル', swatch: '#805399' },
  { value: 'blue', label: 'ブルー', swatch: '#3975b8' },
  { value: 'green', label: 'グリーン', swatch: '#2d8269' },
  { value: 'rose', label: 'ローズ', swatch: '#b45378' },
  { value: 'orange', label: 'オレンジ', swatch: '#b86a32' },
  { value: 'slate', label: 'スレート', swatch: '#64748b' },
] as const;
export type Appearance = {
  color: (typeof COLORS)[number]['value'];
};
export const DEFAULT_APPEARANCE: Appearance = {
  color: 'violet',
};
export const APPEARANCE_KEY = 'times:appearance';

export const parseAppearance = (raw: string | null): Appearance => {
  try {
    const value = JSON.parse(raw ?? '{}');
    return {
      color: COLORS.some((color) => color.value === value?.color)
        ? value.color
        : DEFAULT_APPEARANCE.color,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
};

// Only the accent color is handled here. next-themes owns light/dark/system.
export const APPEARANCE_SCRIPT = `(() => {
  try {
    const saved = JSON.parse(localStorage.getItem('${APPEARANCE_KEY}') || '{}');
    document.documentElement.dataset.color = ${JSON.stringify(COLORS.map((color) => color.value))}.includes(saved?.color) ? saved.color : 'violet';
  } catch { document.documentElement.dataset.color = 'violet'; }
})();`;
