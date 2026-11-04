import {
  CodeIcon,
  FileTextIcon,
  HeartHandshakeIcon,
  MusicIcon,
  SparklesIcon,
  TrophyIcon,
  type LucideIcon,
} from "lucide-react";

// Categories store an icon name. Only the icons listed here are bundled; any
// other name falls back to a generic icon.
const icons: Record<string, LucideIcon> = {
  trophy: TrophyIcon,
  music: MusicIcon,
  "heart-handshake": HeartHandshakeIcon,
  "file-text": FileTextIcon,
  code: CodeIcon,
};

export function CategoryIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = (name && icons[name]) || SparklesIcon;
  return <Icon className={className} aria-hidden />;
}
