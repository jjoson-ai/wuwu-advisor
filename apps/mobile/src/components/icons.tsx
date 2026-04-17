import Svg, { Circle, Path, Rect } from "react-native-svg";

import { brandColors } from "@/theme/brand";

type IconProps = {
  size?: number;
  color?: string;
};

function strokeProps(color: string) {
  return {
    stroke: color,
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none" as const,
  };
}

export function LogoMark({ size = 28, color = brandColors.accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Circle cx={20} cy={20} r={17} stroke={color} strokeWidth={1.5} fill="none" />
      <Path
        d="M20 7 L23 20 L20 33 L17 20 Z"
        fill={color}
        opacity={0.92}
      />
      <Circle cx={20} cy={20} r={2.2} fill={brandColors.surfaceRaised} />
    </Svg>
  );
}

export function SunIcon({ size = 20, color = brandColors.accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={4} {...strokeProps(color)} />
      <Path
        d="M12 3v2M12 19v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M3 12h2M19 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        {...strokeProps(color)}
      />
    </Svg>
  );
}

export function CompassIcon({ size = 20, color = brandColors.accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} {...strokeProps(color)} />
      <Path
        d="M15.5 8.5 13 13l-4.5 2.5L11 11l4.5-2.5Z"
        fill={color}
      />
    </Svg>
  );
}

export function TrendingIcon({ size = 20, color = brandColors.accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 17 L9 11 L13 15 L21 7" {...strokeProps(color)} />
      <Path d="M14 7 L21 7 L21 14" {...strokeProps(color)} />
    </Svg>
  );
}

export function MessageIcon({ size = 20, color = brandColors.accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M21 15a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"
        {...strokeProps(color)}
      />
    </Svg>
  );
}

export function SlidersIcon({ size = 20, color = brandColors.accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h14M20 18h0"
        {...strokeProps(color)}
      />
      <Circle cx={16} cy={6} r={2} fill={color} />
      <Circle cx={8} cy={12} r={2} fill={color} />
      <Circle cx={18} cy={18} r={2} fill={color} />
    </Svg>
  );
}

export function BriefcaseIcon({ size = 20, color = brandColors.accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3} y={7} width={18} height={13} rx={2} {...strokeProps(color)} />
      <Path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" {...strokeProps(color)} />
      <Path d="M3 13h18" {...strokeProps(color)} />
    </Svg>
  );
}

export function CoinsIcon({ size = 20, color = brandColors.accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={9} cy={10} r={6} {...strokeProps(color)} />
      <Path d="M15.5 5.3A6 6 0 1 1 15.5 18.7" {...strokeProps(color)} />
      <Path d="M9 7v6M7 10h4" {...strokeProps(color)} />
    </Svg>
  );
}

export function UsersIcon({ size = 20, color = brandColors.accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={9} cy={8} r={3.5} {...strokeProps(color)} />
      <Path d="M3 20a6 6 0 0 1 12 0" {...strokeProps(color)} />
      <Path d="M16 4.5a3.5 3.5 0 0 1 0 7" {...strokeProps(color)} />
      <Path d="M17 13a6 6 0 0 1 4 5" {...strokeProps(color)} />
    </Svg>
  );
}

export function BoltIcon({ size = 20, color = brandColors.accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" {...strokeProps(color)} />
    </Svg>
  );
}

export function SparklesIcon({ size = 20, color = brandColors.accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3v4M12 17v4M3 12h4M17 12h4" {...strokeProps(color)} />
      <Path
        d="M12 7c0 3 2 5 5 5-3 0-5 2-5 5 0-3-2-5-5-5 3 0 5-2 5-5Z"
        fill={color}
      />
    </Svg>
  );
}

export function CalendarIcon({ size = 20, color = brandColors.accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3} y={5} width={18} height={16} rx={2} {...strokeProps(color)} />
      <Path d="M3 10h18M8 3v4M16 3v4" {...strokeProps(color)} />
    </Svg>
  );
}

export function UserIcon({ size = 20, color = brandColors.accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={4} {...strokeProps(color)} />
      <Path d="M4 21a8 8 0 0 1 16 0" {...strokeProps(color)} />
    </Svg>
  );
}

export function StarIcon({ size = 20, color = brandColors.accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3 L14.5 9.5 L21 10 L16 14.5 L17.5 21 L12 17.5 L6.5 21 L8 14.5 L3 10 L9.5 9.5 Z"
        {...strokeProps(color)}
      />
    </Svg>
  );
}
