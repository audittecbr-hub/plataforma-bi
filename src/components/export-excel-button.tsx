'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Download, Loader2, FileSpreadsheet } from 'lucide-react'

interface ExportExcelButtonProps {
  urlPath: string
  filename?: string
}

// Meses em português para o seletor
const MESES = [
  { value: 1,  label: 'Janeiro' },
  { value: 2,  label: 'Fevereiro' },
  { value: 3,  label: 'Março' },
  { value: 4,  label: 'Abril' },
  { value: 5,  label: 'Maio' },
  { value: 6,  label: 'Junho' },
  { value: 7,  label: 'Julho' },
  { value: 8,  label: 'Agosto' },
  { value: 9,  label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
]

export function ExportExcelButton({ urlPath, filename = 'relatorio.xlsx' }: ExportExcelButtonProps) {
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)

  // Por padrão, seleciona o mês atual
  const [mesSelecionado, setMesSelecionado] = useState<number | null>(new Date().getMonth() + 1)
  const [anoSelecionado, setAnoSelecionado] = useState<number>(new Date().getFullYear())

  // Gera lista de anos disponíveis (2020 até hoje)
  const anosDisponiveis = Array.from(
    { length: new Date().getFullYear() - 2019 },
    (_, i) => 2020 + i
  ).reverse()

  const handleDownload = async () => {
    try {
      setLoading(true)
      const baseUrl = process.env.NEXT_PUBLIC_CORE_API_URL || 'http://localhost:8000'

      // Monta a URL com ou sem filtro de data
      let url = `${baseUrl}${urlPath}`
      if (mesSelecionado !== null) {
        const params = new URLSearchParams({
          mes: String(mesSelecionado),
          ano: String(anoSelecionado),
        })
        url += `?${params}`
      }

      const response = await fetch(url)
      if (!response.ok) throw new Error('Falha ao exportar Excel')

      // Determina nome do arquivo com base no período selecionado
      const nomeArquivo = mesSelecionado
        ? `${filename.replace('.xlsx', '')}_${MESES[mesSelecionado - 1].label}_${anoSelecionado}.xlsx`
        : `${filename.replace('.xlsx', '')}_Historico_Completo.xlsx`

      const blob = await response.blob()
      const objectUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.setAttribute('download', nomeArquivo)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(objectUrl)

      setOpen(false)
    } catch (error) {
      console.error('Erro na exportação:', error)
      alert('Ocorreu um erro ao gerar o Excel. Verifique se o backend está executando.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Botão principal */}
      <Button
        onClick={() => setOpen(true)}
        variant="outline"
        className="bg-[#D5AE77]/10 text-[#D5AE77] hover:bg-[#D5AE77]/20 border-[#D5AE77]/20 flex gap-2 items-center h-10 px-4 whitespace-nowrap"
      >
        <FileSpreadsheet className="h-4 w-4" />
        <span className="hidden sm:inline">Baixar Relatório</span>
      </Button>

      {/* Dialog de seleção de período */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm bg-[#1F1F1F] border border-[#D5AE77]/20 text-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#D5AE77] flex items-center gap-2">
              <Download className="h-5 w-5" />
              Baixar Relatório
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-sm text-white/60">
              Selecione o filtro de datas para o relatório:
            </p>

            {/* Alternância de Modo (Abas Minimalistas) */}
            <div className="flex gap-1 bg-[#D5AE77]/5 p-1 rounded-md border border-[#D5AE77]/10">
              <button
                onClick={() => setMesSelecionado(null)}
                className={`flex-1 py-2 text-xs font-semibold rounded transition-all ${
                  mesSelecionado === null
                    ? 'bg-[#D5AE77] text-black shadow-sm'
                    : 'text-white/50 hover:text-[#D5AE77] hover:bg-[#D5AE77]/10'
                }`}
              >
                Todo o Histórico
              </button>
              <button
                onClick={() => {
                  if (mesSelecionado === null) setMesSelecionado(new Date().getMonth() + 1)
                }}
                 className={`flex-1 py-2 text-xs font-semibold rounded transition-all ${
                  mesSelecionado !== null
                    ? 'bg-[#D5AE77] text-black shadow-sm'
                    : 'text-white/50 hover:text-[#D5AE77] hover:bg-[#D5AE77]/10'
                }`}
              >
                Mês Específico
              </button>
            </div>

            {/* Seletor Mês/Ano Condicional */}
            {mesSelecionado !== null && (
              <div className="pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
                  <span className="text-sm text-white/80 font-medium tracking-wide">Ano Base:</span>
                  <select
                    value={anoSelecionado}
                    onChange={(e) => setAnoSelecionado(Number(e.target.value))}
                    className="bg-transparent text-sm text-[#D5AE77] font-semibold cursor-pointer focus:outline-none"
                  >
                    {anosDisponiveis.map((ano) => (
                      <option key={ano} value={ano} className="bg-[#1C1410] text-white py-1">
                        {ano}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  {MESES.map((mes) => (
                    <button
                      key={mes.value}
                      onClick={() => setMesSelecionado(mes.value)}
                      className={`px-2 py-2 rounded text-xs font-medium transition-colors border ${
                        mesSelecionado === mes.value
                          ? 'bg-[#D5AE77]/10 border-[#D5AE77]/50 text-[#D5AE77]'
                          : 'bg-transparent border-white/5 text-white/50 hover:border-white/20 hover:text-white/80'
                      }`}
                    >
                      {mes.label.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              className="text-white/50 hover:text-white"
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDownload}
              disabled={loading}
              className="bg-[#D5AE77] text-black hover:bg-[#D5AE77]/90 gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {loading ? 'Gerando...' : 'Baixar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
