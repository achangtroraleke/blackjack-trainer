import { useEffect, useRef, useState } from 'react'
import { analyzeHand } from '../utils/probability.js'

/**
 * Runs the shoe-based probability calculation in a Web Worker so the UI never freezes.
 * Falls back to a deferred main-thread calculation where Workers are unavailable.
 */
export function useAdvisor(payload) {
  const [state, setState] = useState({ loading: false, result: null, error: null })
  const workerRef = useRef(null)
  const pending = useRef(new Map())
  const seq = useRef(0)

  useEffect(() => {
    let worker = null
    try {
      if (typeof Worker !== 'undefined') {
        worker = new Worker(new URL('../workers/advisor.worker.js', import.meta.url), { type: 'module' })
        worker.onmessage = (e) => {
          const { id, result, error } = e.data
          const cb = pending.current.get(id)
          if (cb) {
            pending.current.delete(id)
            cb(error ? new Error(error) : null, result)
          }
        }
        worker.onerror = () => {
          // Worker failed to load: drop it and use the fallback path.
          worker.terminate()
          workerRef.current = null
        }
      }
    } catch {
      worker = null
    }
    workerRef.current = worker
    const pend = pending.current
    return () => {
      if (worker) worker.terminate()
      workerRef.current = null
      pend.clear()
    }
  }, [])

  const key = payload ? JSON.stringify(payload) : null

  useEffect(() => {
    if (!key) {
      setState({ loading: false, result: null, error: null })
      return undefined
    }
    const id = ++seq.current
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))

    const done = (err, result) => {
      if (cancelled || id !== seq.current) return
      setState({ loading: false, result: err ? null : result, error: err ? err.message : null })
    }

    const input = JSON.parse(key)
    const worker = workerRef.current
    let timer = null
    if (worker) {
      pending.current.set(id, done)
      worker.postMessage({ id, payload: input })
    } else {
      timer = setTimeout(() => {
        try {
          done(null, analyzeHand(input))
        } catch (e) {
          done(e)
        }
      }, 0)
    }
    return () => {
      cancelled = true
      pending.current.delete(id)
      if (timer) clearTimeout(timer)
    }
  }, [key])

  return state
}
