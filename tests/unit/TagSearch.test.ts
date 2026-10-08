import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  formatTagCount,
  parseTagCsv,
  separatorAfter,
  tagQueryAt,
  tagText,
  TagIndex,
} from '../../src/core/prompts/TagSearch';

const SAMPLE = [
  '1girl,0,6008644,"1girls,sole_female"',
  'long_hair,0,4350743,"/lh,longhair"',
  'breasts,0,3439214,"/b,boobs,breast"',
  'very_long_hair,0,600000,',
  'hatsune_miku,4,150000,"miku"',
  'hat,0,500000,',
  'wlop,1,9000,',
  'hado_(zzzhadozzz),1,25,',
  'broken line',
].join('\n');

describe('parseTagCsv', () => {
  it('reads names with spaces, categories, counts and aliases', () => {
    const tags = parseTagCsv(SAMPLE);
    expect(tags).toHaveLength(8);
    expect(tags[1]).toEqual({
      name: 'long hair',
      category: 0,
      count: 4350743,
      aliases: ['longhair'],
    });
    expect(tags[0].aliases).toEqual(['1girls', 'sole female']);
    expect(tags[3].aliases).toEqual([]);
    expect(tags[7].name).toBe('hado (zzzhadozzz)');
  });

  it('parses the bundled list', () => {
    const tags = parseTagCsv(readFileSync('src/renderer/data/danbooru-tags.csv', 'utf8'));
    expect(tags.length).toBeGreaterThan(100_000);
    expect(tags[0].name).toBe('1girl');
  });
});

describe('TagIndex.search', () => {
  const index = new TagIndex(parseTagCsv(SAMPLE));
  const names = (query: string) => index.search(query).map((match) => match.tag.name);

  it('puts name prefixes first, then aliases, then inner words', () => {
    expect(names('ha')).toEqual([
      'hatsune miku',
      'hat',
      'hado (zzzhadozzz)',
      'long hair',
      'very long hair',
    ]);
    expect(index.search('boo')[0]).toMatchObject({ tag: { name: 'breasts' }, alias: 'boobs' });
  });

  it('treats underscores and case like spaces', () => {
    expect(names('Long_H')).toEqual(['long hair', 'very long hair']);
  });

  it('limits artist: queries to artists', () => {
    expect(names('artist:w')).toEqual(['wlop']);
    expect(names('artist:ha')).toEqual(['hado (zzzhadozzz)']);
  });

  it('respects the limit', () => {
    expect(index.search('h', 2)).toHaveLength(2);
  });
});

describe('tagQueryAt', () => {
  const at = (marked: string) => {
    const caret = marked.indexOf('|');
    return tagQueryAt(marked.replace('|', ''), caret);
  };

  it('finds the tag around the caret', () => {
    expect(at('1girl, lon|')).toEqual({ start: 7, end: 10, text: 'lon' });
    expect(at('1girl, lo|ng hair, smile')).toEqual({ start: 7, end: 16, text: 'long hair' });
    expect(at('{{blu|e eyes}}')).toEqual({ start: 2, end: 11, text: 'blue eyes' });
    expect(at('1.5::sm|')?.text).toBe('sm');
    expect(at('source#hug|')?.text).toBe('hug');
    expect(at('a\nbl|')?.text).toBe('bl');
  });

  it('skips weights, piece references and empty tags', () => {
    expect(at('1.|')).toBeNull();
    expect(at('<set.pi|')).toBeNull();
    expect(at('<se|')).toBeNull();
    expect(at('hat, |')).toBeNull();
  });
});

describe('inserting', () => {
  it('adds a separator unless one follows', () => {
    expect(separatorAfter('lon', 3)).toBe(', ');
    expect(separatorAfter('lon\nsmile', 3)).toBe(', ');
    expect(separatorAfter('lon, smile', 3)).toBe('');
    expect(separatorAfter('{lon}', 4)).toBe('');
    expect(separatorAfter('1.2::lon ::', 8)).toBe('');
    expect(separatorAfter('lon smile', 3)).toBe(', ');
  });

  it('prefixes artists and formats counts', () => {
    const [wlop] = parseTagCsv('wlop,1,9000,');
    expect(tagText(wlop)).toBe('artist:wlop');
    expect(formatTagCount(6008644)).toBe('6.0M');
    expect(formatTagCount(52_300)).toBe('52k');
    expect(formatTagCount(9_000)).toBe('9.0k');
    expect(formatTagCount(25)).toBe('25');
  });
});
