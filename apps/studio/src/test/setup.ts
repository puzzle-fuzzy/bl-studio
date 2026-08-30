import '@testing-library/jest-dom/vitest'

// Node 26 exposes a gated global localStorage getter that returns undefined unless
// --localstorage-file is provided. happy-dom owns the browser storage for this
// environment, so explicitly bridge it for tests that use the global name.
if (typeof window !== 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: window.localStorage ?? createMemoryStorage(),
  })
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => Array.from(values.keys())[index] ?? null,
    removeItem: key => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  }
}
