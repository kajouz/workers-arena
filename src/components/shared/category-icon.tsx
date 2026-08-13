import {
  Antenna,
  Anvil,
  Box,
  Bug,
  Car,
  Component,
  Flame,
  Flower2,
  GlassWater,
  Hammer,
  HardHat,
  Home,
  KeyRound,
  Layers,
  Paintbrush,
  Snowflake,
  Sofa,
  Sparkles,
  Truck,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  Antenna,
  Anvil,
  Box,
  Bug,
  Car,
  Component,
  Flame,
  Flower2,
  GlassWater,
  Hammer,
  HardHat,
  Home,
  KeyRound,
  Layers,
  Paintbrush,
  Snowflake,
  Sofa,
  Sparkles,
  Truck,
  Wrench,
  Zap,
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Wrench;
  return <Icon className={className} aria-hidden />;
}

export { ICON_MAP };
