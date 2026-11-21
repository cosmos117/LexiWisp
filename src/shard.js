// Which offline-dictionary file a word lives in: its first two letters ("_" for anything else).
// Shared by the build script and the extension so both always agree.
export function shardOf(word) {
  return (word.toLowerCase() + '__')
    .slice(0, 2)
    .replace(/[^a-z]/g, '_');
}
