import type { HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-card shadow-sm", className)} {...props} />;
}

type Tone = "primary" | "success" | "warning" | "destructive" | "info";
const TONES: Record<Tone, string> = {
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  destructive: "bg-destructive-soft text-destructive",
  info: "bg-info-soft text-info",
};

// StatCard do Neuro Hub Pro (src/components/ui-kit/StatCard.tsx), simplificado.
export function StatCard({
  icon: Icon,
  label,
  value,
  footer,
  tone = "primary",
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  footer?: ReactNode;
  tone?: Tone;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", TONES[tone])}>
          <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="text-xl font-bold leading-tight tabular-nums">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </div>
      </div>
      {footer ? <div className="mt-2 text-xs text-muted-foreground">{footer}</div> : null}
    </Card>
  );
}

// StatusBadge do Neuro Hub Pro (src/components/ui-kit/StatusBadge.tsx).
export function StatusBadge({ tone = "primary", children }: { tone?: Tone | "muted"; children: ReactNode }) {
  const cls = tone === "muted" ? "bg-muted text-muted-foreground border border-border" : TONES[tone];
  return <span className={cn("inline-block rounded-md px-2 py-0.5 text-xs font-medium", cls)}>{children}</span>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-muted-foreground">{children}</div>;
}
