"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Download, ChevronDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { paraCsv, baixarCsv } from "@/lib/csv";

const FUNDO_ESCURO = "#131619";
const FUNDO_CLARO = "#ffffff";

export function ExportCard({
  titulo,
  descricao,
  arquivo,
  csv,
  pdfHref,
  children,
}: {
  titulo: string;
  descricao?: string;
  arquivo: string;
  csv?: { headers: string[]; linhas: (string | number)[][] };
  pdfHref?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [exportando, setExportando] = useState(false);

  async function exportarPng(claro: boolean) {
    const node = ref.current;
    if (!node) return;
    setExportando(true);

    // Tabelas com rolagem (containerClassName com max-h/overflow) só mostram o trecho visível na
    // tela — sem isso, colunas como "Valor" ficam cortadas na foto. Desativa a rolagem só durante
    // a captura, pra imagem sair com a tabela inteira.
    const containers = node.querySelectorAll<HTMLElement>('[data-slot="table-container"]');
    const estiloOriginal = [...containers].map((c) => ({ maxHeight: c.style.maxHeight, overflow: c.style.overflow }));
    containers.forEach((c) => {
      c.style.maxHeight = "none";
      c.style.overflow = "visible";
    });

    try {
      if (claro) node.dataset.exportTheme = "light";
      const dataUrl = await toPng(node, {
        backgroundColor: claro ? FUNDO_CLARO : FUNDO_ESCURO,
        pixelRatio: 2,
        filter: (n) => !(n instanceof HTMLElement && n.dataset.exportIgnore === "true"),
      });
      const link = document.createElement("a");
      link.download = `${arquivo}${claro ? "-fundo-claro" : ""}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      delete node.dataset.exportTheme;
      containers.forEach((c, i) => {
        c.style.maxHeight = estiloOriginal[i].maxHeight;
        c.style.overflow = estiloOriginal[i].overflow;
      });
      setExportando(false);
    }
  }

  function exportarCsv() {
    if (!csv) return;
    baixarCsv(arquivo, paraCsv(csv.headers, csv.linhas));
  }

  return (
    <Card>
      <div ref={ref} className="flex flex-col gap-(--card-spacing) bg-card py-(--card-spacing)">
        <div className="flex items-start justify-between gap-3 px-(--card-spacing)">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <CardTitle>{titulo}</CardTitle>
            {descricao && <CardDescription>{descricao}</CardDescription>}
          </div>
          <div data-export-ignore="true" className="shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="secondary" size="sm" disabled={exportando}>
                    <Download />
                    {exportando ? "Exportando..." : "Exportar"}
                    <ChevronDown />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportarPng(false)}>PNG (escuro)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportarPng(true)}>PNG (claro)</DropdownMenuItem>
                {csv && <DropdownMenuItem onClick={exportarCsv}>CSV</DropdownMenuItem>}
                {pdfHref && (
                  <DropdownMenuItem onClick={() => window.open(pdfHref, "_blank")}>
                    <FileText />
                    PDF
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <CardContent>{children}</CardContent>
      </div>
    </Card>
  );
}
