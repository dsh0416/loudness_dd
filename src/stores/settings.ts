import { defineStore } from 'pinia'
import { ref } from 'vue'

function normalizeLocaleCode(input: string | null | undefined): 'en' | 'zh_CN' {
  const code = (input || '').toLowerCase()
  if (code.startsWith('zh')) return 'zh_CN'
  return 'en'
}

export const useSettingsStore = defineStore(
  'settings',
  () => {
    const locale = ref<string>(
      normalizeLocaleCode(typeof navigator !== 'undefined' ? navigator.language : 'en'),
    )

    function setLocale(newLocale: string): void {
      locale.value = normalizeLocaleCode(newLocale)
    }

    return {
      locale,
      setLocale,
    }
  },
  {
    persist: {
      key: 'settings',
      pick: ['locale'],
    },
  },
)
