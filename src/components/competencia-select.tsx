"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MESES, ANOS } from "@/lib/competencia";

export function CompetenciaSelect({
  mes,
  ano,
  onMesChange,
  onAnoChange,
}: {
  mes: string;
  ano: string;
  onMesChange: (mes: string) => void;
  onAnoChange: (ano: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>Competência</Label>
      <div className="flex gap-2.5">
        <Select value={mes} onValueChange={(value) => onMesChange(value as string)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            {MESES.map((nome, i) => (
              <SelectItem key={nome} value={String(i + 1).padStart(2, "0")}>
                {nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ano} onValueChange={(value) => onAnoChange(value as string)}>
          <SelectTrigger className="w-28">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {ANOS.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
