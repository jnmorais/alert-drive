const AFFIRMATIVE_PHRASES: readonly (readonly string[])[] = [['estou', 'bem'], ['to', 'bem'], ['ok'], ['okay']];

const NEGATION = 'nao';

export const VOICE_RESPONSE_HINTS: readonly string[] = ['estou bem', 'ok'];

export function normalizeSpokenWords(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word.length > 0);
}

function phraseAt(words: readonly string[], start: number, phrase: readonly string[]): boolean {
  return phrase.every((word, offset) => words[start + offset] === word);
}

function containsAffirmative(words: readonly string[]): boolean {
  return words.some(
    (_, start) =>
      words[start - 1] !== NEGATION && AFFIRMATIVE_PHRASES.some((phrase) => phraseAt(words, start, phrase)),
  );
}

export function isAffirmativeVoiceResponse(transcripts: readonly string[]): boolean {
  return transcripts.some((transcript) => containsAffirmative(normalizeSpokenWords(transcript)));
}
