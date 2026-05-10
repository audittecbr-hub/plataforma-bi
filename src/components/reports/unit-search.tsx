"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function UnitSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [term, setTerm] = useState(searchParams.get("search") || "");

  const handleSearch = () => {
     const params = new URLSearchParams(window.location.search);
     const currentParam = params.get("search") || "";
     
     if (term !== currentParam) {
        if (term) {
          params.set("search", term);
        } else {
          params.delete("search");
        }
        params.set("page", "1"); // Reset pagination
        router.replace(`?${params.toString()}`);
     }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
        handleSearch();
    }
  };

  return (
    <div className="relative w-full max-w-xs">
      <Search 
        className="absolute left-2 top-2.5 h-4 w-4 text-[#FDFDFD]/50 cursor-pointer hover:text-[#D5AE77]" 
        onClick={handleSearch}
      />
      <Input
        placeholder="Buscar e Teclar Enter..."
        className="pl-8 h-9 bg-[#322E2B] border-[#FDFDFD]/10 text-[#FDFDFD] placeholder:text-[#FDFDFD]/30 focus-visible:ring-[#D5AE77]"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
