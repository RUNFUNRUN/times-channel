import { describe, expect, test } from 'bun:test';
import { DEFAULT_APPEARANCE, parseAppearance } from '../src/lib/appearance';

describe('accent color preferences', () => {
  test('uses the default color for missing or corrupt storage', () => {
    for (const raw of [null, 'broken', 'null', '[]', '"string"'])
      expect(parseAppearance(raw)).toEqual(DEFAULT_APPEARANCE);
  });
  test('restores supported colors and discards unsupported values', () => {
    expect(parseAppearance('{"color":"green"}')).toEqual({ color: 'green' });
    expect(parseAppearance('{"color":"blue"}')).toEqual({ color: 'blue' });
    expect(parseAppearance('{"color":"invalid"}')).toEqual(DEFAULT_APPEARANCE);
  });
});
