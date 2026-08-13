import { BadgeCheck, Crown, Siren } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export function VerifiedBadge({ compact = false }: { compact?: boolean }) {
  return (
    <Badge variant="success" title="Verified by WorkersArena" className={cn(compact && "px-1.5")}>
      <BadgeCheck className="size-3" />
      {!compact && "Verified"}
    </Badge>
  );
}

export function PremiumBadge({ compact = false }: { compact?: boolean }) {
  return (
    <Badge variant="premium" title="Premium member" className={cn(compact && "px-1.5")}>
      <Crown className="size-3" />
      {!compact && "Premium"}
    </Badge>
  );
}

export function EmergencyBadge({ compact = false }: { compact?: boolean }) {
  return (
    <Badge variant="danger" title="24/7 emergency availability" className={cn(compact && "px-1.5")}>
      <Siren className="size-3 animate-pulse-soft" />
      {!compact && "24/7"}
    </Badge>
  );
}
