import { Card, CardContent } from "@/components/ui/card";

interface SummaryCardProps {
    count: number;
    total: number;
    label: string;
    color: string;
    showValue?: boolean;
}

export function SummaryCard({ count, total, label, color, showValue = true }: SummaryCardProps) {
    const formatMoney = (val: number) => {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val || 0);
    };

    return (
        <Card className="bg-card border-border shadow-sm">
            <CardContent className="p-2 py-3 text-center flex flex-col items-center justify-center h-full space-y-1">
                <span className={`text-xl font-bold ${color}`}>{count}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">{label}</span>
                {showValue && (
                    <div className="w-full pt-1 mt-1 border-t border-[#FDFDFD]/5">
                        <p className="text-[10px] text-muted-foreground font-mono">{formatMoney(total)}</p>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
