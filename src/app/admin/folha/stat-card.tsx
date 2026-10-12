export function StatCard({
  label,
  value,
  cor,
  ativo,
  onClick,
}: {
  label: string;
  value: number | string;
  cor: "blue" | "green" | "yellow" | "red" | "neutral";
  ativo?: boolean;
  onClick?: () => void;
}) {
  const corBarra = {
    blue: "before:bg-primary",
    green: "before:bg-success",
    yellow: "before:bg-warning",
    red: "before:bg-danger",
    neutral: "before:bg-text-3",
  }[cor];
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`relative overflow-hidden rounded-sm border bg-secondary px-4 py-3.5 text-left before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-sm ${corBarra} ${
        ativo ? "border-primary" : "border-border"
      } ${onClick ? "cursor-pointer transition-colors hover:border-border-hi" : ""}`}
    >
      <div className="mb-1.5 font-mono text-[10px] tracking-[.06em] text-text-3 uppercase">{label}</div>
      <div className="font-mono text-[20px] leading-none font-bold text-foreground">{value}</div>
    </Tag>
  );
}
