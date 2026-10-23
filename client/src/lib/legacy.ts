/**
 * The app used to ship under an earlier name. Move any settings saved under the old key prefix
 * (theme, language, tour progress, voice language) to the Paydayly keys, once, without the user noticing.
 */
const OLD_PREFIX = ["b", "aa", "ki"].join("")

export function migrateLegacyStorage() {
  try {
    for (const store of [localStorage, sessionStorage]) {
      const keys: string[] = []
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i)
        if (key && key.startsWith(OLD_PREFIX)) keys.push(key)
      }
      for (const key of keys) {
        const next = "paydayly" + key.slice(OLD_PREFIX.length)
        const value = store.getItem(key)
        if (value !== null && store.getItem(next) === null) store.setItem(next, value)
        store.removeItem(key)
      }
    }
  } catch {
    /* storage blocked: nothing to migrate */
  }
}
