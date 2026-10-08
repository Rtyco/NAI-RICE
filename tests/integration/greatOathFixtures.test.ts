import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importSDStudioProject } from '../../src/core/importers/SDStudioProjectImporter';

const fixtureDirectory = process.env.GREAT_OATH_NOTES;
const suite = fixtureDirectory && existsSync(fixtureDirectory) ? describe : describe.skip;

suite('Great Oath owner fixtures', () => {
  it('캐릭터 JSON 16개에서 감정 20개씩 읽어', () => {
    const files = readdirSync(fixtureDirectory!).filter(
      (name) => /^대서약_.*\.json$/u.test(name) && !name.endsWith('_nais3-scenes.json'),
    );
    expect(files).toHaveLength(16);
    for (const name of files) {
      const raw = readFileSync(path.join(fixtureDirectory!, name), 'utf8');
      const imported = importSDStudioProject(raw).emotionSet;
      expect(imported.emotions, name).toHaveLength(20);
      expect(
        imported.emotions.every((emotion: { prompt: string }) => emotion.prompt.length > 0),
        name,
      ).toBe(true);
    }
  });
});
