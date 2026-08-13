import { cn } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";

/**
 * Deterministic gradient "photography" — every worker gets a unique cover
 * derived from their hue + category, with zero external images (works offline).
 */
export function WorkerCover({
  hue,
  icon,
  className,
  iconClassName,
  children,
}: {
  hue: number;
  icon?: string;
  className?: string;
  iconClassName?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 72% 58%) 0%, hsl(${(hue + 45) % 360} 70% 46%) 55%, hsl(${(hue + 90) % 360} 68% 34%) 100%)`,
      }}
    >
      {/* radial highlight */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 90% at 85% 0%, rgb(255 255 255 / 0.35), transparent 55%)`,
        }}
      />
      {/* dotted texture */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: "radial-gradient(circle, rgb(255 255 255 / 0.5) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />
      {icon && (
        <CategoryIcon
          name={icon}
          className={cn(
            "absolute -bottom-3 -end-3 size-28 rotate-[-8deg] text-white/25 transition-transform duration-500 group-hover:rotate-[-2deg] group-hover:scale-105",
            iconClassName
          )}
        />
      )}
      {children}
    </div>
  );
}
