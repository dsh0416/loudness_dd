<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTabsStore } from '@/stores/tabs'

const tabsStore = useTabsStore()

const isEnabled = computed(() => tabsStore.isLimiterEnabled)
const threshold = computed(() => tabsStore.limiterThreshold)
const attack = computed(() => tabsStore.limiterAttack)
const release = computed(() => tabsStore.limiterRelease)
const knee = computed(() => tabsStore.limiterKnee)

// Toggle for showing advanced settings
const showAdvanced = ref(false)

async function toggleLimiter(): Promise<void> {
  await tabsStore.setLimiterEnabled(!isEnabled.value)
}

async function handleThresholdChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const value = parseFloat(target.value)
  await tabsStore.setLimiterThreshold(value)
}

async function handleAttackChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const value = parseFloat(target.value)
  await tabsStore.setLimiterAttack(value)
}

async function handleReleaseChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const value = parseFloat(target.value)
  await tabsStore.setLimiterRelease(value)
}

async function handleKneeChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const value = parseFloat(target.value)
  await tabsStore.setLimiterKnee(value)
}

// Format functions
function formatThreshold(db: number): string {
  return `${db.toFixed(1)} dB`
}

function formatAttack(ms: number): string {
  return `${ms.toFixed(1)} ms`
}

function formatRelease(ms: number): string {
  return `${ms.toFixed(0)} ms`
}

function formatKnee(db: number): string {
  return `${db.toFixed(0)} dB`
}
</script>

<template>
  <div class="limiter-section">
    <div class="limiter-header">
      <div class="limiter-title">
        <span class="limiter-icon">🛡️</span>
        <span>Output Limiter</span>
      </div>
      <button
        class="limiter-toggle"
        :class="{ active: isEnabled }"
        @click="toggleLimiter"
        :title="isEnabled ? 'Disable limiter' : 'Enable limiter'"
      >
        <span class="toggle-track">
          <span class="toggle-thumb"></span>
        </span>
        <span class="toggle-label">{{ isEnabled ? 'ON' : 'OFF' }}</span>
      </button>
    </div>

    <div class="limiter-description">
      Prevents clipping when multiple tabs play loud content simultaneously
    </div>

    <div class="limiter-controls" :class="{ disabled: !isEnabled }">
      <!-- Ceiling (Threshold) -->
      <div class="control-row">
        <label class="control-label">
          <span>Ceiling</span>
          <span class="control-value">{{ formatThreshold(threshold) }}</span>
        </label>
        <div class="slider-container">
          <span class="slider-label">-6</span>
          <input
            type="range"
            class="param-slider threshold-slider"
            min="-6"
            max="-0.1"
            step="0.1"
            :value="threshold"
            :disabled="!isEnabled"
            @input="handleThresholdChange"
          />
          <span class="slider-label">-0.1</span>
        </div>
      </div>

      <!-- Advanced Settings Toggle -->
      <button
        class="advanced-toggle"
        :class="{ expanded: showAdvanced }"
        @click="showAdvanced = !showAdvanced"
        :disabled="!isEnabled"
      >
        <span class="advanced-icon">{{ showAdvanced ? '▼' : '▶' }}</span>
        <span>Advanced Settings</span>
      </button>

      <!-- Advanced Controls -->
      <Transition name="slide">
        <div v-if="showAdvanced" class="advanced-controls">
          <!-- Attack -->
          <div class="control-row">
            <label class="control-label">
              <span>Attack</span>
              <span class="control-value attack-value">{{ formatAttack(attack) }}</span>
            </label>
            <div class="slider-container">
              <span class="slider-label">0.1</span>
              <input
                type="range"
                class="param-slider attack-slider"
                min="0.1"
                max="50"
                step="0.1"
                :value="attack"
                :disabled="!isEnabled"
                @input="handleAttackChange"
              />
              <span class="slider-label">50</span>
            </div>
            <div class="param-hint">
              <span v-if="attack <= 1">Fast - catches transients</span>
              <span v-else-if="attack <= 10">Balanced</span>
              <span v-else>Slow - more natural</span>
            </div>
          </div>

          <!-- Release -->
          <div class="control-row">
            <label class="control-label">
              <span>Release</span>
              <span class="control-value release-value">{{ formatRelease(release) }}</span>
            </label>
            <div class="slider-container">
              <span class="slider-label">10</span>
              <input
                type="range"
                class="param-slider release-slider"
                min="10"
                max="500"
                step="5"
                :value="release"
                :disabled="!isEnabled"
                @input="handleReleaseChange"
              />
              <span class="slider-label">500</span>
            </div>
            <div class="param-hint">
              <span v-if="release <= 50">Fast - punchy</span>
              <span v-else-if="release <= 150">Balanced</span>
              <span v-else>Slow - smooth</span>
            </div>
          </div>

          <!-- Knee -->
          <div class="control-row">
            <label class="control-label">
              <span>Knee</span>
              <span class="control-value knee-value">{{ formatKnee(knee) }}</span>
            </label>
            <div class="slider-container">
              <span class="slider-label">0</span>
              <input
                type="range"
                class="param-slider knee-slider"
                min="0"
                max="40"
                step="1"
                :value="knee"
                :disabled="!isEnabled"
                @input="handleKneeChange"
              />
              <span class="slider-label">40</span>
            </div>
            <div class="param-hint">
              <span v-if="knee <= 1">Hard knee - precise limiting</span>
              <span v-else-if="knee <= 10">Soft knee - smoother</span>
              <span v-else>Very soft - gentle compression</span>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <div v-if="isEnabled" class="limiter-status">
      <span class="status-indicator active"></span>
      <span>Limiter active on all monitored tabs</span>
    </div>
  </div>
</template>

<style scoped>
.limiter-section {
  background: linear-gradient(145deg, #1e1e2f 0%, #252538 100%);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.limiter-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.limiter-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
}

.limiter-icon {
  font-size: 16px;
}

.limiter-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
}

.toggle-track {
  width: 36px;
  height: 20px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  position: relative;
  transition: all 0.2s ease;
}

.limiter-toggle.active .toggle-track {
  background: rgba(237, 137, 54, 0.4);
}

.toggle-thumb {
  position: absolute;
  width: 16px;
  height: 16px;
  background: #718096;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.limiter-toggle.active .toggle-thumb {
  background: #ed8936;
  left: 18px;
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.3),
    0 0 8px rgba(237, 137, 54, 0.4);
}

.toggle-label {
  font-size: 11px;
  font-weight: 600;
  color: #718096;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  min-width: 24px;
}

.limiter-toggle.active .toggle-label {
  color: #ed8936;
}

.limiter-description {
  font-size: 11px;
  color: #718096;
  margin-bottom: 16px;
  line-height: 1.4;
}

.limiter-controls {
  transition: opacity 0.2s ease;
}

.limiter-controls.disabled {
  opacity: 0.4;
  pointer-events: none;
}

.control-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.control-row:last-child {
  margin-bottom: 0;
}

.control-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #a0aec0;
}

.control-value {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-weight: 500;
  font-size: 11px;
}

.control-value {
  color: #ed8936;
}

.attack-value {
  color: #48bb78;
}

.release-value {
  color: #4299e1;
}

.knee-value {
  color: #9f7aea;
}

.slider-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.slider-label {
  font-size: 9px;
  color: #4a5568;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  width: 28px;
}

.slider-label:last-child {
  text-align: right;
}

.param-slider {
  flex: 1;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  border-radius: 3px;
  outline: none;
  cursor: pointer;
}

.threshold-slider {
  background: linear-gradient(to right, #48bb78, #ed8936, #f56565);
}

.attack-slider {
  background: linear-gradient(to right, #48bb78 0%, #48bb78 20%, #a0aec0 100%);
}

.release-slider {
  background: linear-gradient(to right, #4299e1 0%, #a0aec0 100%);
}

.knee-slider {
  background: linear-gradient(to right, #9f7aea 0%, #a0aec0 100%);
}

.param-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: #e2e8f0;
  border-radius: 50%;
  cursor: pointer;
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.3),
    0 0 0 2px rgba(255, 255, 255, 0.1);
  transition: transform 0.1s ease;
}

.param-slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

.param-slider:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.param-slider:disabled::-webkit-slider-thumb {
  cursor: not-allowed;
}

.param-hint {
  font-size: 9px;
  color: #4a5568;
  text-align: center;
  font-style: italic;
}

/* Advanced Toggle */
.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 0;
  margin: 8px 0;
  background: none;
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  color: #718096;
  font-size: 11px;
  cursor: pointer;
  transition: color 0.15s ease;
}

.advanced-toggle:hover:not(:disabled) {
  color: #a0aec0;
}

.advanced-toggle:disabled {
  cursor: not-allowed;
}

.advanced-icon {
  font-size: 8px;
  transition: transform 0.2s ease;
}

.advanced-toggle.expanded .advanced-icon {
  transform: rotate(0deg);
}

.advanced-controls {
  padding-top: 8px;
}

/* Slide transition */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
}

.slide-enter-to,
.slide-leave-from {
  opacity: 1;
  max-height: 300px;
  padding-top: 8px;
}

.limiter-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 11px;
  color: #718096;
}

.status-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #718096;
}

.status-indicator.active {
  background: #ed8936;
  box-shadow: 0 0 8px #ed8936;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
