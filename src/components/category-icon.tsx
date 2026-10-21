import {
  AtSign,
  Boxes,
  BookOpen,
  Briefcase,
  Circle,
  Code2,
  Dumbbell,
  Home,
  MessagesSquare,
  Monitor,
} from 'lucide-react';
import { categoryKey } from '@/features/calendar/domain';

const icons = {
  DSA: Code2,
  SYSTEM_DESIGN: Boxes,
  TECHNICAL: BookOpen,
  JOB_SEARCH: Briefcase,
  LINKEDIN: AtSign,
  GYM: Dumbbell,
  WORK: Monitor,
  PERSONAL: Home,
  INTERVIEW: MessagesSquare,
} as const;

/** A small glyph per block category so a day scans without reading. Decorative only. */
export function CategoryIcon({
  category,
  size = 14,
}: {
  category: string;
  size?: number;
}) {
  const Icon = icons[categoryKey(category) as keyof typeof icons] ?? Circle;
  return <Icon size={size} aria-hidden="true" className="category-icon" />;
}
