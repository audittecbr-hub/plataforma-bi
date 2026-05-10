
'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'

export interface QueueJob {
  id: string
  schedule_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  logs: string | null
  created_at: string
  updated_at: string
}

export function useRealtimeQueue() {
  const [jobs, setJobs] = useState<Record<string, QueueJob>>({})
  const jobsRef = useRef(jobs)
  const supabase = createClient()

  // Keep ref in sync (workaround for closure in interval)
  useEffect(() => {
    jobsRef.current = jobs
  }, [jobs])

  useEffect(() => {
    // 1. Initial Fetch
    const fetchInitial = async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

      const { data } = await supabase
        .from('automation_queue')
        .select('*')
        .or(`status.in.(pending,processing),and(status.eq.completed,created_at.gt.${twoHoursAgo}),and(status.eq.failed,created_at.gt.${twoHoursAgo})`)
        .order('created_at', { ascending: false })
        .limit(50)

      if (data) {
        const map: Record<string, QueueJob> = {}
        data.forEach((job) => {
          if (!map[job.schedule_id]) {
            map[job.schedule_id] = job as QueueJob
          }
        })
        setJobs(prev => ({ ...prev, ...map }))
      }
    }

    fetchInitial()

    // 2. Realtime Subscription
    const channel = supabase
      .channel('automation_queue_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_queue' }, (payload) => {
          const newJob = payload.new as QueueJob
          if (!newJob?.schedule_id) return
          setJobs(prev => ({ ...prev, [newJob.schedule_id]: newJob }))
          
          if (newJob.status === 'completed') {
             toast.success("Automação concluída!", { description: `Agendamento finalizado com sucesso.` })
          }
          if (newJob.status === 'failed') {
             toast.error("Falha na automação", { description: "Verifique os logs." })
          }
      })
      .subscribe()

    // 3. Polling de segurança (fallback caso a subscription Realtime falhe).
    // Intervalo de 10s — a subscription já cobre atualizações em tempo real;
    // o polling é apenas um mecanismo de recuperação para jobs travados em 'processing'.
    const interval = setInterval(async () => {
        const currentJobs = jobsRef.current
        const processingIds = Object.values(currentJobs)
            .filter(j => j.status === 'processing')
            .map(j => j.id)

        // Só consulta o banco se há jobs em andamento
        if (processingIds.length === 0) return

        const { data } = await supabase
            .from('automation_queue')
            .select('*')
            .in('id', processingIds)

        if (data) {
            setJobs(prev => {
                const next = { ...prev }
                let changed = false
                data.forEach(job => {
                    if (prev[job.schedule_id]?.status !== job.status) {
                        next[job.schedule_id] = job as QueueJob
                        changed = true
                    }
                })
                return changed ? next : prev
            })
        }
    }, 10000) // 10s — reduzido de 2s; subscription Realtime cobre atualizações imediatas

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Empty dependency array -> Runs once on mount

  return { jobs }
}
