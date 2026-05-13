import { type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'

export interface SearchInputProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  onSubmit?: () => void
}

// Compact search input used at the top of both the Situations and Watching
// tabs. The search icon doubles as a hint -- no separate button is needed.
export default function SearchInput({
  value,
  onChange,
  placeholder,
  onSubmit,
}: SearchInputProps) {
  const { i18n } = useTranslation()
  const isRTL = i18n.language === 'he'
  return (
    <div
      className="flex items-center gap-2 rounded-xl bg-[#F5F4EF] border border-[#E8E6DF]"
      style={{ padding: '8px 12px' }}
    >
      <span aria-hidden className="text-[14px] text-[#7B7B79]">⌕</span>
      <input
        type="search"
        value={value}
        dir={isRTL ? 'rtl' : 'ltr'}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onSubmit) onSubmit()
        }}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-[13px] text-gray-900 placeholder:text-[#9A9A95] outline-none"
      />
    </div>
  )
}
