import { useRef, useState, type ReactNode } from 'react'

export interface AccordionItemDef {
  id: string
  title: string
  subtitle?: string
  headerExtra?: ReactNode
  body: ReactNode
  disabled?: boolean
  statusLabel?: string
}

export type AccordionVariant = 'card' | 'flat'

export interface AccordionProps {
  items: AccordionItemDef[]
  variant?: AccordionVariant
}

export default function Accordion({ items, variant = 'card' }: AccordionProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  const headerRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const onToggle = (id: string) => {
    setOpenId((prev) => {
      const next = prev === id ? null : id
      if (next) {
        requestAnimationFrame(() => {
          const el = headerRefs.current[next]
          if (el && typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        })
      }
      return next
    })
  }

  return (
    <div>
      {items.map((item, index) => {
        const isOpen = openId === item.id && !item.disabled
        return (
          <AccordionItem
            key={item.id}
            item={item}
            isOpen={isOpen}
            variant={variant}
            isFirst={index === 0}
            onToggle={() => {
              if (item.disabled) return
              onToggle(item.id)
            }}
            headerRef={(el) => {
              headerRefs.current[item.id] = el
            }}
          />
        )
      })}
    </div>
  )
}

interface AccordionItemProps {
  item: AccordionItemDef
  isOpen: boolean
  variant: AccordionVariant
  isFirst: boolean
  onToggle: () => void
  headerRef: (el: HTMLButtonElement | null) => void
}

function AccordionItem({
  item,
  isOpen,
  variant,
  isFirst,
  onToggle,
  headerRef,
}: AccordionItemProps) {
  const disabled = !!item.disabled
  const isFlat = variant === 'flat'
  const sectionStyle: React.CSSProperties = isFlat
    ? {
        borderTop: isFirst ? 'none' : '0.5px solid #E5E7EB',
        opacity: disabled ? 0.55 : 1,
      }
    : {
        border: '0.5px solid #E5E7EB',
        marginBottom: '0.75rem',
        opacity: disabled ? 0.55 : 1,
      }
  return (
    <section
      className={`bg-white ${isFlat ? '' : 'rounded-xl overflow-hidden'}`}
      style={sectionStyle}
    >
      <button
        ref={headerRef}
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-controls={`acc-body-${item.id}`}
        aria-disabled={disabled}
        className="w-full flex items-center justify-between gap-3 text-start"
        style={{
          padding: isFlat ? '10px 14px' : '12px 14px',
          minHeight: isFlat ? 44 : 48,
          backgroundColor: isOpen ? '#FAFAFA' : 'transparent',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <span className="text-[13px] font-medium text-gray-900 truncate">
            {item.title}
          </span>
          {item.subtitle ? (
            <span
              className="text-[11px] text-gray-500 leading-snug"
              dir="auto"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {item.subtitle}
            </span>
          ) : null}
          {item.headerExtra ? <div className="mt-0.5">{item.headerExtra}</div> : null}
        </div>
        <span className="flex items-center gap-2 shrink-0">
          {item.statusLabel ? (
            <span className="text-[11px] text-gray-400">{item.statusLabel}</span>
          ) : null}
          {disabled ? (
            <Spinner />
          ) : item.statusLabel ? (
            <Spinner />
          ) : (
            <span
              aria-hidden
              className="text-[11px] text-gray-500 transition-transform duration-200 inline-block"
              style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              ▾
            </span>
          )}
        </span>
      </button>

      <div
        id={`acc-body-${item.id}`}
        className="grid transition-all duration-200 ease-out"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div style={{ borderTop: '0.5px solid #F1F1F1' }}>{item.body}</div>
        </div>
      </div>
    </section>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block animate-spin"
      style={{
        width: 12,
        height: 12,
        border: '1.5px solid #E5E7EB',
        borderTopColor: '#5F5E5A',
        borderRadius: '50%',
      }}
    />
  )
}
