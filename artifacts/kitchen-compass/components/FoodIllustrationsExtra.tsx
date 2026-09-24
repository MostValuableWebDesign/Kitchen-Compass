import type { ReactNode } from 'react';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import type { FoodIconName } from '@/lib/foodIcons';

// Draw the foods without a suitable icon-font glyph at the same 48px scale as the original illustrations.
export function FoodIllustrationsExtra({ icon, size, colors }: {
  icon: FoodIconName;
  size: number;
  colors: ReturnType<typeof useColors>;
}) {
  const green = colors.primary;
  const light = colors.secondaryForeground;
  const gold = colors.accent;
  const brown = colors.accentForeground;
  const red = colors.destructive;
  const cream = colors.card;
  let art: ReactNode;

  switch (icon) {
    case 'illustration-banana':
      art = <><Path d="M7 15c-2 17 12 28 28 22 5-2 8-6 9-11C29 39 16 31 13 13Z" fill={gold} stroke={brown} strokeWidth="2" /><Path d="M13 15c2 17 14 24 27 14" fill="none" stroke={cream} strokeWidth="2" /><Path d="m7 15-3-3m39 15 2-3" stroke={brown} strokeWidth="3" /></>;
      break;
    case 'illustration-peach':
      art = <><Path d="M24 14C7 5 3 20 9 33c4 9 11 10 15 7 4 3 11 2 15-7 6-13 2-28-15-19Z" fill={red} /><Path d="M24 13c3 7 3 15 0 24" stroke={brown} strokeWidth="1.5" fill="none" /><Path d="M24 13c1-6 7-9 13-7-1 6-7 9-13 7Z" fill={green} /></>;
      break;
    case 'illustration-mango':
      art = <><Ellipse cx="24" cy="26" rx="14" ry="18" transform="rotate(35 24 26)" fill={gold} stroke={brown} strokeWidth="1.5" /><Path d="M22 10c3-6 9-7 15-4-2 6-8 9-15 7Z" fill={green} /><Path d="M14 34c2 4 6 6 10 7" fill="none" stroke={cream} strokeWidth="2" /></>;
      break;
    case 'illustration-kiwi':
      art = <><Circle cx="24" cy="24" r="19" fill={brown} /><Circle cx="24" cy="24" r="15" fill={green} /><Circle cx="24" cy="24" r="6" fill={cream} /><Path d="M24 9v7m11-1-5 5m8 4h-7m4 10-5-5m-6 9v-7m-11 3 5-5m-8-5h7m-4-9 5 5" stroke={brown} strokeWidth="2.3" strokeLinecap="round" /></>;
      break;
    case 'illustration-coconut':
      art = <><Circle cx="23" cy="24" r="18" fill={brown} /><Path d="M8 31c8-8 22-8 31 0-4 14-26 16-31 0Z" fill={cream} /><Circle cx="17" cy="18" r="2" fill={light} /><Circle cx="28" cy="16" r="2" fill={light} /><Circle cx="23" cy="24" r="2" fill={light} /></>;
      break;
    case 'illustration-strawberry':
      art = <><Path d="M10 18c-3 8 7 23 14 25 7-2 17-17 14-25-6-5-22-5-28 0Z" fill={red} /><Path d="m24 18-9-8 7 2 2-7 3 7 8-2-7 8Z" fill={green} /><Path d="M17 22v2m10 0v2m7-3v2M22 30v2m8 1v2m-11 2v2" stroke={cream} strokeWidth="2" strokeLinecap="round" /></>;
      break;
    case 'illustration-blueberry':
      art = <><Circle cx="17" cy="27" r="10" fill={light} /><Circle cx="31" cy="27" r="10" fill={light} /><Circle cx="24" cy="17" r="10" fill={light} /><Path d="m24 12 2 3 4 1-4 2-2 3-2-3-4-2 4-1Z" fill={cream} /><Circle cx="15" cy="25" r="2" fill={cream} /><Circle cx="31" cy="25" r="2" fill={cream} /></>;
      break;
    case 'illustration-raspberry':
      art = <><Path d="M24 12c-1-6 3-9 9-8-1 6-4 9-9 9Z" fill={green} /><Circle cx="17" cy="20" r="6" fill={red} /><Circle cx="29" cy="20" r="6" fill={red} /><Circle cx="12" cy="30" r="6" fill={red} /><Circle cx="24" cy="30" r="7" fill={red} /><Circle cx="36" cy="30" r="6" fill={red} /><Circle cx="20" cy="39" r="5" fill={red} /><Circle cx="29" cy="39" r="5" fill={red} /></>;
      break;
    case 'illustration-lemon':
      art = <><Path d="M6 25c4-2 4-9 17-11 12-2 17 5 20 10-3 5-9 13-20 12C10 35 10 28 6 25Z" fill={gold} stroke={brown} strokeWidth="1.5" /><Path d="M14 25c3-7 10-9 17-8" fill="none" stroke={cream} strokeWidth="2" /></>;
      break;
    case 'illustration-lime':
      art = <><Circle cx="24" cy="25" r="18" fill={green} /><Circle cx="24" cy="25" r="13" fill={gold} /><Path d="M24 12v26m-13-13h26m-22-9 18 18m0-18L15 34" stroke={cream} strokeWidth="1.7" /><Circle cx="24" cy="25" r="3" fill={cream} /></>;
      break;
    case 'illustration-orange':
      art = <><Circle cx="24" cy="26" r="17" fill={gold} stroke={brown} strokeWidth="1.5" /><Path d="M24 10c1-5 5-7 11-6-1 6-5 9-11 9Z" fill={green} /><Path d="M14 29c1 6 6 10 12 11" fill="none" stroke={cream} strokeWidth="2" /></>;
      break;
    case 'illustration-lettuce':
      art = <><Path d="M13 38C4 32 3 21 11 17c-2-9 7-14 13-9 7-5 15 0 13 9 8 4 7 15-2 21-6 5-16 6-22 0Z" fill={green} /><Path d="M24 39V17m0 13-12-9m12 4 11-6" stroke={light} strokeWidth="2" fill="none" /></>;
      break;
    case 'illustration-kale':
      art = <><Path d="M24 43V6" stroke={brown} strokeWidth="2" /><Path d="M23 35c-9 2-14-2-12-7-7-3-6-10 0-12-1-7 5-11 11-8 3-5 9-3 11 2 7-1 11 5 8 10 5 6 0 13-7 13-3 6-7 7-11 2Z" fill={green} /><Path d="M23 35V11m0 17L12 18m11 4 12-9" stroke={light} strokeWidth="1.6" fill="none" /></>;
      break;
    case 'illustration-cabbage':
      art = <><Circle cx="24" cy="24" r="19" fill={green} /><Path d="M8 19c11-7 22-5 32 2M10 31c9-13 21-15 30-6M17 41c-3-14 4-24 16-33m-3 32c10-10 9-22 1-32" stroke={light} strokeWidth="2" fill="none" /></>;
      break;
    case 'illustration-celery':
      art = <><Path d="M14 40 12 19m12 21V16m10 24 2-23" stroke={green} strokeWidth="5" strokeLinecap="round" /><Path d="M13 20C5 19 5 12 9 7c5 1 7 5 6 10m9 1c-5-5-3-11 2-14 4 3 5 8 2 12m7 3c0-7 4-11 10-11 1 6-2 10-8 12" fill={green} /><Path d="M11 41h27" stroke={brown} strokeWidth="2" /></>;
      break;
    case 'illustration-zucchini':
      art = <><Path d="M10 34C5 28 10 19 19 13c9-6 18-8 22-4 5 5 1 14-7 22-9 9-19 10-24 3Z" fill={green} /><Path d="M12 31c9-11 19-16 27-18m-22 23c10-8 18-13 23-21" stroke={light} strokeWidth="2" fill="none" /><Path d="m10 34-5 5m35-31 4-5" stroke={brown} strokeWidth="3" strokeLinecap="round" /></>;
      break;
    case 'illustration-squash':
      art = <><Path d="M24 13c-7-8-16-2-18 9-2 12 8 20 18 20s20-8 18-20C40 11 31 5 24 13Z" fill={gold} /><Path d="M24 13c-9 10-9 20 0 29m0-29c9 10 9 20 0 29" fill="none" stroke={brown} strokeWidth="1.4" /><Path d="M24 13V5m0 5c4-5 9-5 13-3" stroke={green} strokeWidth="3" fill="none" /></>;
      break;
    case 'illustration-cauliflower':
      art = <><Path d="M15 29 8 27c0 8 7 15 16 16 9-1 16-8 16-16l-8 2" fill={green} /><Circle cx="15" cy="22" r="8" fill={cream} stroke={brown} strokeWidth="1" /><Circle cx="24" cy="14" r="9" fill={cream} stroke={brown} strokeWidth="1" /><Circle cx="33" cy="22" r="8" fill={cream} stroke={brown} strokeWidth="1" /><Circle cx="24" cy="27" r="9" fill={cream} stroke={brown} strokeWidth="1" /></>;
      break;
    case 'illustration-asparagus':
      art = <><Path d="M12 40V17m12 23V10m12 30V17" stroke={green} strokeWidth="5" strokeLinecap="round" /><Path d="m12 8-5 10 5-2 5 2-5-10Zm12-7-5 12 5-3 5 3-5-12Zm12 7-5 10 5-2 5 2-5-10Z" fill={green} /><Path d="M7 29h34" stroke={brown} strokeWidth="2" /></>;
      break;
    case 'illustration-peas':
      art = <><Path d="M5 20c10-13 30-13 38 0-2 13-12 20-19 20S7 33 5 20Z" fill={green} /><Path d="M6 22c10-7 28-7 36 0" stroke={light} strokeWidth="2" fill="none" /><Circle cx="15" cy="26" r="4" fill={gold} /><Circle cx="24" cy="28" r="4" fill={gold} /><Circle cx="33" cy="26" r="4" fill={gold} /></>;
      break;
    case 'illustration-cilantro':
      art = <><Path d="M24 43V22m0 14L11 25m13 6 13-12" stroke={brown} strokeWidth="2" fill="none" /><Path d="M22 24c-8-2-14-8-10-12 2-2 5-1 6 1 0-7 7-8 9-3 5-4 10 1 7 5 7 2 6 9-1 10-3 5-9 4-11-1Z" fill={green} /></>;
      break;
    case 'illustration-mint':
      art = <><Path d="M10 39 37 10" stroke={brown} strokeWidth="2" /><Path d="M22 26C9 28 6 18 9 10c9 0 16 7 13 16Zm3 0c-1-12 6-18 16-17 2 11-4 17-16 17Z" fill={green} /><Path d="m11 13 11 13m17-14L25 26" stroke={light} strokeWidth="1.8" /></>;
      break;
    case 'illustration-rosemary':
      art = <><Path d="M10 41 38 7" stroke={brown} strokeWidth="2.5" /><Path d="m17 33-9-8m14 2-12-10m18 3-11-12m-3 29 9 2m-2-10 12 1m-5-11 10 1m-4-9 7 1" stroke={green} strokeWidth="3.5" strokeLinecap="round" /></>;
      break;
    case 'illustration-ginger':
    case 'illustration-turmeric':
      art = <><Path d="M15 37c-6 1-10-4-8-10 2-4 7-5 9-8-2-5 2-10 7-9 5 0 6 5 10 5 6-2 10 3 8 8-1 4-6 5-7 9 2 6-2 10-8 9-4-1-5-5-11-4Z" fill={icon === 'illustration-turmeric' ? gold : colors.accent} stroke={brown} strokeWidth="2" /><Path d="M16 20c3 2 4 5 4 8m13-8c-4 2-5 6-5 9" stroke={cream} strokeWidth="2" fill="none" /></>;
      break;
    case 'illustration-shrimp':
      art = <><Path d="M36 12C21 3 8 15 10 27c1 10 12 16 21 11l-7-8c-7-1-9-10-3-14 4-2 8-1 11 1Z" fill={red} /><Path d="M18 17c3 5 3 10-1 15m10-18c2 5 3 10 0 15" stroke={cream} strokeWidth="2" fill="none" /><Circle cx="33" cy="16" r="1.7" fill={brown} /><Path d="m31 37 8 2-3-7m-6-17 11-5" stroke={brown} strokeWidth="2" fill="none" /></>;
      break;
    case 'illustration-crab':
      art = <><Ellipse cx="24" cy="27" rx="12" ry="10" fill={red} /><Path d="m13 25-8-5 3-6 7 4m20 7 8-5-3-6-7 4M14 32l-9 7m13-3-5 8m21-12 9 7m-13-3 5 8" fill="none" stroke={red} strokeWidth="3" strokeLinecap="round" /><Circle cx="19" cy="24" r="1.6" fill={cream} /><Circle cx="29" cy="24" r="1.6" fill={cream} /></>;
      break;
    case 'illustration-shellfish':
      art = <><Path d="M24 7C9 7 5 20 9 35h30C43 20 39 7 24 7Z" fill={gold} stroke={brown} strokeWidth="1.8" /><Path d="M24 10v24M15 13l5 21m13-21-5 21M9 21l7 13m23-13-7 13" stroke={cream} strokeWidth="1.8" /><Path d="M8 37h32" stroke={brown} strokeWidth="3" /></>;
      break;
    case 'illustration-milk':
      art = <><Path d="M12 14 19 5h17v9l-5 6v22H12Z" fill={cream} stroke={light} strokeWidth="2" /><Path d="M12 14h24m-17-9v9m12 6H12" stroke={light} strokeWidth="1.7" /><Path d="M20 29c2-5 6-5 8 0 1 4-2 7-4 7s-5-3-4-7Z" fill={light} /></>;
      break;
    case 'illustration-yogurt':
      art = <><Path d="M10 17h28l-4 25H14Z" fill={cream} stroke={light} strokeWidth="2" /><Path d="M8 14h32v5H8Z" fill={light} /><Path d="M18 29c3-7 9-8 13 0-1 6-12 9-13 0Z" fill={red} /><Path d="m23 24 2-4 4 1" stroke={green} strokeWidth="2" fill="none" /></>;
      break;
    case 'illustration-butter':
      art = <><Path d="m6 30 25-9 11 6-25 11Z" fill={gold} stroke={brown} strokeWidth="1.6" /><Path d="M17 38v5l25-11v-5m-25 11L6 30v5l11 8" fill={cream} stroke={brown} strokeWidth="1.5" /><Path d="m7 24 23-8 8 5" stroke={brown} strokeWidth="2" fill="none" /></>;
      break;
    case 'illustration-beans':
      art = <><Path d="M15 8c8 0 11 7 7 12-4 6-13 5-14-1-1-5 2-11 7-11Zm20 9c8 2 9 10 4 14-5 5-13 2-13-5 0-5 4-10 9-9ZM16 27c8-2 13 4 11 11-2 7-12 8-16 2-3-5 0-11 5-13Z" fill={brown} /><Path d="M12 13c-2 4 1 8 5 8m15 0c-3 4-1 8 3 9m-20 2c-2 4 0 7 4 8" stroke={cream} strokeWidth="1.5" fill="none" /></>;
      break;
    case 'illustration-tofu':
      art = <><Path d="m8 15 21-6 11 9-21 6Z" fill={cream} stroke={brown} strokeWidth="1.5" /><Path d="M8 15v18l11 8V24Zm11 9v17l21-6V18Z" fill={gold} stroke={brown} strokeWidth="1.5" /><Path d="m14 20 20-6" stroke={cream} strokeWidth="1.6" /></>;
      break;
    case 'illustration-almond':
      art = <><Path d="M11 32C4 22 13 8 20 7c8 2 14 17 6 27-5 7-10 7-15-2Zm17 8c-4-9 2-22 10-25 7 7 6 18-1 24-4 3-7 4-9 1Z" fill={brown} /><Path d="M20 12c-3 8-3 15-1 23m19-14c-4 5-6 10-7 15" stroke={gold} strokeWidth="1.6" fill="none" /></>;
      break;
    case 'illustration-bacon':
      art = <><Path d="M9 6c7 4 13-2 20 2s11 1 13-2v32c-7-3-13 3-20-1S11 38 9 42Z" fill={red} /><Path d="M14 7v29m10-26v27m10-28v27" stroke={cream} strokeWidth="4" fill="none" /></>;
      break;
    case 'illustration-sauce':
      art = <><Path d="M13 13h22l2 27H11Z" fill={brown} stroke={light} strokeWidth="1.6" /><Rect x="10" y="9" width="28" height="6" rx="2" fill={light} /><Path d="M16 25h16v10H16Z" fill={cream} /><Path d="m20 30 3 2 6-5" stroke={green} strokeWidth="2" fill="none" /></>;
      break;
    case 'illustration-honey':
      art = <><Path d="M13 14h22l3 27H10Z" fill={gold} stroke={brown} strokeWidth="1.5" /><Rect x="15" y="5" width="18" height="9" rx="2" fill={brown} /><Path d="M17 23h14v12H17Z" fill={cream} /><Path d="M24 25c-6 7-4 9 0 9s6-2 0-9Z" fill={gold} /></>;
      break;
    case 'illustration-oats':
      art = <><Path d="M6 22h36l-5 17H11Z" fill={cream} stroke={brown} strokeWidth="2" /><Ellipse cx="24" cy="22" rx="18" ry="6" fill={gold} stroke={brown} strokeWidth="1.5" /><Circle cx="16" cy="21" r="2" fill={cream} /><Circle cx="28" cy="23" r="2" fill={cream} /><Circle cx="34" cy="20" r="1.5" fill={cream} /></>;
      break;
    case 'illustration-bell-pepper':
      art = <><Path d="M24 14c-7-5-16-2-18 8-3 11 2 20 10 20 4 0 5-2 8-2s4 2 8 2c8 0 13-9 10-20-2-10-11-13-18-8Z" fill={red} /><Path d="M24 16c-5 7-5 15-3 23m3-23c5 7 5 15 3 23" stroke={cream} strokeWidth="1.8" fill="none" /><Path d="M24 15c-2-5 0-9 4-11m-4 11c-4-4-9-4-13-2m13 2c4-4 9-4 13-2" stroke={green} strokeWidth="3" fill="none" strokeLinecap="round" /></>;
      break;
    case 'illustration-chicken-breast':
      art = <><Path d="M7 32C5 20 12 13 24 11c10-1 18 5 17 15-1 9-10 15-22 15C12 41 8 38 7 32Z" fill={gold} stroke={brown} strokeWidth="2" /><Path d="M13 32c0-8 6-14 16-15" stroke={cream} strokeWidth="2" strokeLinecap="round" fill="none" /></>;
      break;
    case 'illustration-salmon':
      art = <><Path d="M5 31c5-15 20-24 35-20 3 12-4 26-20 30-9 2-14-3-15-10Z" fill={red} stroke={brown} strokeWidth="1.5" /><Path d="M11 32c8-10 16-16 26-17m-22 22c7-8 15-13 23-16M9 27c8 0 16 4 18 9" stroke={cream} strokeWidth="2" fill="none" /></>;
      break;
    default:
      return null;
  }

  return <Svg viewBox="0 0 48 48" width={size} height={size}>{art}</Svg>;
}