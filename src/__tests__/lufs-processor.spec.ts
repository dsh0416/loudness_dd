import { describe, it, expect } from 'vitest'
import { LufsCalculator } from '@/audio/lufs'

// Exact coefficients (same as worklet)
const HIGH_SHELF_B: [number, number, number] = [
  1.53512485958697, -2.69169618940638, 1.19839281085285,
]
const HIGH_SHELF_A: [number, number, number] = [
  1.0, -1.69065929318241, 0.73248077421585,
]
const HIGH_PASS_B: [number, number, number] = [1.0, -2.0, 1.0]
const HIGH_PASS_A: [number, number, number] = [1.0, -1.99004745483398, 0.99007225036621]
const CHANNEL_WEIGHTS = [1.0, 1.0]
const ABSOLUTE_THRESHOLD = -70.0
const RELATIVE_THRESHOLD_OFFSET = -10.0

describe('LUFS algorithm parity (worklet-style vs LufsCalculator)', () => {
  it('integrated loudness within 0.1 LU on stereo sine', () => {
    const sampleRate = 48000
    const durationSec = 5
    const frames = durationSec * sampleRate
    const freq = 1000
    const ampDb = -18
    const amp = Math.pow(10, ampDb / 20)

    // Generate interleaved stereo sine
    const interleaved = new Float32Array(frames * 2)
    for (let i = 0; i < frames; i++) {
      const s = Math.sin((2 * Math.PI * freq * i) / sampleRate) * amp
      interleaved[i * 2] = s
      interleaved[i * 2 + 1] = s
    }

    // Baseline using existing LufsCalculator
    const calc = new LufsCalculator({ sampleRate, channels: 2 })
    calc.processInterleaved(interleaved)
    const baseline = calc.getIntegratedLoudness()

    // Worklet-style offline computation (circular accumulation, no re-scan)
    const blockMs = 400
    const overlap = 0.75
    const blockSize = Math.floor((blockMs / 1000) * sampleRate)
    const hop = Math.max(1, Math.floor(blockSize * (1 - overlap)))

    const hs_x1 = new Float32Array(2)
    const hs_x2 = new Float32Array(2)
    const hs_y1 = new Float32Array(2)
    const hs_y2 = new Float32Array(2)
    const hp_x1 = new Float32Array(2)
    const hp_x2 = new Float32Array(2)
    const hp_y1 = new Float32Array(2)
    const hp_y2 = new Float32Array(2)

    const ringSquares = [new Float32Array(blockSize), new Float32Array(blockSize)]
    const sumSquares = new Float64Array(2)
    let ringIndex = 0
    let sinceBlock = 0

    const blockLufs: number[] = []

    for (let i = 0; i < frames; i++) {
      // L
      {
        const ch = 0
        const x = interleaved[i * 2]
        const yHs =
          HIGH_SHELF_B[0] * x +
          HIGH_SHELF_B[1] * hs_x1[ch] +
          HIGH_SHELF_B[2] * hs_x2[ch] -
          HIGH_SHELF_A[1] * hs_y1[ch] -
          HIGH_SHELF_A[2] * hs_y2[ch]
        hs_x2[ch] = hs_x1[ch]
        hs_x1[ch] = x
        hs_y2[ch] = hs_y1[ch]
        hs_y1[ch] = yHs
        const yHp =
          HIGH_PASS_B[0] * yHs +
          HIGH_PASS_B[1] * hp_x1[ch] +
          HIGH_PASS_B[2] * hp_x2[ch] -
          HIGH_PASS_A[1] * hp_y1[ch] -
          HIGH_PASS_A[2] * hp_y2[ch]
        hp_x2[ch] = hp_x1[ch]
        hp_x1[ch] = yHs
        hp_y2[ch] = hp_y1[ch]
        hp_y1[ch] = yHp
        const y2 = yHp * yHp
        const old = ringSquares[ch][ringIndex]
        sumSquares[ch] += y2 - old
        ringSquares[ch][ringIndex] = y2
      }
      // R
      {
        const ch = 1
        const x = interleaved[i * 2 + 1]
        const yHs =
          HIGH_SHELF_B[0] * x +
          HIGH_SHELF_B[1] * hs_x1[ch] +
          HIGH_SHELF_B[2] * hs_x2[ch] -
          HIGH_SHELF_A[1] * hs_y1[ch] -
          HIGH_SHELF_A[2] * hs_y2[ch]
        hs_x2[ch] = hs_x1[ch]
        hs_x1[ch] = x
        hs_y2[ch] = hs_y1[ch]
        hs_y1[ch] = yHs
        const yHp =
          HIGH_PASS_B[0] * yHs +
          HIGH_PASS_B[1] * hp_x1[ch] +
          HIGH_PASS_B[2] * hp_x2[ch] -
          HIGH_PASS_A[1] * hp_y1[ch] -
          HIGH_PASS_A[2] * hp_y2[ch]
        hp_x2[ch] = hp_x1[ch]
        hp_x1[ch] = yHs
        hp_y2[ch] = hp_y1[ch]
        hp_y1[ch] = yHp
        const y2 = yHp * yHp
        const old = ringSquares[ch][ringIndex]
        sumSquares[ch] += y2 - old
        ringSquares[ch][ringIndex] = y2
      }

      ringIndex++
      if (ringIndex >= blockSize) ringIndex = 0
      sinceBlock++
      if (sinceBlock >= hop) {
        sinceBlock -= hop
        const mean0 = sumSquares[0] / blockSize
        const mean1 = sumSquares[1] / blockSize
        const sumWeighted = CHANNEL_WEIGHTS[0] * mean0 + CHANNEL_WEIGHTS[1] * mean1
        const l = sumWeighted > 0 ? -0.691 + 10 * Math.log10(sumWeighted) : -Infinity
        if (l > ABSOLUTE_THRESHOLD) blockLufs.push(l)
      }
    }

    // Gated integrated from collected blocks
    let integrated = -Infinity
    if (blockLufs.length > 0) {
      const aboveAbs = blockLufs.filter((l) => l > ABSOLUTE_THRESHOLD)
      if (aboveAbs.length > 0) {
        let sumPower1 = 0
        for (const v of aboveAbs) sumPower1 += Math.pow(10, v / 10)
        const rel = 10 * Math.log10(sumPower1 / aboveAbs.length) + RELATIVE_THRESHOLD_OFFSET
        const aboveRel = aboveAbs.filter((l) => l > rel)
        if (aboveRel.length > 0) {
          let sumPower2 = 0
          for (const v of aboveRel) sumPower2 += Math.pow(10, v / 10)
          integrated = 10 * Math.log10(sumPower2 / aboveRel.length)
        }
      }
    }

    // Expect close results
    const diff = Math.abs((baseline || -Infinity) - (integrated || -Infinity))
    expect(diff).toBeLessThanOrEqual(0.1)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

type LufsWorkletCtor = new () => {
  bufferSize: number
  buffer: Float32Array
  bufferIndex: number
  process: (
    inputs: Array<Array<Float32Array | undefined>>,
    outputs: Array<Array<Float32Array>>,
  ) => boolean
}

function setupWorklet() {
  const postedMessages: Array<{ type: string; samples?: Float32Array }> = []

  const g = globalThis as Record<string, unknown>
  class AudioWorkletProcessorMock {
    port: { postMessage: (data: unknown) => void }
    constructor() {
      this.port = {
        postMessage: vi.fn((data: unknown) => {
          postedMessages.push(data as { type: string; samples?: Float32Array })
        }),
      }
    }
  }
  g.AudioWorkletProcessor = AudioWorkletProcessorMock as unknown

  g.registerProcessor = vi.fn((name: string, ctor: unknown) => {
    g.__Worklet = { name, ctor } as { name: string; ctor: unknown }
  }) as unknown

  return { postedMessages }
}

async function loadProcessorCtor() {
  vi.resetModules()
  const { postedMessages } = setupWorklet()
  await import('../../src/worklets/lufs-processor.ts')
  const g = globalThis as Record<string, unknown>
  const w = g.__Worklet as { name: string; ctor: LufsWorkletCtor } | undefined
  expect(w).toBeTruthy()
  return { ctor: w!.ctor, name: w!.name as string, postedMessages }
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
    const msg = postedMessages[0]!
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

    const samples = postedMessages[0]!.samples!
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

    const samples = postedMessages[0]!.samples!
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


