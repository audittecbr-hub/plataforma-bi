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
import { Plus, Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { manageSchedule, type AutomationSchedule, type AutomationDefinition, type AutomationContact, type AutomationTemplate } from '@/app/actions/automation'
import { toast } from "sonner"

interface ScheduleDialogProps {
  scheduleToEdit?: AutomationSchedule
  definitions: AutomationDefinition[]
  contacts: AutomationContact[]
  templates?: AutomationTemplate[]
}

const DAYS = [
    { value: 0, label: 'Domingo' },
    { value: 1, label: 'Segunda-feira' },
    { value: 2, label: 'Terça-feira' },
    { value: 3, label: 'Quarta-feira' },
    { value: 4, label: 'Quinta-feira' },
    { value: 5, label: 'Sexta-feira' },
    { value: 6, label: 'Sábado' },
]

export function ScheduleDialog({ scheduleToEdit, definitions, contacts, templates = [] }: ScheduleDialogProps) {
  const [open, setOpen] = useState(false)
  const isEditing = !!scheduleToEdit
  const router = useRouter()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
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
    setErrorMessage(null)

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
             <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <span className="sr-only">Editar</span>
                <Pencil className="h-4 w-4" />
            </Button>
          ) : (
            <Button className="bg-[#D5AE77] hover:bg-[#D5AE77]/90 text-primary-foreground">
                <Plus className="mr-2 h-4 w-4" /> Nova Automação
            </Button>
          )}
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-y-auto bg-card text-foreground border-[#D5AE77]/20 rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-[#D5AE77]">{isEditing ? 'Editar Agendamento' : 'Novo Agendamento'}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Configure quando e para quem o relatório deve ser enviado.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="sched-name" className="text-foreground">Nome da Automação</Label>
            <Input 
                id="sched-name" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="Ex: Metas Matinal Diretoria"
                className="bg-background border-input text-foreground" 
            />
          </div>

          <div className="flex gap-4">
             <div className="grid gap-2 flex-1">
                <Label className="text-foreground">Tipo de Relatório</Label>
                <Select value={defId} onValueChange={setDefId}>
                    <SelectTrigger className="bg-background border-input text-foreground">
                        <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent className="bg-background border-border text-foreground">
                        {definitions.map(d => (
                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="grid gap-2 w-[120px] shrink-0">
                 <Label className="text-foreground">Horário</Label>
                 <Input 
                    placeholder="HH:MM"
                    value={displayTime}
                    onChange={handleTimeChange}
                    maxLength={5}
                    className="bg-background border-input text-foreground font-mono tracking-widest text-center text-sm"
                 />
            </div>
          </div>

          <div className="grid gap-2">
            <Label className="text-foreground">Template de Mensagem</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger className="bg-background border-input text-foreground">
                    <SelectValue placeholder="Padrão do Sistema" />
                </SelectTrigger>
                <SelectContent className="bg-background border-border text-foreground">
                    <SelectItem value="default">Padrão da Definição</SelectItem>
                    {templates.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Escolha &quot;Padrão&quot; para usar o template definido na rotina ou selecione um personalizado.</p>
          </div>

          <div className="grid gap-2">
             <Label className="text-foreground">Dias da Semana</Label>
             <div className="flex flex-wrap gap-2">
                {DAYS.map(day => (
                    <div 
                        key={day.value}
                        onClick={() => handleDayToggle(day.value)}
                        className={`
                            cursor-pointer px-3 py-1 rounded-full text-xs border transition-colors
                            ${selectedDays.includes(day.value) 
                                ? 'bg-[#D5AE77] text-black border-[#D5AE77] font-semibold' 
                                : 'bg-transparent text-muted-foreground border-input hover:border-foreground'}
                        `}
                    >
                        {day.label.split('-')[0]}
                    </div>
                ))}
             </div>
          </div>

          <div className="grid gap-2">
            <Label className="text-foreground">Destinatários ({selectedContacts.length})</Label>
            <div className="border border-input rounded-md p-3 max-h-[150px] overflow-y-auto bg-background grid grid-cols-1 sm:grid-cols-2 gap-2">
                {contacts.map(c => (
                     <div key={c.id} className="flex items-center space-x-2">
                        <Checkbox 
                            id={`contact-${c.id}`} 
                            checked={selectedContacts.includes(c.id)}
                            onCheckedChange={() => handleContactToggle(c.id)}
                        />
                        <Label htmlFor={`contact-${c.id}`} className="text-sm cursor-pointer text-muted-foreground truncate">
                            {c.name}
                        </Label>
                     </div>
                ))}
                {contacts.length === 0 && <p className="text-gray-500 text-sm">Nenhum contato disponível.</p>}
            </div>
          </div>


          
          <div className="flex items-center space-x-2 py-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label className="text-foreground">Agendamento Ativo</Label>
          </div>


          
          <DialogFooter>
            <Button onClick={handleSave} className="bg-[#D5AE77] hover:bg-[#D5AE77]/90 text-black font-bold" disabled={isLoading}>
                {isLoading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
