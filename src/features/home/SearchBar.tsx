import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface SearchBarProps {
  onSubmit: (ticker: string) => void
  loading?: boolean
}

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/

export default function SearchBar({ onSubmit, loading }: SearchBarProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const normalized = value.trim().toUpperCase()
    if (!TICKER_RE.test(normalized)) return
    onSubmit(normalized)
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t('app.searchPlaceholder')}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        dir="ltr"
        className="flex-1 min-w-0 border border-gray-200 rounded-xl px-4 py-3 text-base
                   focus:outline-none focus:border-gray-400 transition-colors uppercase
                   placeholder:text-gray-300 text-start"
        aria-label={t('app.searchPlaceholder')}
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="px-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium
                   disabled:bg-gray-300 transition-colors whitespace-nowrap"
      >
        {loading ? t('actions.analyzing') : t('app.searchButton')}
      </button>
    </form>
  )
}
