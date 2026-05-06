import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const STEP_KEYS = ['loading.step1', 'loading.step2', 'loading.step3'] as const

export default function LoadingScreen() {
  const { t } = useTranslation()
  const [activeStep, setActiveStep] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setActiveStep((s) => Math.min(s + 1, STEP_KEYS.length - 1))
    }, 900)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="p-6 flex flex-col items-center justify-center gap-6 text-center">
      <div className="w-12 h-12 rounded-full border-2 border-gray-200 border-t-gray-900 animate-spin" />
      <div>
        <h2 className="text-lg font-medium text-gray-900">{t('loading.title')}</h2>
        <p className="text-sm text-gray-500 mt-1">{t('loading.subtitle')}</p>
      </div>
      <ul className="w-full max-w-xs space-y-2 text-start">
        {STEP_KEYS.map((key, i) => (
          <li
            key={key}
            className={`text-sm flex items-center gap-2 ${
              i <= activeStep ? 'text-gray-900' : 'text-gray-300'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                i < activeStep ? 'bg-gray-900' : i === activeStep ? 'bg-gray-900 animate-pulse' : 'bg-gray-200'
              }`}
              aria-hidden="true"
            />
            <span>{t(key)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
