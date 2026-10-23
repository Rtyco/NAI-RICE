/** ㄹ이 아닌 받침 뒤에는 '으로', 그 밖에는 '로'. 한글이 아닌 글자로 끝나면 '로'다. */
export function withRo(word: string): string {
  const syllable = word.charCodeAt(word.length - 1) - 0xac00;
  const final = syllable >= 0 && syllable < 11172 ? syllable % 28 : 0;
  return `${word}${final && final !== 8 ? '으로' : '로'}`;
}
