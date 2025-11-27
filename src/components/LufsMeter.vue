<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

// Minimum blocks required for reliable LUFS-I measurement
const MIN_BLOCKS_REQUIRED = 10

interface Props {
  momentary?: number | null
  shortTerm?: number | null
  integrated?: number | null
  blockCount?: number | null
  targetLufs?: number | null
  showLabels?: boolean
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  momentary: -Infinity,
  shortTerm: -Infinity,
  integrated: -Infinity,
  blockCount: 0,
  targetLufs: -14,
  showLabels: true,
  compact: false,
})

// Safe getters for potentially null values
const safeMomentary = computed(() => props.momentary ?? -Infinity)
const safeShortTerm = computed(() => props.shortTerm ?? -Infinity)
const safeIntegrated = computed(() => props.integrated ?? -Infinity)
const safeBlockCount = computed(() => props.blockCount ?? 0)
const safeTargetLufs = computed(() => props.targetLufs ?? -14)

// Computed: whether we have enough samples
const hasEnoughSamples = computed(() => safeBlockCount.value >= MIN_BLOCKS_REQUIRED)

// LUFS range for display (-60 to 0)
const MIN_LUFS = -60
const MAX_LUFS = 0

// Convert LUFS to percentage for bar display
function lufsToPercent(lufs: number): number {
  if (!isFinite(lufs) || lufs <= MIN_LUFS) return 0
  if (lufs >= MAX_LUFS) return 100
  return ((lufs - MIN_LUFS) / (MAX_LUFS - MIN_LUFS)) * 100
}

// Format LUFS value for display
function formatLufs(lufs: number): string {
  if (!isFinite(lufs) || lufs <= MIN_LUFS) return '-∞'
  return lufs.toFixed(1)
}

// Get color based on LUFS level relative to target
function getMeterColor(lufs: number): string {
  if (!isFinite(lufs)) return 'var(--color-meter-silent)'

  const diff = lufs - safeTargetLufs.value

  if (diff > 3) return 'var(--color-meter-loud)' // Too loud (red)
  if (diff > 0) return 'var(--color-meter-warm)' // Slightly loud (orange)
  if (diff > -6) return 'var(--color-meter-good)' // Good range (green)
  return 'var(--color-meter-quiet)' // Too quiet (blue)
}

const momentaryPercent = computed(() => lufsToPercent(safeMomentary.value))
const shortTermPercent = computed(() => lufsToPercent(safeShortTerm.value))
const integratedPercent = computed(() => lufsToPercent(safeIntegrated.value))
const targetPercent = computed(() => lufsToPercent(safeTargetLufs.value))

const momentaryColor = computed(() => getMeterColor(safeMomentary.value))
const integratedColor = computed(() => getMeterColor(safeIntegrated.value))

// Progress toward enough samples
const sampleProgress = computed(() => Math.min(100, (safeBlockCount.value / MIN_BLOCKS_REQUIRED) * 100))

const { t } = useI18n()
</script>

<template>
  <div class="lufs-meter" :class="{ compact }">
    <!-- Sample collection indicator -->
    <div v-if="!hasEnoughSamples && !compact" class="collecting-samples">
      <div class="collecting-icon">⏳</div>
      <div class="collecting-info">
        <span class="collecting-text">{{ t('lufs.collecting') }}</span>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: `${sampleProgress}%` }"></div>
        </div>
      </div>
    </div>

    <!-- Momentary meter (fast-moving bar) -->
    <div class="meter-row" v-if="!compact">
      <span class="meter-label" v-if="showLabels">M</span>
      <div class="meter-track">
        <div
          class="meter-bar momentary"
          :style="{
            width: `${momentaryPercent}%`,
            backgroundColor: momentaryColor,
          }"
        />
        <div class="target-line" :style="{ left: `${targetPercent}%` }" />
      </div>
      <span class="meter-value">{{ formatLufs(safeMomentary) }}</span>
    </div>

    <!-- Short-term meter -->
    <div class="meter-row" v-if="!compact">
      <span class="meter-label" v-if="showLabels">S</span>
      <div class="meter-track">
        <div
          class="meter-bar short-term"
          :style="{
            width: `${shortTermPercent}%`,
            backgroundColor: momentaryColor,
          }"
        />
        <div class="target-line" :style="{ left: `${targetPercent}%` }" />
      </div>
      <span class="meter-value">{{ formatLufs(safeShortTerm) }}</span>
    </div>

    <!-- Integrated meter (main display) -->
    <div class="meter-row integrated" :class="{ 'not-ready': !hasEnoughSamples }">
      <span class="meter-label" v-if="showLabels">I</span>
      <div class="meter-track">
        <div
          class="meter-bar"
          :style="{
            width: `${integratedPercent}%`,
            backgroundColor: integratedColor,
          }"
        />
        <div class="target-line" :style="{ left: `${targetPercent}%` }" />
      </div>
      <span class="meter-value integrated-value" :class="{ dimmed: !hasEnoughSamples }">
        {{ formatLufs(safeIntegrated) }}
      </span>
    </div>

    <!-- Compact mode sample indicator -->
    <div v-if="!hasEnoughSamples && compact" class="compact-collecting">
      <span class="collecting-dot"></span>
    </div>

    <!-- Scale markers -->
    <div class="scale" v-if="showLabels && !compact">
      <span>-60</span>
      <span>-40</span>
      <span>-20</span>
      <span>0</span>
    </div>
  </div>
</template>

<style scoped>
.lufs-meter {
  --color-meter-silent: #4a5568;
  --color-meter-quiet: #4299e1;
  --color-meter-good: #48bb78;
  --color-meter-warm: #ed8936;
  --color-meter-loud: #f56565;
  --color-track: #1a1a2e;
  --color-target: #ffd700;

  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%);
  border-radius: 6px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 11px;
}

/* Collecting samples indicator */
.collecting-samples {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  margin-bottom: 4px;
  background: rgba(237, 137, 54, 0.1);
  border: 1px solid rgba(237, 137, 54, 0.3);
  border-radius: 4px;
}

.collecting-icon {
  font-size: 14px;
  animation: pulse-icon 1.5s ease-in-out infinite;
}

@keyframes pulse-icon {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.collecting-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.collecting-text {
  font-size: 10px;
  color: #ed8936;
  font-weight: 500;
}

.progress-bar {
  height: 4px;
  background: rgba(237, 137, 54, 0.2);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #ed8936, #f6ad55);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.meter-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.meter-row.not-ready {
  opacity: 0.6;
}

.meter-label {
  width: 12px;
  color: #718096;
  font-weight: 600;
  text-align: center;
}

.meter-track {
  flex: 1;
  height: 8px;
  background: var(--color-track);
  border-radius: 3px;
  position: relative;
  overflow: hidden;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.4);
}

.meter-bar {
  height: 100%;
  border-radius: 3px;
  transition: width 0.05s ease-out;
  box-shadow: 0 0 8px currentColor;
}

.meter-bar.momentary {
  opacity: 0.9;
}

.meter-bar.short-term {
  opacity: 0.7;
}

.target-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--color-target);
  box-shadow: 0 0 4px var(--color-target);
  transform: translateX(-50%);
  z-index: 1;
}

.meter-value {
  width: 36px;
  text-align: right;
  color: #a0aec0;
  font-variant-numeric: tabular-nums;
}

.integrated-value {
  color: #e2e8f0;
  font-weight: 600;
}

.integrated-value.dimmed {
  color: #718096;
  font-style: italic;
}

.scale {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  padding: 0 20px 0 20px;
  color: #4a5568;
  font-size: 9px;
}

/* Compact mode */
.lufs-meter.compact {
  padding: 4px 8px;
  gap: 0;
}

.compact .meter-row {
  gap: 6px;
}

.compact .meter-track {
  height: 10px;
}

.compact .meter-value {
  width: 32px;
  font-size: 10px;
}

.compact-collecting {
  display: flex;
  justify-content: flex-end;
  padding-right: 4px;
}

.collecting-dot {
  width: 6px;
  height: 6px;
  background: #ed8936;
  border-radius: 50%;
  animation: pulse-dot 1s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.8);
  }
}
</style>
