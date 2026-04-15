import type { LucideIcon } from "lucide-react";
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
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
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
      {(action || secondaryAction) && (
        <EmptyContent>
          {action && (
            action.href ? (
              <a href={action.href}>
                <Button
                  size="sm"
                  variant={action.variant ?? "default"}
                  className={action.variant == null ? "bg-emerald-600 hover:bg-emerald-700 text-white" : undefined}
                >
                  {action.label}
                </Button>
              </a>
            ) : (
              <Button
                size="sm"
                variant={action.variant ?? "default"}
                className={action.variant == null ? "bg-emerald-600 hover:bg-emerald-700 text-white" : undefined}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            )
          )}
          {secondaryAction && (
            secondaryAction.href ? (
              <a href={secondaryAction.href}>
                <Button size="sm" variant={secondaryAction.variant ?? "outline"}>
                  {secondaryAction.label}
                </Button>
              </a>
            ) : (
              <Button size="sm" variant={secondaryAction.variant ?? "outline"} onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            )
          )}
        </EmptyContent>
      )}
    </Empty>
  );
}
