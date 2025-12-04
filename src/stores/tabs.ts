import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// Minimum blocks required for reliable LUFS-I measurement
export const MIN_BLOCKS_FOR_RELIABLE_LUFS = 10

export interface TabLufs {
  momentary: number
  shortTerm: number
  integrated: number
  blockCount: number
}

/**
 * Check if a tab has enough samples for reliable LUFS measurement
 */
export function hasEnoughSamples(lufs: TabLufs): boolean {
  return lufs.blockCount >= MIN_BLOCKS_FOR_RELIABLE_LUFS
}

export interface CapturedTab {
  tabId: number
  title: string
  url: string
  isCapturing: boolean
  currentLufs: TabLufs
  gainDb: number
  maxGainDb: number
  isSolo: boolean
}

export interface AutoBalanceSettings {
  enabled: boolean
  targetLufs: number
}

export interface LimiterSettings {
  enabled: boolean
  thresholdDb: number
  kneeDb: number
  ratio: number
  attackMs: number
  releaseMs: number
}

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<CapturedTab[]>([])
  const soloTabId = ref<number | null>(null)
  const autoBalanceSettings = ref<AutoBalanceSettings>({
    enabled: false,
    targetLufs: -14,
  })
  const limiterSettings = ref<LimiterSettings>({
    enabled: false,
    thresholdDb: -1,
    kneeDb: 0,
    ratio: 20,
    attackMs: 1,
    releaseMs: 100,
  })
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  let pollInterval: number | null = null
  let storageListener: ((changes: { [key: string]: chrome.storage.StorageChange }) => void) | null =
    null

  const capturedTabIds = computed(() => tabs.value.map((t) => t.tabId))

  const hasCaptures = computed(() => tabs.value.length > 0)

  const isAutoBalancing = computed(() => autoBalanceSettings.value.enabled)

  const targetLufs = computed(() => autoBalanceSettings.value.targetLufs)

  const averageLufs = computed(() => {
    const validTabs = tabs.value.filter((t) => isFinite(t.currentLufs.integrated))
    if (validTabs.length === 0) return -Infinity
    const sum = validTabs.reduce((acc, t) => acc + t.currentLufs.integrated, 0)
    return sum / validTabs.length
  })

  async function fetchTabs(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_TABS' })
      if (response.tabs) {
        tabs.value = response.tabs
      }
      if (response.soloTabId !== undefined) {
        soloTabId.value = response.soloTabId
      }
    } catch (err) {
      console.error('Failed to fetch tabs:', err)
      error.value = err instanceof Error ? err.message : 'Failed to fetch tabs'
    }
  }

  async function toggleSolo(tabId: number): Promise<boolean> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TOGGLE_SOLO',
        tabId,
      })

      if (response.soloTabId !== undefined) {
        soloTabId.value = response.soloTabId
      }

      // Update local state
      tabs.value.forEach((tab) => {
        tab.isSolo = tab.tabId === response.soloTabId
      })

      return response.success
    } catch (err) {
      console.error('Failed to toggle solo:', err)
      error.value = err instanceof Error ? err.message : 'Failed to toggle solo'
      return false
    }
  }

  async function clearSolo(): Promise<boolean> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CLEAR_SOLO' })

      soloTabId.value = null
      tabs.value.forEach((tab) => {
        tab.isSolo = false
      })

      return response.success
    } catch (err) {
      console.error('Failed to clear solo:', err)
      error.value = err instanceof Error ? err.message : 'Failed to clear solo'
      return false
    }
  }

  async function fetchAutoBalanceSettings(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_AUTO_BALANCE_SETTINGS' })
      if (response.settings) {
        autoBalanceSettings.value = response.settings
      }
    } catch (err) {
      console.error('Failed to fetch auto-balance settings:', err)
    }
  }

  async function fetchLimiterSettings(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_LIMITER_SETTINGS' })
      if (response.settings) {
        limiterSettings.value = response.settings
      }
    } catch (err) {
      console.error('Failed to fetch limiter settings:', err)
    }
  }

  async function setLimiterEnabled(enabled: boolean): Promise<boolean> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SET_LIMITER_SETTINGS',
        settings: { enabled },
      })

      if (response.settings) {
        limiterSettings.value = response.settings
      }

      return response.success
    } catch (err) {
      console.error('Failed to set limiter:', err)
      error.value = err instanceof Error ? err.message : 'Failed to set limiter'
      return false
    }
  }

  async function setLimiterThreshold(thresholdDb: number): Promise<boolean> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SET_LIMITER_SETTINGS',
        settings: { thresholdDb },
      })

      if (response.settings) {
        limiterSettings.value = response.settings
      }

      return response.success
    } catch (err) {
      console.error('Failed to set limiter threshold:', err)
      error.value = err instanceof Error ? err.message : 'Failed to set limiter threshold'
      return false
    }
  }

  async function setLimiterAttack(attackMs: number): Promise<boolean> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SET_LIMITER_SETTINGS',
        settings: { attackMs },
      })

      if (response.settings) {
        limiterSettings.value = response.settings
      }

      return response.success
    } catch (err) {
      console.error('Failed to set limiter attack:', err)
      error.value = err instanceof Error ? err.message : 'Failed to set limiter attack'
      return false
    }
  }

  async function setLimiterRelease(releaseMs: number): Promise<boolean> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SET_LIMITER_SETTINGS',
        settings: { releaseMs },
      })

      if (response.settings) {
        limiterSettings.value = response.settings
      }

      return response.success
    } catch (err) {
      console.error('Failed to set limiter release:', err)
      error.value = err instanceof Error ? err.message : 'Failed to set limiter release'
      return false
    }
  }

  async function setLimiterKnee(kneeDb: number): Promise<boolean> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SET_LIMITER_SETTINGS',
        settings: { kneeDb },
      })

      if (response.settings) {
        limiterSettings.value = response.settings
      }

      return response.success
    } catch (err) {
      console.error('Failed to set limiter knee:', err)
      error.value = err instanceof Error ? err.message : 'Failed to set limiter knee'
      return false
    }
  }

  async function setLimiterRatio(ratio: number): Promise<boolean> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SET_LIMITER_SETTINGS',
        settings: { ratio },
      })

      if (response.settings) {
        limiterSettings.value = response.settings
      }

      return response.success
    } catch (err) {
      console.error('Failed to set limiter ratio:', err)
      error.value = err instanceof Error ? err.message : 'Failed to set limiter ratio'
      return false
    }
  }

  async function registerCurrentTab(): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      // Get the current active tab
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!activeTab?.id) {
        error.value = 'No active tab found'
        return false
      }

      // Check if already registered
      if (capturedTabIds.value.includes(activeTab.id)) {
        error.value = 'Tab is already being captured'
        return false
      }

      // Request capture from background
      const response = await chrome.runtime.sendMessage({
        type: 'START_CAPTURE_REQUEST',
        tabId: activeTab.id,
      })

      if (!response.success) {
        error.value = response.error || 'Failed to start capture'
        return false
      }

      // Refresh tabs list
      await fetchTabs()
      return true
    } catch (err) {
      console.error('Failed to register tab:', err)
      error.value = err instanceof Error ? err.message : 'Failed to register tab'
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function unregisterTab(tabId: number): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'STOP_CAPTURE_REQUEST',
        tabId,
      })

      if (!response.success) {
        error.value = response.error || 'Failed to stop capture'
        return false
      }

      // Remove from local state immediately
      tabs.value = tabs.value.filter((t) => t.tabId !== tabId)
      return true
    } catch (err) {
      console.error('Failed to unregister tab:', err)
      error.value = err instanceof Error ? err.message : 'Failed to unregister tab'
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function setGain(tabId: number, gainDb: number): Promise<boolean> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SET_GAIN_REQUEST',
        tabId,
        gainDb,
      })

      if (!response.success) {
        error.value = response.error || 'Failed to set gain'
        return false
      }

      // Update local state
      const tab = tabs.value.find((t) => t.tabId === tabId)
      if (tab) {
        tab.gainDb = gainDb
      }

      return true
    } catch (err) {
      console.error('Failed to set gain:', err)
      error.value = err instanceof Error ? err.message : 'Failed to set gain'
      return false
    }
  }

  async function setMaxGain(tabId: number, maxGainDb: number): Promise<boolean> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SET_MAX_GAIN_REQUEST',
        tabId,
        maxGainDb,
      })

      if (!response.success) {
        error.value = response.error || 'Failed to set max gain'
        return false
      }

      // Update local state
      const tab = tabs.value.find((t) => t.tabId === tabId)
      if (tab) {
        tab.maxGainDb = maxGainDb
        // If current gain exceeds new max, update it too
        if (tab.gainDb > maxGainDb) {
          tab.gainDb = maxGainDb
        }
      }

      return true
    } catch (err) {
      console.error('Failed to set max gain:', err)
      error.value = err instanceof Error ? err.message : 'Failed to set max gain'
      return false
    }
  }

  async function autoBalanceNow(): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'AUTO_BALANCE_REQUEST',
        targetLufs: autoBalanceSettings.value.targetLufs,
      })

      if (!response.success) {
        error.value = response.error || 'Failed to auto-balance'
        return false
      }

      // Refresh tabs to get updated gains
      await fetchTabs()
      return true
    } catch (err) {
      console.error('Failed to auto-balance:', err)
      error.value = err instanceof Error ? err.message : 'Failed to auto-balance'
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function setAutoBalanceEnabled(enabled: boolean): Promise<boolean> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SET_AUTO_BALANCE_ENABLED',
        enabled,
      })

      if (response.settings) {
        autoBalanceSettings.value = response.settings
      }

      return response.success
    } catch (err) {
      console.error('Failed to set auto-balance:', err)
      error.value = err instanceof Error ? err.message : 'Failed to set auto-balance'
      return false
    }
  }

  async function toggleAutoBalance(): Promise<void> {
    await setAutoBalanceEnabled(!autoBalanceSettings.value.enabled)
  }

  async function setTargetLufs(value: number): Promise<boolean> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SET_TARGET_LUFS',
        targetLufs: value,
      })

      if (response.settings) {
        autoBalanceSettings.value = response.settings
      }

      return response.success
    } catch (err) {
      console.error('Failed to set target LUFS:', err)
      error.value = err instanceof Error ? err.message : 'Failed to set target LUFS'
      return false
    }
  }

  async function resetLufs(tabId: number): Promise<boolean> {
    try {
      await chrome.runtime.sendMessage({
        type: 'RESET_LUFS_REQUEST',
        tabId,
      })

      // Reset local state
      const tab = tabs.value.find((t) => t.tabId === tabId)
      if (tab) {
        tab.currentLufs = {
          momentary: -Infinity,
          shortTerm: -Infinity,
          integrated: -Infinity,
          blockCount: 0,
        }
      }

      return true
    } catch (err) {
      console.error('Failed to reset LUFS:', err)
      return false
    }
  }

  function handleStorageChange(changes: { [key: string]: chrome.storage.StorageChange }): void {
    if (changes.autoBalanceSettings?.newValue) {
      autoBalanceSettings.value = changes.autoBalanceSettings.newValue as AutoBalanceSettings
    }
    if (changes.limiterSettings?.newValue) {
      limiterSettings.value = changes.limiterSettings.newValue as LimiterSettings
    }
    if (changes.capturedTabs?.newValue) {
      tabs.value = changes.capturedTabs.newValue as CapturedTab[]
    }
  }

  function startPolling(): void {
    if (pollInterval) return

    fetchTabs()
    fetchLimiterSettings()
    fetchAutoBalanceSettings()

    if (!storageListener) {
      storageListener = handleStorageChange
      chrome.storage.onChanged.addListener(storageListener)
    }

    pollInterval = window.setInterval(() => {
      fetchTabs()
    }, 100)
  }

  function stopPolling(): void {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }

    if (storageListener) {
      chrome.storage.onChanged.removeListener(storageListener)
      storageListener = null
    }
  }

  function clearError(): void {
    error.value = null
  }

  const isLimiterEnabled = computed(() => limiterSettings.value.enabled)
  const limiterThreshold = computed(() => limiterSettings.value.thresholdDb)
  const limiterAttack = computed(() => limiterSettings.value.attackMs)
  const limiterRelease = computed(() => limiterSettings.value.releaseMs)
  const limiterKnee = computed(() => limiterSettings.value.kneeDb)
  const limiterRatio = computed(() => limiterSettings.value.ratio)
  const hasSolo = computed(() => soloTabId.value !== null)

  return {
    // State
    tabs,
    soloTabId,
    autoBalanceSettings,
    limiterSettings,
    isLoading,
    error,

    // Computed
    capturedTabIds,
    hasCaptures,
    isAutoBalancing,
    targetLufs,
    averageLufs,
    isLimiterEnabled,
    limiterThreshold,
    limiterAttack,
    limiterRelease,
    limiterKnee,
    limiterRatio,
    hasSolo,

    // Actions
    fetchTabs,
    fetchAutoBalanceSettings,
    fetchLimiterSettings,
    registerCurrentTab,
    unregisterTab,
    setGain,
    setMaxGain,
    toggleSolo,
    clearSolo,
    autoBalanceNow,
    setAutoBalanceEnabled,
    toggleAutoBalance,
    setTargetLufs,
    setLimiterEnabled,
    setLimiterThreshold,
    setLimiterAttack,
    setLimiterRelease,
    setLimiterKnee,
    setLimiterRatio,
    resetLufs,
    startPolling,
    stopPolling,
    clearError,
  }
})
