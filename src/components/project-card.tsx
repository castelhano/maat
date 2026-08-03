import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

const CORES = {
  blue: "bg-[#1d4ed8]",
  violet: "bg-[#7c3aed]",
  teal: "bg-[#0d9488]",
  amber: "bg-[#b45309]",
  rose: "bg-[#be123c]",
} as const;

export function ProjectCard({
  href,
  icon: Icon,
  cor,
  tag,
  nome,
  descricao,
}: {
  href: string;
  icon: LucideIcon;
  cor: keyof typeof CORES;
  tag: string;
  nome: string;
  descricao: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-3.5 rounded-lg border border-border bg-card p-[22px] transition-colors hover:border-border-hi hover:bg-secondary"
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${CORES[cor]}`}>
          <Icon className="size-[18px] text-white" />
        </div>
        <span className="rounded-[3px] border border-border bg-bg-4 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[.1em] text-text-3 uppercase">
          {tag}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <span className="font-mono text-[13px] font-bold tracking-[.06em] text-foreground uppercase">
          {nome}
        </span>
        <span className="text-xs leading-6 text-text-2">{descricao}</span>
      </div>
      <div className="flex items-center justify-end">
        <span className="pointer-events-none inline-flex items-center gap-[7px] rounded-sm border border-border-hi bg-secondary px-[18px] py-[9px] font-mono text-[11px] font-bold tracking-[.06em] text-secondary-foreground uppercase">
          <ArrowRight className="size-3.5" />
          Abrir
        </span>
      </div>
    </Link>
  );
}
