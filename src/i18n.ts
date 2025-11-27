import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'

export const i18n = createI18n({
  legacy: false,
  locale: typeof navigator !== 'undefined' ? navigator.language : 'en',
  fallbackLocale: 'en',
  globalInjection: true,
  messages: {
    en,
    'zh-CN': zhCN,
  },
})


