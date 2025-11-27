/* Global AudioWorklet types (provided by browser at runtime) */
declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor()
}
declare function registerProcessor(
  name: string,
  processorCtor: new () => unknown,
): void

/**
 * AudioWorklet processor for LUFS audio analysis
 * Captures audio samples and sends them to the main thread for LUFS calculation,
 * while outputting silence to avoid double audio.
 */
class LufsProcessor extends AudioWorkletProcessor {
  bufferSize: number
  buffer: Float32Array
  bufferIndex: number

  constructor() {
    super()
    this.bufferSize = 4096
    this.buffer = new Float32Array(this.bufferSize * 2) // Stereo interleaved
    this.bufferIndex = 0
  }

  // inputs: [ inputIndex ][ channelIndex ] -> Float32Array
  // outputs: [ outputIndex ][ channelIndex ] -> Float32Array
  process(
    inputs: ReadonlyArray<ReadonlyArray<Float32Array | undefined>>,
    outputs: ReadonlyArray<ReadonlyArray<Float32Array>>,
  ): boolean {
    const input = inputs[0]

    // If no input, keep processor alive
    if (!input || input.length === 0) {
      return true
    }

    const inputL = input[0]
    const inputR = input[1] ?? input[0] // Fallback to mono if missing right channel

    if (!inputL) {
      return true
    }

    const frameCount = inputL.length

    // Accumulate samples into interleaved buffer
    for (let i = 0; i < frameCount; i++) {
      this.buffer[this.bufferIndex * 2] = inputL[i] ?? 0
      this.buffer[this.bufferIndex * 2 + 1] = inputR ? (inputR[i] ?? 0) : (inputL[i] ?? 0)
      this.bufferIndex++

      // When buffer is full, send to main thread
      if (this.bufferIndex >= this.bufferSize) {
        const samples = this.buffer.slice(0, this.bufferIndex * 2)
        this.port.postMessage({ type: 'samples', samples })
        this.bufferIndex = 0
      }
    }

    // Output silence to avoid double audio
    const output = outputs[0]
    if (output) {
      for (let channel = 0; channel < output.length; channel++) {
        const outputChannel = output[channel]
        if (outputChannel) {
          outputChannel.fill(0)
        }
      }
    }

    return true
  }
}

registerProcessor('lufs-processor', LufsProcessor)


