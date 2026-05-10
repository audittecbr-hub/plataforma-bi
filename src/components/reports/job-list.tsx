"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, User, Building2, FileText } from "lucide-react";

interface JobListProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: any[];
    type: string;
}

export function JobList({ items, type }: JobListProps) {
    
    // Formatting Helpers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sanitize = (val: any) => {
        if (!val || String(val).toUpperCase() === "NULL" || val === "None" || val === "") return <span className="text-[#FDFDFD]/30 italic">Não Informado</span>;
        return val;
    };

    if (!items || items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-[#FDFDFD]/40 space-y-3 border border-dashed border-[#FDFDFD]/10 rounded-2xl bg-[#1F1F1F]/20">
                <Briefcase className="w-8 h-8 opacity-20" />
                <p className="text-sm font-medium">Nenhum job encontrado</p>
            </div>
        )
    }

    // Styles based on type
    const borderColor = type === 'new' ? 'border-[#4ADE80]/50' : 'border-[#F87171]/50';

    const sideBarColor = type === 'new' ? 'bg-[#4ADE80]' : 'bg-[#F87171]';
    const hoverColor = type === 'new' ? 'hover:shadow-[0_0_15px_-3px_rgba(74,222,128,0.2)]' : 'hover:shadow-[0_0_15px_-3px_rgba(248,113,113,0.2)]';

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-4">
                {items.map((item) => {
                    const jobId = item.job || item.id;
                    const clientInfo = `${item.cliente_id || 'N/A'} | ${item.cnpj || 'N/A'}`;
                    
                    return (
                        <Card key={item.id} className={`bg-[#18181b] border ${borderColor} overflow-hidden transition-all duration-300 ${hoverColor} group h-full flex flex-col`}>
                            <CardContent className="p-0 relative h-full flex flex-col flex-1">
                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${sideBarColor}`} />
                                
                                <div className="p-4 pl-5 flex-1 flex flex-col gap-4">
                                    <div className="flex justify-between items-start gap-3">
                                        <h3 className="font-bold text-[#FDFDFD] text-lg leading-snug tracking-wide">
                                            JOB: {jobId}
                                        </h3>
                                        <Badge variant="outline" className="shrink-0 bg-[#27272a] border-[#FDFDFD]/10 text-[10px] text-[#A1A1AA] font-normal px-2 py-0.5 h-6">
                                            {item.modelo_nome || `Modelo ${item.modelo}`}
                                        </Badge>
                                    </div>

                                    <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-xs">
                                        <div className="space-y-1 col-span-2">
                                            <div className="flex items-center gap-1.5 text-[#71717A] text-[10px] uppercase font-bold tracking-wider">
                                                <Building2 className="w-3 h-3" /> Cliente / CNPJ
                                            </div>
                                            <p className="text-[#E4E4E7] font-medium truncate">
                                                {clientInfo}
                                            </p>
                                        </div>
                                        
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 text-[#71717A] text-[10px] uppercase font-bold tracking-wider">
                                                <FileText className="w-3 h-3" /> Data Cadastro
                                            </div>
                                            <p className="text-[#E4E4E7] font-medium">
                                                {item.data_cadastro ? new Date(item.data_cadastro).toLocaleDateString("pt-BR") : "-"}
                                            </p>
                                        </div>

                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 text-[#71717A] text-[10px] uppercase font-bold tracking-wider">
                                                Divisão
                                            </div>
                                            <p className="text-[#E4E4E7] font-medium truncate">
                                                {sanitize(item.job_divisao)}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="px-4 py-3 bg-[#27272a]/30 border-t border-[#FDFDFD]/5 flex items-center justify-between mt-auto">
                                    <div className="flex items-center gap-2 text-[#A1A1AA]">
                                        <User className="w-3.5 h-3.5" />
                                        <span className="text-[10px] font-medium uppercase tracking-wide truncate max-w-[200px]" title={item.responsavel_comercial}>
                                            {sanitize(item.responsavel_comercial)}
                                        </span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}
