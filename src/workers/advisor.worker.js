// Runs the shoe-based probability / EV calculation off the main thread.
import { analyzeHand } from '../utils/probability.js'

self.onmessage = (e) => {
  const { id, payload } = e.data
  try {
    self.postMessage({ id, result: analyzeHand(payload) })
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) })
  }
}
