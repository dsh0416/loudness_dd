import { describe, it, expect, vi, beforeEach } from 'vitest'

function setupWorklet() {
  const postedMessages: Array<{ type: string; samples?: Float32Array }> = []

  ;(globalThis as any).AudioWorkletProcessor = class {
    port: { postMessage: (data: unknown) => void }
    constructor() {
      this.port = {
        postMessage: vi.fn((data: unknown) => {
          postedMessages.push(data as { type: string; samples?: Float32Array })
        }),
      }
    }
  }

  ;(globalThis as any).registerProcessor = vi.fn((name: string, ctor: unknown) => {
    ;(globalThis as any).__Worklet = { name, ctor }
  })

  return { postedMessages }
}

async function loadProcessorCtor() {
  vi.resetModules()
  const { postedMessages } = setupWorklet()
  await import('../../public/lufs-processor.js')
  const w = (globalThis as any).__Worklet
  expect(w).toBeTruthy()
  return { ctor: w.ctor as new () => any, name: w.name as string, postedMessages }
}

function makeFrames(length: number, stereo = true) {
  const left = Float32Array.from({ length }, (_, i) => i)
  const right = stereo ? Float32Array.from({ length }, (_, i) => i + 10) : undefined
  return { left, right }
}

describe('lufs-processor AudioWorklet', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('registers under name "lufs-processor"', async () => {
    const { name, ctor } = await loadProcessorCtor()
    expect(name).toBe('lufs-processor')
    expect(typeof ctor).toBe('function')
  })

  it('flushes buffer and posts samples when full', async () => {
    const { ctor, postedMessages } = await loadProcessorCtor()
    const proc = new ctor()
    proc.bufferSize = 8
    proc.buffer = new Float32Array(proc.bufferSize * 2)
    proc.bufferIndex = 0

    const { left, right } = makeFrames(8, true)
    const outputs = [[new Float32Array(8), new Float32Array(8)]]
    const keepAlive = proc.process([[left, right]], outputs)
    expect(keepAlive).toBe(true)

    expect(postedMessages.length).toBe(1)
    const msg = postedMessages[0]
    expect(msg.type).toBe('samples')
    expect(msg.samples).toBeInstanceOf(Float32Array)
    expect(msg.samples!.length).toBe(16) // bufferSize * 2 for stereo interleaved
  })

  it('interleaves stereo samples correctly (L at even, R at odd indices)', async () => {
    const { ctor, postedMessages } = await loadProcessorCtor()
    const proc = new ctor()
    proc.bufferSize = 8
    proc.buffer = new Float32Array(proc.bufferSize * 2)
    proc.bufferIndex = 0

    const { left, right } = makeFrames(8, true)
    const outputs = [[new Float32Array(8), new Float32Array(8)]]
    proc.process([[left, right]], outputs)

    const samples = postedMessages[0].samples!
    for (let i = 0; i < 8; i++) {
      expect(samples[i * 2]).toBe(left[i])
      expect(samples[i * 2 + 1]).toBe(right![i])
    }
  })

  it('falls back to mono when right channel is missing', async () => {
    const { ctor, postedMessages } = await loadProcessorCtor()
    const proc = new ctor()
    proc.bufferSize = 8
    proc.buffer = new Float32Array(proc.bufferSize * 2)
    proc.bufferIndex = 0

    const { left } = makeFrames(8, false)
    const outputs = [[new Float32Array(8), new Float32Array(8)]]
    proc.process([[left]], outputs)

    const samples = postedMessages[0].samples!
    for (let i = 0; i < 8; i++) {
      expect(samples[i * 2]).toBe(left[i]) // L
      expect(samples[i * 2 + 1]).toBe(left[i]) // R mirrors L
    }
  })

  it('outputs silence (zeros) to avoid double audio', async () => {
    const { ctor } = await loadProcessorCtor()
    const proc = new ctor()
    proc.bufferSize = 4
    proc.buffer = new Float32Array(proc.bufferSize * 2)
    proc.bufferIndex = 0

    const left = Float32Array.from([0.1, -0.2, 0.3, -0.4])
    const right = Float32Array.from([0.5, -0.6, 0.7, -0.8])
    const outL = new Float32Array(4).fill(123)
    const outR = new Float32Array(4).fill(456)
    const outputs = [[outL, outR]]

    proc.process([[left, right]], outputs)

    expect(Array.from(outL)).toEqual([0, 0, 0, 0])
    expect(Array.from(outR)).toEqual([0, 0, 0, 0])
  })

  it('returns true and posts nothing when there is no input', async () => {
    const { ctor, postedMessages } = await loadProcessorCtor()
    const proc = new ctor()
    const keepAlive = proc.process([], [])
    expect(keepAlive).toBe(true)
    expect(postedMessages.length).toBe(0)
  })
})


