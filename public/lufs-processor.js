/**
 * AudioWorklet processor for LUFS audio analysis
 * Replaces the deprecated ScriptProcessorNode
 * 
 * This processor captures audio samples and sends them to the main thread
 * for LUFS calculation, while outputting silence to avoid double audio.
 */

class LufsProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.bufferSize = 4096
    this.buffer = new Float32Array(this.bufferSize * 2) // Stereo interleaved
    this.bufferIndex = 0
  }

  process(inputs, outputs) {
    const input = inputs[0]
    
    // If no input, return true to keep processor alive
    if (!input || input.length === 0) {
      return true
    }

    const inputL = input[0]
    const inputR = input[1] || input[0] // Fall back to mono if no right channel

    if (!inputL) {
      return true
    }

    const frameCount = inputL.length

    // Accumulate samples into buffer
    for (let i = 0; i < frameCount; i++) {
      this.buffer[this.bufferIndex * 2] = inputL[i]
      this.buffer[this.bufferIndex * 2 + 1] = inputR ? inputR[i] : inputL[i]
      this.bufferIndex++

      // When buffer is full, send to main thread
      if (this.bufferIndex >= this.bufferSize) {
        // Create a copy to send (since we'll reuse the buffer)
        const samples = this.buffer.slice(0, this.bufferIndex * 2)
        this.port.postMessage({ type: 'samples', samples })
        this.bufferIndex = 0
      }
    }

    // Output silence to avoid double audio (the playback chain handles actual output)
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

