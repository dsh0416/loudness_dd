/**
 * Offscreen document for audio processing
 * Handles Web Audio API operations that aren't available in service workers
 */

import { dbToGain } from '@/audio/lufs'
import lufsProcessorUrl from '@/worklets/lufs-processor?worker&url'

// Global limiter settings (applies to all tabs)
interface LimiterSettings {
  enabled: boolean
  thresholdDb: number // Usually -1 to -6 dB
  kneeDb: number // Soft knee width
  ratio: number // High ratio for limiting (20:1 typical)
  attackMs: number
  releaseMs: number
}

let globalLimiterSettings: LimiterSettings = {
  enabled: false,
  thresholdDb: -1, // Default -1 dB (catches peaks just before 0 dBFS)
  kneeDb: 0, // Hard knee for true limiting
  ratio: 20, // High ratio for limiting behavior
  attackMs: 1, // Fast attack
  releaseMs: 100, // Moderate release
}

interface TabAudioProcessor {
  audioContext: AudioContext
  sourceNode: MediaStreamAudioSourceNode
  gainNode: GainNode
  limiterNode: DynamicsCompressorNode
  workletNode: AudioWorkletNode
  stream: MediaStream
  trackEndedHandler: () => void
  lastMomentary: number
  lastShortTerm: number
  lastIntegrated: number
  blockCount: number
}

// Map of tabId to audio processor
const processors = new Map<number, TabAudioProcessor>()

// Message types
interface StartCaptureMessage {
  type: 'START_CAPTURE'
  target?: string
  tabId: number
  streamId: string
}

interface StopCaptureMessage {
  type: 'STOP_CAPTURE'
  target?: string
  tabId: number
}

interface SetGainMessage {
  type: 'SET_GAIN'
  target?: string
  tabId: number
  gainDb: number
}

interface GetLufsMessage {
  type: 'GET_LUFS'
  target?: string
  tabId: number
}

interface ResetLufsMessage {
  type: 'RESET_LUFS'
  target?: string
  tabId: number
}

interface SetLimiterMessage {
  type: 'SET_LIMITER'
  target?: string
  settings: Partial<LimiterSettings>
}

interface GetLimiterMessage {
  type: 'GET_LIMITER'
  target?: string
}

type Message =
  | StartCaptureMessage
  | StopCaptureMessage
  | SetGainMessage
  | GetLufsMessage
  | ResetLufsMessage
  | SetLimiterMessage
  | GetLimiterMessage

/**
 * Apply limiter settings to a DynamicsCompressorNode
 */
function applyLimiterSettings(
  node: DynamicsCompressorNode,
  settings: LimiterSettings,
): void {
  const time = node.context.currentTime

  if (settings.enabled) {
    // Configure as a limiter
    node.threshold.setValueAtTime(settings.thresholdDb, time)
    node.knee.setValueAtTime(settings.kneeDb, time)
    node.ratio.setValueAtTime(settings.ratio, time)
    node.attack.setValueAtTime(settings.attackMs / 1000, time)
    node.release.setValueAtTime(settings.releaseMs / 1000, time)
  } else {
    // Bypass: set threshold to 0 dB (no compression)
    node.threshold.setValueAtTime(0, time)
    node.knee.setValueAtTime(40, time)
    node.ratio.setValueAtTime(1, time)
    node.attack.setValueAtTime(0, time)
    node.release.setValueAtTime(0.25, time)
  }
}

/**
 * Update limiter settings on all active processors
 */
function updateAllLimiters(settings: LimiterSettings): void {
  for (const processor of processors.values()) {
    applyLimiterSettings(processor.limiterNode, settings)
  }
}

/**
 * Set global limiter settings
 */
function setLimiterSettings(settings: Partial<LimiterSettings>): LimiterSettings {
  globalLimiterSettings = { ...globalLimiterSettings, ...settings }
  updateAllLimiters(globalLimiterSettings)

  // Notify background of the change
  chrome.runtime.sendMessage({
    type: 'LIMITER_UPDATED',
    settings: globalLimiterSettings,
  })

  return globalLimiterSettings
}

/**
 * Get current limiter settings
 */
function getLimiterSettings(): LimiterSettings {
  return { ...globalLimiterSettings }
}

/**
 * Notify background that stream has ended
 */
function notifyStreamEnded(tabId: number, reason: string): void {
  console.log(`Stream ended for tab ${tabId}: ${reason}`)
  chrome.runtime.sendMessage({
    type: 'STREAM_ENDED',
    tabId,
    reason,
  })
}

/**
 * Clean up a processor without notifying (for internal use)
 */
async function cleanupProcessor(tabId: number): Promise<void> {
  const processor = processors.get(tabId)
  if (!processor) return

  // Clear update interval
  // (No periodic interval used; readings forwarded on worklet messages)

  // Remove track ended listener
  const audioTracks = processor.stream.getAudioTracks()
  audioTracks.forEach((track) => {
    track.removeEventListener('ended', processor.trackEndedHandler)
  })

  // Disconnect nodes
  try {
    // Close and detach worklet message port to allow GC
    try {
      processor.workletNode.port.onmessage = null
      processor.workletNode.port.close()
    } catch {
      // Ignore port close errors
    }
    processor.workletNode.disconnect()
    processor.sourceNode.disconnect()
    processor.gainNode.disconnect()
    processor.limiterNode.disconnect()
  } catch {
    // Ignore disconnection errors
  }

  // Stop all tracks
  processor.stream.getTracks().forEach((track) => {
    try {
      track.stop()
    } catch {
      // Track may already be stopped
    }
  })

  // Close audio context
  try {
    if (processor.audioContext.state !== 'closed') {
      await processor.audioContext.close()
    }
  } catch {
    // Context may already be closed
  }

  processors.delete(tabId)
}

/**
 * Start capturing audio from a tab
 */
async function startCapture(
  tabId: number,
  streamId: string,
): Promise<{ success: boolean; error?: string }> {
  // Stop existing capture if any
  if (processors.has(tabId)) {
    await cleanupProcessor(tabId)
  }

  try {
    console.log(`Starting capture for tab ${tabId} with streamId ${streamId}`)

    // Get the media stream using the stream ID from tabCapture
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      } as MediaTrackConstraints,
      video: false,
    })

    const audioTracks = stream.getAudioTracks()
    console.log('Got media stream with tracks:', audioTracks.length)

    if (audioTracks.length === 0) {
      throw new Error('No audio tracks in stream')
    }

    const audioContext = new AudioContext()
    await audioContext.resume() // Ensure audio context is running

    const sourceNode = audioContext.createMediaStreamSource(stream)
    const gainNode = audioContext.createGain()

    // Create limiter (DynamicsCompressorNode with limiter settings)
    const limiterNode = audioContext.createDynamicsCompressor()
    applyLimiterSettings(limiterNode, globalLimiterSettings)

    // Connect the audio graph for playback
    // Source -> Gain -> Limiter -> Destination (so user hears the adjusted and limited audio)
    sourceNode.connect(gainNode)
    gainNode.connect(limiterNode)
    limiterNode.connect(audioContext.destination)

    // Load the AudioWorklet module for LUFS processing via module URL
    await audioContext.audioWorklet.addModule(lufsProcessorUrl)

    // Create AudioWorkletNode for LUFS analysis
    const workletNode = new AudioWorkletNode(audioContext, 'lufs-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    })

    // Handle messages from the worklet (aggregated LUFS readings)
    workletNode.port.onmessage = (event) => {
      if (event.data && event.data.type === 'lufs') {
        const proc = processors.get(tabId)
        if (!proc) return
        proc.lastMomentary = event.data.momentary ?? -Infinity
        proc.lastShortTerm = event.data.shortTerm ?? -Infinity
        proc.lastIntegrated = event.data.integrated ?? -Infinity
        proc.blockCount = event.data.blockCount ?? proc.blockCount
        // Forward to background immediately
        sendLufsUpdate(tabId)
      }
    }

    // Connect source to worklet for analysis (parallel to playback chain)
    sourceNode.connect(workletNode)
    // Worklet needs to be connected to destination to process (outputs silence)
    workletNode.connect(audioContext.destination)

    // Create track ended handler
    const trackEndedHandler = () => {
      console.log(`Audio track ended for tab ${tabId}`)
      // Clean up and notify background
      cleanupProcessor(tabId).then(() => {
        notifyStreamEnded(tabId, 'Audio track ended')
      })
    }

    // Listen for track ended events (fires when tab navigates, closes, or stream stops)
    audioTracks.forEach((track) => {
      track.addEventListener('ended', trackEndedHandler)
    })

    // Listen for audio context state changes
    audioContext.addEventListener('statechange', () => {
      if (audioContext.state === 'closed' && processors.has(tabId)) {
        console.log(`Audio context closed for tab ${tabId}`)
        cleanupProcessor(tabId).then(() => {
          notifyStreamEnded(tabId, 'Audio context closed')
        })
      }
    })

    processors.set(tabId, {
      audioContext,
      sourceNode,
      gainNode,
      limiterNode,
      workletNode,
      stream,
      trackEndedHandler,
      lastMomentary: -Infinity,
      lastShortTerm: -Infinity,
      lastIntegrated: -Infinity,
      blockCount: 0,
    })

    // Notify background that capture started
    chrome.runtime.sendMessage({
      type: 'CAPTURE_STARTED',
      tabId,
      sampleRate: audioContext.sampleRate,
    })

    console.log(`Capture started for tab ${tabId}`)
    return { success: true }
  } catch (error) {
    console.error('Failed to start capture:', error)
    chrome.runtime.sendMessage({
      type: 'CAPTURE_ERROR',
      tabId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Stop capturing audio from a tab
 */
async function stopCapture(tabId: number): Promise<void> {
  const processor = processors.get(tabId)
  if (!processor) return

  console.log(`Stopping capture for tab ${tabId}`)

  await cleanupProcessor(tabId)

  chrome.runtime.sendMessage({
    type: 'CAPTURE_STOPPED',
    tabId,
  })
}

/**
 * Set gain for a tab
 */
function setGain(tabId: number, gainDb: number): boolean {
  const processor = processors.get(tabId)
  if (!processor) {
    return false
  }

  // Check if audio context is still valid
  if (processor.audioContext.state === 'closed') {
    cleanupProcessor(tabId).then(() => {
      notifyStreamEnded(tabId, 'Audio context no longer valid')
    })
    return false
  }

  const gain = dbToGain(gainDb)
  processor.gainNode.gain.setValueAtTime(gain, processor.audioContext.currentTime)

  chrome.runtime.sendMessage({
    type: 'GAIN_UPDATED',
    tabId,
    gainDb,
  })

  return true
}

/**
 * Send LUFS update to background
 */
function sendLufsUpdate(tabId: number): void {
  const processor = processors.get(tabId)
  if (!processor) {
    chrome.runtime.sendMessage({
      type: 'LUFS_UPDATE',
      tabId,
      momentary: -Infinity,
      shortTerm: -Infinity,
      integrated: -Infinity,
    })
    return
  }
  chrome.runtime.sendMessage({
    type: 'LUFS_UPDATE',
    tabId,
    momentary: processor.lastMomentary,
    shortTerm: processor.lastShortTerm,
    integrated: processor.lastIntegrated,
    blockCount: processor.blockCount,
  })
}

/**
 * Get current LUFS readings for a tab
 */
function getLufs(tabId: number): void {
  const processor = processors.get(tabId)
  if (!processor) {
    chrome.runtime.sendMessage({
      type: 'LUFS_UPDATE',
      tabId,
      momentary: -Infinity,
      shortTerm: -Infinity,
      integrated: -Infinity,
    })
    return
  }

  sendLufsUpdate(tabId)
}

/**
 * Reset LUFS measurements for a tab
 */
function resetLufs(tabId: number): void {
  const processor = processors.get(tabId)
  if (!processor) return

  try {
    processor.workletNode.port.postMessage({ type: 'reset' })
  } catch {
    // Ignore postMessage errors
  }
  processor.lastMomentary = -Infinity
  processor.lastShortTerm = -Infinity
  processor.lastIntegrated = -Infinity
  processor.blockCount = 0

  chrome.runtime.sendMessage({
    type: 'LUFS_RESET',
    tabId,
  })
}

/**
 * Check if a tab's capture is still active
 */
// function isCaptureActive(tabId: number): boolean {
//   const processor = processors.get(tabId)
//   if (!processor) return false
//
//   const track = processor.stream.getAudioTracks()[0]
//   return track?.readyState === 'live' && processor.audioContext.state !== 'closed'
// }

// Listen for messages from background
chrome.runtime.onMessage.addListener(
  (
    message: Message & { target?: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => {
    // Only handle messages targeted for offscreen
    if (message.target !== 'offscreen') {
      return false
    }

    // console.log('Offscreen received message:', message.type)

    switch (message.type) {
      case 'START_CAPTURE':
        startCapture(message.tabId, message.streamId)
          .then((result) => sendResponse(result))
          .catch((error) => sendResponse({ success: false, error: error.message }))
        return true // Keep channel open for async response

      case 'STOP_CAPTURE':
        stopCapture(message.tabId)
          .then(() => sendResponse({ success: true }))
          .catch((error) => sendResponse({ success: false, error: error.message }))
        return true

      case 'SET_GAIN': {
        const success = setGain(message.tabId, message.gainDb)
        sendResponse({ success })
        return false
      }

      case 'GET_LUFS':
        getLufs(message.tabId)
        sendResponse({ success: true })
        return false

      case 'RESET_LUFS':
        resetLufs(message.tabId)
        sendResponse({ success: true })
        return false

      case 'SET_LIMITER': {
        const msg = message as SetLimiterMessage
        const newSettings = setLimiterSettings(msg.settings)
        sendResponse({ success: true, settings: newSettings })
        return false
      }

      case 'GET_LIMITER': {
        const settings = getLimiterSettings()
        sendResponse({ success: true, settings })
        return false
      }

      default:
        return false
    }
  },
)

// Signal that offscreen document is ready
chrome.runtime
  .sendMessage({ type: 'OFFSCREEN_READY' })
  .then(() => {
    console.log('Offscreen document signaled ready')
  })
  .catch((err) => {
    console.error('Failed to signal ready:', err)
  })

console.log('Offscreen document loaded')
