"use client"

import { useEffect } from "react"
import { toast } from "sonner"

export function DisablePrint() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault()
        e.stopPropagation()
        toast.error("Impressão desativada por motivos de segurança.")
      }
    }



    window.addEventListener('keydown', handleKeyDown)
    
    // Also inject style to hide content on print just in case
    const style = document.createElement('style')
    style.innerHTML = `
      @media print {
        body { display: none !important; }
        html::after { content: "Impressão desativada."; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; font-size: 2rem; }
      }
    `
    document.head.appendChild(style)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.head.removeChild(style)
    }
  }, [])

  return null
}
