export function StatCard({
  label,
  value,
  cor,
}: {
  label: string;
  value: number;
  cor: "blue" | "green" | "yellow" | "red" | "neutral";
}) {
  const corBarra = {
    blue: "before:bg-primary",
    green: "before:bg-success",
    yellow: "before:bg-warning",
    red: "before:bg-danger",
    neutral: "before:bg-text-3",
  }[cor];

  return (
    <div
      className={`relative overflow-hidden rounded-sm border border-border bg-secondary px-4 py-3.5 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-sm ${corBarra}`}
    >
      <div className="mb-1.5 font-mono text-[10px] tracking-[.06em] text-text-3 uppercase">{label}</div>
      <div className="font-mono text-[22px] leading-none font-bold text-foreground">{value}</div>
    </div>
  );
}
