// Joins finished phrases with the one still being spoken. iOS reports the
// whole session so far; Android restarts after pauses, so finished
// phrases are kept and the next one appended.
export function createTranscriptAccumulator() {
  let committed = "";
  let current = "";
  const join = (a: string, b: string) => [a.trim(), b.trim()].filter(Boolean).join(" ");
  return {
    push(text: string, isFinal: boolean): string {
      if (isFinal) {
        committed = text.startsWith(committed) ? text : join(committed, text);
        current = "";
      } else {
        current = text.startsWith(committed) ? text.slice(committed.length) : text;
      }
      return join(committed, current);
    },
  };
}
