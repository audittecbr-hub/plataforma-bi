"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, User, Wallet, ChevronLeft, ChevronRight } from "lucide-react";

const ITEMS_PER_PAGE = 12

// Definir tipos estritos ou reutilizar existentes se exportados, mas por enquanto correspondendo às props usadas
interface UnitListProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: any[];
    type: string;
}

export function UnitList({ items, type }: UnitListProps) {
    const [currentPage, setCurrentPage] = useState(1)

    const totalPages = Math.ceil((items?.length ?? 0) / ITEMS_PER_PAGE)
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const paginatedItems = items?.slice(startIndex, startIndex + ITEMS_PER_PAGE) ?? []

    const formatMoney = (value: number) => {
        if (value === undefined || value === null) return "Não Informado";
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    };



    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const checkDisplay = (val: any) => {
        if (!val || val === "N/A" || val === "-" || val === "") return <span className="text-[#FDFDFD]/30 italic">Não Informado</span>;
        return val;
    }
    
    // Auxiliar para atributos que precisam de strings puras
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const checkString = (val: any) => {
        if (!val || val === "N/A" || val === "-" || val === "") return "Não Informado";
        return String(val);
    }

    if (!items || items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-[#FDFDFD]/40 space-y-3 border border-dashed border-[#FDFDFD]/10 rounded-2xl bg-[#1F1F1F]/20">
                <Building2 className="w-8 h-8 opacity-20" />
                <p className="text-sm font-medium">Nenhum registro encontrado</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-4">
                {paginatedItems.map((item) => {
                    const nome = checkDisplay(item.unidade?.nome);

                    
                    const consultor = checkDisplay(item.consultor?.nome);
                    const consultorTitle = checkString(item.consultor?.nome);
                    
                    // Priorizar modelo_nome (injetado) ou raw_data
                    const rawModel = item.modelo_nome || item.raw_data?.modelo_nome || item.raw_data?.modelo;
                    const modeloName = rawModel 
                        ? (String(rawModel).match(/^\d+$/) ? `Modelo ${rawModel}` : rawModel) 
                        : "Modelo N/A";
                    
                    const rede = item.raw_data?.tipo_nome || item.tipo || "N/A";

                    const borderColor = type === 'new' ? 'border-[#4ADE80]/50' : type === 'cancelled' ? 'border-[#F87171]/50' : 'border-[#D5AE77]/50';
                    const iconColor = type === 'new' ? 'text-[#4ADE80]' : type === 'cancelled' ? 'text-[#F87171]' : 'text-[#D5AE77]';
                    const sideBarColor = type === 'new' ? 'bg-[#4ADE80]' : type === 'cancelled' ? 'bg-[#F87171]' : 'bg-[#D5AE77]';
                    const hoverColor = type === 'new' ? 'hover:shadow-[0_0_15px_-3px_rgba(74,222,128,0.2)]' : type === 'cancelled' ? 'hover:shadow-[0_0_15px_-3px_rgba(248,113,113,0.2)]' : 'hover:shadow-[0_0_15px_-3px_rgba(213,174,119,0.2)]';

                    // Helper for standard "Não Informado" logic
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const renderValue = (val: any, suffix: string = "") => {
                        if (!val && val !== 0) return <span className="text-[#FDFDFD]/30 italic">Não Informado</span>;
                        return `${val}${suffix}`;
                    };
                    
                    const anosContrato = item.anos_contrato;

                    return (
                        <Card key={item.id} className={`bg-[#18181b] border ${borderColor} overflow-hidden transition-all duration-300 ${hoverColor} group h-full flex flex-col`}>
                            <CardContent className="p-0 relative h-full flex flex-col flex-1">
                                {/* Linha Indicadora de Status */}
                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${sideBarColor}`} />
                                
                                <div className="p-4 pl-5 flex-1 flex flex-col gap-4">
                                    <div className="flex justify-between items-start gap-3">
                                        <h3 className="font-bold text-[#FDFDFD] text-sm leading-snug line-clamp-2 uppercase tracking-wide">
                                            {nome}
                                        </h3>
                                        {rede !== "N/A" && (
                                            <Badge variant="outline" className="shrink-0 bg-[#27272a] border-[#FDFDFD]/10 text-[10px] text-[#A1A1AA] font-normal px-2 py-0.5 h-6">
                                                {rede}
                                            </Badge>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-xs">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 text-[#71717A] text-[10px] uppercase font-bold tracking-wider">
                                                <Building2 className="w-3 h-3" /> Local
                                            </div>
                                            <p className="text-[#E4E4E7] font-medium truncate">
                                                {(() => {
                                                    const rawCidade = item.unidade?.cidade;
                                                    const rawUf = item.unidade?.uf;
                                                    const isCidadeBad = !rawCidade || rawCidade === "N/A" || rawCidade === "-" || rawCidade === "Não Informado";
                                                    const isUfBad = !rawUf || rawUf === "N/A" || rawUf === "-" || rawUf === "Não Informado";
                                                    
                                                    if (isCidadeBad && isUfBad) return <span className="text-[#FDFDFD]/30 italic">Não Informado</span>;
                                                    
                                                    const c = isCidadeBad ? "Não Informado" : rawCidade;
                                                    const u = isUfBad ? "Não Informado" : rawUf;
                                                    return `${c} - ${u}`;
                                                })()}
                                            </p>
                                        </div>
                                        
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 text-[#71717A] text-[10px] uppercase font-bold tracking-wider">
                                                <Wallet className="w-3 h-3" /> Valor
                                            </div>
                                            <p className={`font-mono font-medium ${iconColor}`}>
                                                {item.valor !== undefined && item.valor !== null ? formatMoney(Number(item.valor)) : <span className="text-[#FDFDFD]/30 italic">Não Informado</span>}
                                            </p>
                                        </div>
                                        
                                        <div className="space-y-1">
                                             <div className="flex items-center gap-1.5 text-[#71717A] text-[10px] uppercase font-bold tracking-wider">
                                                Tempo Contrato
                                            </div>
                                            <p className="text-[#E4E4E7] font-medium truncate">
                                                {renderValue(anosContrato, " Anos")}
                                            </p>
                                        </div>

                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 text-[#71717A] text-[10px] uppercase font-bold tracking-wider">
                                                % Retenção
                                            </div>
                                            <p className="text-[#E4E4E7] font-medium truncate">
                                                {renderValue(item.percentual_retencao, "%")}
                                            </p>
                                        </div>

                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 text-[#71717A] text-[10px] uppercase font-bold tracking-wider">
                                                Royalties
                                            </div>
                                            <p className="text-[#E4E4E7] font-medium truncate">
                                                {renderValue(item.royalties || null, "%")}
                                            </p>
                                        </div>

                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 text-[#71717A] text-[10px] uppercase font-bold tracking-wider">
                                                CRM
                                            </div>
                                            <p className="text-[#E4E4E7] font-medium truncate">
                                                {item.crm ? formatMoney(item.crm) : <span className="text-[#FDFDFD]/30 italic">Não Informado</span>}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="px-4 py-3 bg-[#27272a]/30 border-t border-[#FDFDFD]/5 flex items-center justify-between mt-auto">
                                    <div className="flex items-center gap-2 text-[#A1A1AA]">
                                        <User className="w-3.5 h-3.5" />
                                        <span className="text-[10px] font-medium uppercase tracking-wide truncate max-w-[140px]" title={consultorTitle}>
                                            {consultor}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-[#52525B] font-mono">{modeloName}</span>
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            {/* Controles de paginação — só exibidos quando há mais de uma página */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-[#FDFDFD]/10 pt-4">
                    <p className="text-xs text-[#FDFDFD]/40">
                        {startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, items.length)} de{" "}
                        <span className="text-[#FDFDFD]/70 font-medium">{items.length}</span> registros
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="h-8 w-8 p-0 border-[#FDFDFD]/10 text-[#FDFDFD]/60 hover:bg-[#FDFDFD]/5 disabled:opacity-30"
                            aria-label="Página anterior"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-xs text-[#FDFDFD]/50 min-w-[4rem] text-center">
                            {currentPage} / {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="h-8 w-8 p-0 border-[#FDFDFD]/10 text-[#FDFDFD]/60 hover:bg-[#FDFDFD]/5 disabled:opacity-30"
                            aria-label="Próxima página"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
