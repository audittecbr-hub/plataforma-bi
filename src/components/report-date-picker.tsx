"use client";

import { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Calendar as CalendarIcon } from "lucide-react";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// --- Helpers ---

const isoToBr = (iso: string | null) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const brToIso = (br: string) => {
  if (!br || br.length !== 10) return "";
  const [d, m, y] = br.split("/");
  return `${y}-${m}-${d}`;
};

const maskDate = (value: string) => {
  let v = value.replace(/\D/g, "");
  if (v.length > 8) v = v.slice(0, 8);
  if (v.length > 4) return `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
  if (v.length > 2) return `${v.slice(0, 2)}/${v.slice(2)}`;
  return v;
};

const parseBrDate = (dateStr: string) => {
    if (dateStr.length !== 10) return undefined;
    const d = parse(dateStr, "dd/MM/yyyy", new Date());
    if (isNaN(d.getTime())) return undefined;
    return d;
};

const getYesterdayIso = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
};

// Calendar classNames for react-day-picker v9 (responsive)
const calendarClassNames = {
  // Layout
  months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
  month: "space-y-2 sm:space-y-4",
  month_caption: "flex justify-center pt-1 relative items-center",
  caption_label: "hidden",
  nav: "space-x-1 flex items-center",
  button_previous: "absolute left-0 h-6 w-6 sm:h-7 sm:w-7 bg-transparent p-0 opacity-50 hover:opacity-100 text-[#D5AE77] hover:bg-[#D5AE77]/20 border border-[#D5AE77]/20 rounded-md flex items-center justify-center",
  button_next: "absolute right-0 h-6 w-6 sm:h-7 sm:w-7 bg-transparent p-0 opacity-50 hover:opacity-100 text-[#D5AE77] hover:bg-[#D5AE77]/20 border border-[#D5AE77]/20 rounded-md flex items-center justify-center",
  chevron: "h-3 w-3 sm:h-4 sm:w-4 fill-[#D5AE77]",
  // Grid (v9 names) - responsive cell sizes
  month_grid: "w-full border-collapse",
  weekdays: "flex w-full",
  weekday: "text-[#828384] h-8 w-8 sm:h-10 sm:w-10 font-normal text-[0.7rem] sm:text-[0.8rem] flex items-center justify-center",
  weeks: "",
  week: "flex w-full",
  day: "h-8 w-8 sm:h-10 sm:w-10 text-xs sm:text-sm p-0 relative flex items-center justify-center [&:has([aria-selected])]:bg-[#322E2B] first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
  day_button: "h-8 w-8 sm:h-10 sm:w-10 p-0 font-normal aria-selected:opacity-100 text-[#FDFDFD] hover:bg-[#322E2B] rounded-md cursor-pointer flex justify-center items-center text-xs sm:text-sm",
  // Day states (v9 names)
  selected: "bg-[#D5AE77] !text-[#322E2B] hover:bg-[#D5AE77] hover:text-[#322E2B] focus:bg-[#D5AE77] focus:text-[#322E2B]",
  today: "bg-[#322E2B] text-[#D5AE77] border border-[#D5AE77]/50",
  outside: "text-muted-foreground opacity-50",
  disabled: "text-muted-foreground opacity-50",
  range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
  hidden: "invisible",
  // Dropdowns
  dropdowns: "flex justify-center gap-1 items-center",
  dropdown: "bg-[#322E2B] text-[#FDFDFD] border border-[#FDFDFD]/10 rounded p-1 text-xs cursor-pointer hover:border-[#D5AE77]",
  months_dropdown: "mr-1",
  years_dropdown: "ml-1",
};

// --- Components ---

export function ReportDatePicker() {
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);

  // Memoize yesterday's date to prevent recalculation on every render
  const yesterdayIso = useMemo(() => getYesterdayIso(), []);
  
  // Derived state from URL (Source of Truth)
  const startParam = searchParams.get("start") || yesterdayIso;
  const endParam = searchParams.get("end") || yesterdayIso;
  const typeParam = searchParams.get("type");
  const isAllParam = typeParam === 'all';

  const displayFrom = isoToBr(startParam);
  const displayTo = isoToBr(endParam);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
            variant="outline" 
            size="sm" 
            className="h-8 bg-[#1f1f1f]/80 border-[#FDFDFD]/10 text-[#FDFDFD] hover:bg-[#322E2B] hover:text-[#D5AE77] gap-2 truncate max-w-[200px]"
        >
          <CalendarDays className="w-4 h-4 shrink-0" />
          <span className="text-xs font-mono truncate">
            {isAllParam ? "Todos os Períodos" : `${displayFrom} - ${displayTo}`}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[90vw] md:w-auto p-4 bg-[#1f1f1f] border-[#FDFDFD]/10 text-[#FDFDFD]" align="center">
        {/* 
            Render the form component.
            Key ensures that if the 'committed' params change externally, 
            the *internal* draft state of the form is reset to match.
            This replaces the need for useEffect synchronization.
        */}
        <ReportDatePickerForm 
            key={`${startParam}-${endParam}-${isAllParam}`}
            initialFrom={displayFrom}
            initialTo={displayTo}
            initialIsAll={isAllParam}
            onClose={() => setIsOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

interface ReportDatePickerFormProps {
    initialFrom: string;
    initialTo: string;
    initialIsAll: boolean;
    onClose: () => void;
}

function ReportDatePickerForm({ initialFrom, initialTo, initialIsAll, onClose }: ReportDatePickerFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Internal "Draft" State
  const [fromBr, setFromBr] = useState(initialFrom);
  const [toBr, setToBr] = useState(initialTo);
  const [isAll, setIsAll] = useState(initialIsAll);
  
  // Calendar popover states
  const [fromCalendarOpen, setFromCalendarOpen] = useState(false);
  const [toCalendarOpen, setToCalendarOpen] = useState(false);

  const handleApply = () => {
    const params = new URLSearchParams(searchParams);
    
    if (isAll) {
        params.set("type", "all");
    } else {
        if (fromBr.length === 10 && toBr.length === 10) {
            const isoStart = brToIso(fromBr);
            const isoEnd = brToIso(toBr);
            params.delete("type");
            params.set("start", isoStart);
            params.set("end", isoEnd);
        }
    }
    
    // Reset pagination when filter changes
    params.set("page", "1");
    
    router.replace(`?${params.toString()}`);
    onClose();
  };

  const handleFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setFromBr(maskDate(e.target.value));
  };

  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setToBr(maskDate(e.target.value));
  };

  const onSelectFrom = (date: Date | undefined) => {
      if (date) {
          setFromBr(format(date, "dd/MM/yyyy"));
          setFromCalendarOpen(false); // Close popup after selection
      }
  };

  const onSelectTo = (date: Date | undefined) => {
      if (date) {
          setToBr(format(date, "dd/MM/yyyy"));
          setToCalendarOpen(false); // Close popup after selection
      }
  };

  return (
    <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
            <h4 className="font-cinzel text-[#D5AE77] text-sm font-bold">Filtrar Período</h4>
            <div className="flex items-center space-x-2">
                <Switch id="all-mode" checked={isAll} onCheckedChange={setIsAll} />
                <Label htmlFor="all-mode" className="text-xs">Todos</Label>
            </div>
        </div>
        
        <div className={cn("grid grid-cols-2 gap-2 transition-opacity", isAll ? "opacity-30 pointer-events-none" : "opacity-100")}>
            {/* INICIO */}
            <div className="space-y-1">
                <label className="text-[10px] text-[#828384] uppercase font-bold">Início</label>
                <div className="flex items-center gap-1">
                    <input 
                        type="text"
                        placeholder="DD/MM/AAAA"
                        value={fromBr}
                        onChange={handleFromChange}
                        disabled={isAll}
                        className="w-full bg-[#322E2B] border border-[#FDFDFD]/10 rounded-l px-2 py-1 text-xs text-[#FDFDFD] focus:outline-none focus:border-[#D5AE77] font-mono placeholder:text-[#FDFDFD]/20 h-8"
                        maxLength={10}
                    />
                    <Popover open={fromCalendarOpen} onOpenChange={setFromCalendarOpen}>
                        <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 bg-[#322E2B] border border-l-0 border-[#FDFDFD]/10 rounded-r rounded-l-none hover:bg-[#D5AE77] hover:text-[#322E2B]">
                                <CalendarIcon className="h-3 w-3" />
                            </Button>
                        </PopoverTrigger>

                            <PopoverContent className="w-auto p-4 bg-[#1f1f1f] border-[#FDFDFD]/10 text-[#FDFDFD]" align="start">
                            <Calendar
                                mode="single"
                                selected={parseBrDate(fromBr)}
                                onSelect={(date) => {
                                    onSelectFrom(date);
                                }}
                                initialFocus
                                locale={ptBR}
                                captionLayout="dropdown"
                                fromYear={2020}
                                toYear={2030}
                                formatters={{
                                    formatWeekdayName: (date) => {
                                        const day = format(date, "EEEEE", { locale: ptBR });
                                        return day.toUpperCase();
                                    }
                                }}
                                className="p-3"
                                classNames={calendarClassNames}
                            />
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            {/* FIM */}
            <div className="space-y-1">
                <label className="text-[10px] text-[#828384] uppercase font-bold">Fim</label>
                <div className="flex items-center gap-1">
                    <input 
                        type="text"
                        placeholder="DD/MM/AAAA"
                        value={toBr}
                        onChange={handleToChange}
                        disabled={isAll}
                        className="w-full bg-[#322E2B] border border-[#FDFDFD]/10 rounded-l px-2 py-1 text-xs text-[#FDFDFD] focus:outline-none focus:border-[#D5AE77] font-mono placeholder:text-[#FDFDFD]/20 h-8"
                        maxLength={10}
                    />
                        <Popover open={toCalendarOpen} onOpenChange={setToCalendarOpen}>
                        <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 bg-[#322E2B] border border-l-0 border-[#FDFDFD]/10 rounded-r rounded-l-none hover:bg-[#D5AE77] hover:text-[#322E2B]">
                                <CalendarIcon className="h-3 w-3" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-4 bg-[#1f1f1f] border-[#FDFDFD]/10 text-[#FDFDFD]" align="end">
                            <Calendar
                                mode="single"
                                selected={parseBrDate(toBr)}
                                onSelect={(date) => {
                                    onSelectTo(date);
                                }}
                                initialFocus
                                locale={ptBR}
                                captionLayout="dropdown"
                                fromYear={2020}
                                toYear={2030}
                                formatters={{
                                    formatWeekdayName: (date) => {
                                        const day = format(date, "EEEEE", { locale: ptBR });
                                        return day.toUpperCase();
                                    }
                                }}
                                className="p-3"
                                classNames={calendarClassNames}
                            />
                        </PopoverContent>
                    </Popover>
                </div>
            </div>
        </div>

        <Button 
            size="sm" 
            onClick={handleApply}
            disabled={!isAll && (fromBr.length !== 10 || toBr.length !== 10)}
            className="w-full bg-[#D5AE77] text-[#322E2B] hover:bg-[#D5AE77]/90 font-bold mt-1 disabled:opacity-50"
        >
            Aplicar
        </Button>
    </div>
  );
}
