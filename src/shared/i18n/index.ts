import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import he from './he.json'

const STORAGE_KEY = 'graham_lang'

function getInitialLanguage(): 'he' | 'en' {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'he' || stored === 'en') return stored
  } catch {
    /* ignore */
  }
  return 'he'
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    he: { translation: he },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem(STORAGE_KEY, lng)
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng
    document.documentElement.dir = lng === 'he' ? 'rtl' : 'ltr'
  }
})

if (typeof document !== 'undefined') {
  document.documentElement.lang = i18n.language
  document.documentElement.dir = i18n.language === 'he' ? 'rtl' : 'ltr'
}

export default i18n
