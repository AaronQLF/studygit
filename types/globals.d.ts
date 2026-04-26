// Type augmentation for the runtime polyfill in components/PdfViewer.tsx.
// `getOrInsertComputed` is a Stage-3 proposal not yet in the lib types.
interface Map<K, V> {
  getOrInsertComputed(key: K, callbackFn: (key: K) => V): V;
}
