"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { useTheme } from "next-themes"
import { CornerDownLeft, LogOut, Monitor, Moon, Search, SearchX, Sun, type LucideIcon } from "lucide-react"

import { BrandSeal } from "@/components/brand/logo"
import { COMMAND_MENU_EVENT } from "@/components/topbar"
import { overlayClasses } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { ADMIN_SECTIONS, NAV_ITEMS } from "@/lib/navigation"
import { cn } from "@/lib/utils"

type Command = {
  id: string
  group: string
  label: string
  hint?: string
  icon: LucideIcon
  keywords?: string
  tone?: "danger"
  run: () => void
}

/** Busca sem acento e sem caixa: "configuracoes" encontra "Configurações". */
function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

interface CommandMenuProps {
  isAdmin: boolean
  signOutAction: () => Promise<void>
}

/**
 * Paleta de comandos (⌘K / Ctrl+K). Abre também pelo evento
 * `gs:command-menu`, disparado pelo botão de busca da topbar.
 */
export function CommandMenu({ isAdmin, signOutAction }: CommandMenuProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const { setTheme } = useTheme()
  const [, startSignOut] = useTransition()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((atual) => !atual)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener(COMMAND_MENU_EVENT, onOpen)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener(COMMAND_MENU_EVENT, onOpen)
    }
  }, [])

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href)
    return [
      ...NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => ({
        id: `nav:${item.href}`,
        group: "Navegação",
        label: item.label,
        hint: item.description,
        icon: item.icon,
        run: go(item.href),
      })),
      ...(isAdmin
        ? ADMIN_SECTIONS.map((section) => ({
            id: `admin:${section.tab}`,
            group: "Administração",
            label: section.label,
            hint: section.description,
            icon: section.icon,
            keywords: "admin gestao painel",
            run: go(`/dashboard/admin?tab=${section.tab}`),
          }))
        : []),
      {
        id: "theme:light",
        group: "Aparência",
        label: "Tema claro",
        hint: "Ivory",
        icon: Sun,
        keywords: "light tema aparencia",
        run: () => setTheme("light"),
      },
      {
        id: "theme:dark",
        group: "Aparência",
        label: "Tema escuro",
        hint: "Obsidian",
        icon: Moon,
        keywords: "dark tema aparencia noturno",
        run: () => setTheme("dark"),
      },
      {
        id: "theme:system",
        group: "Aparência",
        label: "Seguir o sistema",
        hint: "Automático",
        icon: Monitor,
        keywords: "system tema aparencia automatico",
        run: () => setTheme("system"),
      },
      {
        id: "session:logout",
        group: "Sessão",
        label: "Sair do portal",
        hint: "Encerrar a sessão neste dispositivo",
        icon: LogOut,
        keywords: "logout sair encerrar desconectar",
        tone: "danger" as const,
        run: () =>
          startSignOut(async () => {
            await signOutAction()
          }),
      },
    ]
  }, [isAdmin, router, setTheme, signOutAction])

  const run = (command: Command) => {
    setOpen(false)
    command.run()
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayClasses} />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-[12vh] z-50 w-[min(640px,calc(100%-1.5rem))] -translate-x-1/2 overflow-hidden",
            "rounded-xl border bg-popover text-popover-foreground shadow-xl outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=open]:slide-in-from-top-2 data-[state=open]:duration-300 data-[state=open]:ease-out-brand",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.98] data-[state=closed]:duration-150"
          )}
        >
          <DialogPrimitive.Title className="sr-only">Paleta de comandos</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Busque uma página, seção ou ação e pressione Enter para executar.
          </DialogPrimitive.Description>
          {/* O conteúdo remonta a cada abertura: busca e seleção começam do zero. */}
          <CommandPalette commands={commands} onRun={run} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function CommandPalette({ commands, onRun }: { commands: Command[]; onRun: (command: Command) => void }) {
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const results = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return commands
    return commands.filter((c) => normalize(`${c.label} ${c.hint ?? ""} ${c.group} ${c.keywords ?? ""}`).includes(q))
  }, [commands, query])

  const activeIndex = results.length === 0 ? -1 : Math.min(active, results.length - 1)
  const activeCommand = activeIndex >= 0 ? results[activeIndex] : undefined

  useEffect(() => {
    if (activeCommand) itemRefs.current.get(activeCommand.id)?.scrollIntoView({ block: "nearest" })
  }, [activeCommand])

  const groups = useMemo(() => {
    const map = new Map<string, { command: Command; index: number }[]>()
    results.forEach((command, index) => {
      const list = map.get(command.group) ?? []
      list.push({ command, index })
      map.set(command.group, list)
    })
    return Array.from(map.entries())
  }, [results])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((activeIndex + 1) % results.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((activeIndex - 1 + results.length) % results.length)
    } else if (e.key === "Home") {
      e.preventDefault()
      setActive(0)
    } else if (e.key === "End") {
      e.preventDefault()
      setActive(results.length - 1)
    } else if (e.key === "Enter" && activeCommand) {
      e.preventDefault()
      onRun(activeCommand)
    }
  }

  return (
    <div className="flex max-h-[min(560px,76vh)] flex-col">
      <div className="relative flex items-center gap-3 border-b px-4">
        <Search aria-hidden className="size-[18px] shrink-0 text-gold" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          placeholder="Buscar páginas, seções e ações…"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-list"
          aria-activedescendant={activeCommand ? `command-${activeCommand.id}` : undefined}
          aria-autocomplete="list"
          className="h-14 w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-faint"
        />
        <Kbd className="shrink-0">esc</Kbd>
        <span aria-hidden className="pointer-events-none absolute -bottom-px left-4 h-[2px] w-10 bg-gold" />
      </div>

      <div id="command-list" role="listbox" aria-label="Resultados" className="flex-1 overflow-y-auto p-2">
        {results.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span className="grid size-11 place-items-center rounded-[4px] bg-muted text-muted-foreground">
              <SearchX className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">
              Nada encontrado para <span className="font-medium text-foreground">“{query}”</span>.
            </p>
          </div>
        ) : (
          groups.map(([group, items]) => (
            <div key={group} role="group" aria-label={group} className="pb-1.5">
              <p className="eyebrow px-3 pb-1.5 pt-2.5 text-[10px] text-faint">{group}</p>
              {items.map(({ command, index }) => {
                const Icon = command.icon
                const selected = index === activeIndex
                return (
                  <button
                    key={command.id}
                    id={`command-${command.id}`}
                    ref={(el) => {
                      if (el) itemRefs.current.set(command.id, el)
                      else itemRefs.current.delete(command.id)
                    }}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    tabIndex={-1}
                    onMouseMove={() => index !== activeIndex && setActive(index)}
                    onClick={() => onRun(command)}
                    className={cn(
                      "relative flex w-full items-center gap-3 rounded-[4px] px-3 py-2.5 text-left outline-none transition-colors",
                      selected ? "bg-accent" : "hover:bg-accent/60"
                    )}
                  >
                    {selected && (
                      <span
                        aria-hidden
                        className="absolute inset-y-2.5 left-0 w-[3px] bg-gold"
                      />
                    )}
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-[4px] transition-colors",
                        command.tone === "danger"
                          ? "bg-danger/10 text-danger"
                          : selected
                            ? "bg-gold-wash text-gold-text"
                            : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm font-semibold",
                          command.tone === "danger" ? "text-danger" : "text-foreground"
                        )}
                      >
                        {command.label}
                      </span>
                      {command.hint && (
                        <span className="block truncate text-xs text-muted-foreground">{command.hint}</span>
                      )}
                    </span>
                    <CornerDownLeft
                      aria-hidden
                      className={cn(
                        "size-4 shrink-0 text-faint transition-opacity",
                        selected ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </button>
                )
              })}
            </div>
          ))
        )}
      </div>

      <div className="flex items-center gap-4 border-t px-4 py-2.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          navegar
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd>
          abrir
        </span>
        <span className="ml-auto flex items-center gap-2">
          <BrandSeal size={18} />
          <span className="eyebrow text-[9.5px] text-faint">Grupo Studio</span>
        </span>
      </div>
    </div>
  )
}
