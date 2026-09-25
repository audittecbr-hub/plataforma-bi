'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { IconBadge } from '@/components/ui/icon-badge'
import { CheckOption, FormSection, IconAction } from '@/components/admin/admin-ui'
import { CalendarClock, LoaderCircle, Pencil, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { manageSchedule, type AutomationSchedule, type AutomationDefinition, type AutomationContact, type AutomationTemplate } from '@/app/actions/automation'
import { toast } from "sonner"
import { cn } from '@/lib/utils'

interface ScheduleDialogProps {
  scheduleToEdit?: AutomationSchedule
  definitions: AutomationDefinition[]
  contacts: AutomationContact[]
  templates?: AutomationTemplate[]
}

const DAYS = [
    { value: 0, label: 'Domingo', short: 'Dom' },
    { value: 1, label: 'Segunda-feira', short: 'Seg' },
    { value: 2, label: 'Terça-feira', short: 'Ter' },
    { value: 3, label: 'Quarta-feira', short: 'Qua' },
    { value: 4, label: 'Quinta-feira', short: 'Qui' },
    { value: 5, label: 'Sexta-feira', short: 'Sex' },
    { value: 6, label: 'Sábado', short: 'Sáb' },
]

export function ScheduleDialog({ scheduleToEdit, definitions, contacts, templates = [] }: ScheduleDialogProps) {
  const [open, setOpen] = useState(false)
  const isEditing = !!scheduleToEdit
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  // Form State
  const [name, setName] = useState(scheduleToEdit?.name || '')
  const [defId, setDefId] = useState(scheduleToEdit?.automation_definition_id || '')
  const [templateId, setTemplateId] = useState<string>(scheduleToEdit?.template_id || 'default')
  const [time, setTime] = useState(scheduleToEdit?.scheduled_time || '09:00:00')
  const [displayTime, setDisplayTime] = useState((scheduleToEdit?.scheduled_time || '09:00:00').slice(0, 5))
  const [selectedDays, setSelectedDays] = useState<number[]>(scheduleToEdit?.days_of_week || [1,2,3,4,5]) // Default Mon-Fri
  const [selectedContacts, setSelectedContacts] = useState<string[]>(scheduleToEdit?.recipients?.map(r => r.id) || [])
  const [isActive, setIsActive] = useState(scheduleToEdit?.active ?? true)

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(scheduleToEdit?.name || '')
      setDefId(scheduleToEdit?.automation_definition_id || '')
      setTemplateId(scheduleToEdit?.template_id || 'default')
      setTime(scheduleToEdit?.scheduled_time || '09:00:00')
      setDisplayTime((scheduleToEdit?.scheduled_time || '09:00:00').slice(0, 5))
      setSelectedDays(scheduleToEdit?.days_of_week || [1,2,3,4,5])
      setSelectedContacts(scheduleToEdit?.recipients?.map(r => r.id) || [])
      setIsActive(scheduleToEdit?.active ?? true)
    }
  }, [open, scheduleToEdit])

  const handleDayToggle = (day: number) => {
    if (selectedDays.includes(day)) {
        setSelectedDays(selectedDays.filter(d => d !== day))
    } else {
        setSelectedDays([...selectedDays, day].sort())
    }
  }

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/[^0-9]/g, '');
    if (value.length > 4) value = value.slice(0, 4);

    if (value.length > 2) {
      value = `${value.slice(0, 2)}:${value.slice(2)}`;
    }

    setDisplayTime(value);

    if (value.length === 5) {
       const [h, m] = value.split(':');
       // Validate 24h format
       if (Number(h) < 24 && Number(m) < 60) {
           setTime(`${value}:00`);
       }
    }
  }

  const handleContactToggle = (id: string) => {
    if (selectedContacts.includes(id)) {
        setSelectedContacts(selectedContacts.filter(c => c !== id))
    } else {
        setSelectedContacts([...selectedContacts, id])
    }
  }

  async function handleSave() {
    setIsLoading(true)

    const payload = {
        id: scheduleToEdit?.id,
        name,
        automation_definition_id: defId,
        template_id: templateId === 'default' ? null : templateId,
        scheduled_time: time,
        days_of_week: selectedDays,
        active: isActive,
        recipient_ids: selectedContacts
    }

    const result = await manageSchedule(payload)

    if (result.success) {
      setOpen(false)
      toast.success(isEditing ? "Agendamento atualizado com sucesso!" : "Agendamento criado com sucesso!")
      router.refresh()
    } else {
      toast.error(result.error || 'Operação falhou')
    }
    setIsLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
          {isEditing ? (
            <IconAction label="Editar agendamento" icon={Pencil} />
          ) : (
            <Button>
                <Plus /> Nova automação
            </Button>
          )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="flex-row items-start gap-4 space-y-0">
          <IconBadge icon={CalendarClock} />
          <div className="space-y-1.5">
            <DialogTitle>{isEditing ? 'Editar agendamento' : 'Novo agendamento'}</DialogTitle>
            <DialogDescription>
              Configure quando e para quem o relatório deve ser enviado.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="grid gap-6">
          <FormSection title="Relatório">
            <div className="grid gap-2">
              <Label htmlFor="sched-name">Nome da automação</Label>
              <Input
                  id="sched-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex.: Metas matinal Diretoria"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                  <Label htmlFor="sched-def">Tipo de relatório</Label>
                  <Select value={defId} onValueChange={setDefId}>
                      <SelectTrigger id="sched-def" className="w-full">
                          <SelectValue placeholder="Selecione…" />
                      </SelectTrigger>
                      <SelectContent>
                          {definitions.map(d => (
                              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                          ))}
                      </SelectContent>
                  </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sched-template">Template de mensagem</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                    <SelectTrigger id="sched-template" className="w-full">
                        <SelectValue placeholder="Padrão do sistema" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="default">Padrão da definição</SelectItem>
                        {templates.map(t => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">Escolha &quot;Padrão&quot; para usar o template definido na rotina ou selecione um personalizado.</p>
          </FormSection>

          <FormSection title="Quando">
            <div className="grid gap-4 sm:grid-cols-[140px_1fr] sm:items-end">
              <div className="grid gap-2">
                   <Label htmlFor="sched-time">Horário</Label>
                   <Input
                      id="sched-time"
                      placeholder="HH:MM"
                      value={displayTime}
                      onChange={handleTimeChange}
                      maxLength={5}
                      inputMode="numeric"
                      className="h-12 text-center text-lg font-extrabold tabular-nums tracking-[0.06em]"
                   />
              </div>
              <div className="grid gap-2">
                 <Label>Dias da semana</Label>
                 <div className="flex flex-wrap gap-1.5">
                    {DAYS.map(day => {
                        const on = selectedDays.includes(day.value)
                        return (
                            <button
                                key={day.value}
                                type="button"
                                onClick={() => handleDayToggle(day.value)}
                                aria-pressed={on}
                                aria-label={day.label}
                                className={cn(
                                    "h-12 min-w-12 flex-1 rounded-[4px] border px-2 text-[13px] font-semibold outline-none transition-colors duration-200",
                                    "focus-visible:ring-[3px] focus-visible:ring-ring/25",
                                    on
                                      ? "border-ink bg-ink text-white dark:border-white dark:bg-white dark:text-ink"
                                      : "bg-surface text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                                )}
                            >
                                {day.short}
                            </button>
                        )
                    })}
                 </div>
              </div>
            </div>
          </FormSection>

          <FormSection title={`Destinatários (${selectedContacts.length})`}>
            <div className="grid max-h-[220px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {contacts.map(c => (
                     <CheckOption key={c.id} htmlFor={`contact-${c.id}`}>
                        <Checkbox
                            id={`contact-${c.id}`}
                            checked={selectedContacts.includes(c.id)}
                            onCheckedChange={() => handleContactToggle(c.id)}
                        />
                        <span className="truncate">{c.name}</span>
                     </CheckOption>
                ))}
                {contacts.length === 0 && <p className="text-sm text-muted-foreground">Nenhum contato disponível.</p>}
            </div>
          </FormSection>

          <label htmlFor="sched-active" className="flex cursor-pointer items-center justify-between gap-4 border-t pt-5">
            <span className="space-y-0.5">
              <span className="block text-[13px] font-semibold text-foreground">Agendamento ativo</span>
              <span className="block text-xs text-muted-foreground">Desative para pausar os envios sem perder a configuração.</span>
            </span>
            <Switch id="sched-active" checked={isActive} onCheckedChange={setIsActive} />
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
                {isLoading && <LoaderCircle className="animate-spin" />}
                {isLoading ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
