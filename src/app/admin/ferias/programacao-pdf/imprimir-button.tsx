"use client";

import { Printer } from "lucide-react";

export function ImprimirButton() {
  return (
    <div className="mb-4 flex justify-end print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
      >
        <Printer className="size-4" />
        Imprimir / Salvar PDF
      </button>
    </div>
  );
}
