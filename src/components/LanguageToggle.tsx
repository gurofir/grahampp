import { useTranslation } from 'react-i18next'

export default function LanguageToggle() {
  const { i18n } = useTranslation()
  const isHe = i18n.language === 'he'

  return (
    <button
      type="button"
      onClick={() => i18n.changeLanguage(isHe ? 'en' : 'he')}
      className="text-xs font-medium px-3 py-1 rounded-full border border-gray-200
                 text-gray-500 hover:text-gray-900 hover:border-gray-400 transition-colors"
    >
      {isHe ? 'EN' : 'עב'}
    </button>
  )
}
