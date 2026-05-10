"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationControlsProps {
  totalPages: number;
  currentPage: number;
}

export function PaginationControls({ totalPages, currentPage }: PaginationControlsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full border border-input hover:bg-accent hover:text-foreground disabled:opacity-30 transition-colors"
        disabled={currentPage <= 1}
        onClick={() => handlePageChange(currentPage - 1)}
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <span className="min-w-[60px] text-center">
        Página <span className="text-foreground font-bold">{currentPage}</span> de {totalPages}
      </span>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full border border-input hover:bg-accent hover:text-foreground disabled:opacity-30 transition-colors"
        disabled={currentPage >= totalPages}
        onClick={() => handlePageChange(currentPage + 1)}
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
