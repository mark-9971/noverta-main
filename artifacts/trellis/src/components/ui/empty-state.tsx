import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: "default" | "outline" | "ghost";
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: ReactNode;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  className?: string;
  compact?: boolean;
}

function ActionButton({ a }: { a: EmptyStateAction }) {
  const btn = (
    <Button
      size="sm"
      variant={a.variant ?? "default"}
      className={a.variant == null ? "bg-emerald-600 hover:bg-emerald-700 text-white" : undefined}
      onClick={a.href ? undefined : a.onClick}
    >
      {a.label}
    </Button>
  );
  return a.href ? <a href={a.href}>{btn}</a> : btn;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  action,
  secondaryAction,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <Empty className={cn(compact ? "py-10 md:py-10" : "py-16 md:py-20", "border-0 bg-transparent", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon className="size-5 text-emerald-600" />
        </EmptyMedia>
        <EmptyTitle className="text-gray-700">{title}</EmptyTitle>
        {description && (
          <EmptyDescription className="text-gray-500 max-w-xs mx-auto">
            {description}
          </EmptyDescription>
        )}
      </EmptyHeader>
      {children && (
        <div className="max-w-md mx-auto text-left text-sm text-gray-500 space-y-3 mt-1">
          {children}
        </div>
      )}
      {(action || secondaryAction) && (
        <EmptyContent>
          {action && <ActionButton a={action} />}
          {secondaryAction && (
            <ActionButton a={{ ...secondaryAction, variant: secondaryAction.variant ?? "outline" }} />
          )}
        </EmptyContent>
      )}
    </Empty>
  );
}

export function EmptyStateStep({ number, children }: { number: number; children: ReactNode }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center mt-0.5">
        {number}
      </span>
      <span className="text-[13px] leading-snug text-gray-600">{children}</span>
    </div>
  );
}

export function EmptyStateHeading({ children }: { children: ReactNode }) {
  return <p className="text-[13px] font-semibold text-gray-700">{children}</p>;
}

export function EmptyStateDetail({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-gray-500 leading-relaxed">{children}</p>;
}
