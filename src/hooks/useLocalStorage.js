import { useCallback, useEffect, useRef, useState } from 'react'

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v)

/** Merge saved data over defaults (nested plain objects only) so new fields get defaults. */
export function mergeDefaults(defaults, saved) {
  if (!isPlainObject(defaults) || !isPlainObject(saved)) return saved === undefined ? defaults : saved
  const out = { ...defaults }
  for (const key of Object.keys(saved)) {
    out[key] = isPlainObject(defaults[key]) ? mergeDefaults(defaults[key], saved[key]) : saved[key]
  }
  return out
}

export function readStorage(key, defaults) {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return defaults
    return mergeDefaults(defaults, JSON.parse(raw))
  } catch {
    return defaults
  }
}

export function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/**
 * Persist one JSON object under a single (versioned) key.
 * Returns [data, update, reset]; `update` accepts a partial object or an updater function.
 */
export function useLocalStorage(key, defaults) {
  const defaultsRef = useRef(defaults)
  const [data, setData] = useState(() => readStorage(key, defaults))

  useEffect(() => {
    writeStorage(key, data)
  }, [key, data])

  const update = useCallback((patch) => {
    setData((prev) => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }
      return next
    })
  }, [])

  const reset = useCallback(() => setData(defaultsRef.current), [])

  return [data, update, reset]
}
