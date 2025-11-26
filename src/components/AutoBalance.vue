<script setup lang="ts">
import { computed } from 'vue'
import { useTabsStore } from '@/stores/tabs'

const tabsStore = useTabsStore()

const targetLufs = computed(() => tabsStore.targetLufs)
const isAutoBalancing = computed(() => tabsStore.isAutoBalancing)
const isLoading = computed(() => tabsStore.isLoading)
const hasCaptures = computed(() => tabsStore.hasCaptures)
const averageLufs = computed(() => tabsStore.averageLufs)

// Format LUFS value for display
function formatLufs(lufs: number): string {
  if (!isFinite(lufs)) return '-∞'
  return lufs.toFixed(1)
}

// Handle target LUFS input change
async function handleTargetChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const value = parseFloat(target.value)
  if (!isNaN(value)) {
    await tabsStore.setTargetLufs(value)
  }
}

// Handle one-shot auto-balance button click
async function handleAutoBalanceNow(): Promise<void> {
  await tabsStore.autoBalanceNow()
}

// Handle toggle continuous auto-balance
async function handleToggleAutoBalance(): Promise<void> {
  await tabsStore.toggleAutoBalance()
}

// Preset LUFS targets
const presets = [
  { label: 'Broadcast', value: -24 },
  { label: 'Streaming', value: -14 },
  { label: 'Podcast', value: -16 },
  { label: 'Loud', value: -9 },
]

async function applyPreset(value: number): Promise<void> {
  await tabsStore.setTargetLufs(value)
}
</script>

<template>
  <div class="auto-balance">
    <div class="section-header">
      <h3>Volume Balance</h3>
      <div class="average-lufs" v-if="hasCaptures">
        <span class="label">Avg:</span>
        <span class="value">{{ formatLufs(averageLufs) }} LUFS</span>
      </div>
    </div>

    <!-- Target LUFS Control -->
    <div class="target-control">
      <label class="control-label">
        <span>Target LUFS</span>
        <span class="target-value">{{ targetLufs }} LUFS</span>
      </label>

      <div class="slider-row">
        <span class="slider-label">-60</span>
        <input
          type="range"
          class="target-slider"
          min="-60"
          max="0"
          step="1"
          :value="targetLufs"
          @input="handleTargetChange"
        />
        <span class="slider-label">0</span>
      </div>

      <!-- Presets -->
      <div class="presets">
        <button
          v-for="preset in presets"
          :key="preset.value"
          class="preset-btn"
          :class="{ active: targetLufs === preset.value }"
          @click="applyPreset(preset.value)"
        >
          {{ preset.label }}
          <span class="preset-value">{{ preset.value }}</span>
        </button>
      </div>
    </div>

    <!-- Balance Actions -->
    <div class="balance-actions">
      <button
        class="balance-btn one-shot"
        :disabled="!hasCaptures || isLoading"
        @click="handleAutoBalanceNow"
      >
        <span class="btn-icon">⚖️</span>
        <span class="btn-text">Balance Now</span>
      </button>

      <button
        class="balance-btn continuous"
        :class="{ active: isAutoBalancing }"
        :disabled="!hasCaptures"
        @click="handleToggleAutoBalance"
      >
        <span class="btn-icon">{{ isAutoBalancing ? '⏸️' : '🔄' }}</span>
        <span class="btn-text">{{ isAutoBalancing ? 'Stop Auto' : 'Auto Balance' }}</span>
      </button>
    </div>

    <!-- Auto-balance indicator -->
    <div v-if="isAutoBalancing" class="auto-indicator">
      <div class="indicator-dot"></div>
      <span>Running in background: {{ targetLufs }} LUFS</span>
    </div>
  </div>
</template>

<style scoped>
.auto-balance {
  background: linear-gradient(145deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 10px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.section-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
}

.average-lufs {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.average-lufs .label {
  color: #718096;
}

.average-lufs .value {
  color: #4299e1;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-weight: 500;
}

.target-control {
  margin-bottom: 14px;
}

.control-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #a0aec0;
  margin-bottom: 8px;
}

.target-value {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  color: #ffd700;
  font-weight: 600;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.slider-label {
  font-size: 9px;
  color: #4a5568;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  width: 20px;
}

.slider-label:last-child {
  text-align: right;
}

.target-slider {
  flex: 1;
  height: 8px;
  -webkit-appearance: none;
  appearance: none;
  background: linear-gradient(to right, #2d3748, #4a5568);
  border-radius: 4px;
  outline: none;
  cursor: pointer;
}

.target-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  background: linear-gradient(145deg, #ffd700, #ffaa00);
  border-radius: 50%;
  cursor: pointer;
  box-shadow:
    0 2px 8px rgba(255, 215, 0, 0.4),
    0 0 0 2px rgba(255, 255, 255, 0.1);
  transition: transform 0.1s ease;
}

.target-slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

.presets {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.preset-btn {
  flex: 1;
  min-width: 70px;
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  color: #a0aec0;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.preset-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
  color: #e2e8f0;
}

.preset-btn.active {
  background: rgba(255, 215, 0, 0.15);
  border-color: rgba(255, 215, 0, 0.4);
  color: #ffd700;
}

.preset-value {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 9px;
  opacity: 0.7;
}

.balance-actions {
  display: flex;
  gap: 8px;
}

.balance-btn {
  flex: 1;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.balance-btn.one-shot {
  background: linear-gradient(145deg, #4299e1, #3182ce);
  color: white;
  box-shadow: 0 4px 12px rgba(66, 153, 225, 0.3);
}

.balance-btn.one-shot:hover:not(:disabled) {
  background: linear-gradient(145deg, #63b3ed, #4299e1);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(66, 153, 225, 0.4);
}

.balance-btn.continuous {
  background: rgba(255, 255, 255, 0.05);
  color: #a0aec0;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.balance-btn.continuous:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
}

.balance-btn.continuous.active {
  background: linear-gradient(145deg, #48bb78, #38a169);
  color: white;
  border-color: transparent;
  box-shadow: 0 4px 12px rgba(72, 187, 120, 0.3);
}

.balance-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
}

.btn-icon {
  font-size: 14px;
}

.btn-text {
  white-space: nowrap;
}

.auto-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 8px 12px;
  background: rgba(72, 187, 120, 0.1);
  border-radius: 6px;
  font-size: 11px;
  color: #48bb78;
}

.indicator-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #48bb78;
  box-shadow: 0 0 10px #48bb78;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(0.9);
  }
}
</style>
