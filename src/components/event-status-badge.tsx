import type { EventStatus } from "@/generated/prisma/enums";
import { STATUS_LABELS } from "@/lib/events";
import { Badge } from "@/components/ui/badge";

const VARIANTS: Record<EventStatus, React.ComponentProps<typeof Badge>["variant"]> = {
  DRAFT: "outline",
  PUBLISHED: "default",
  REG_CLOSED: "secondary",
  ONGOING: "default",
  COMPLETED: "secondary",
  CANCELLED: "destructive",
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return <Badge variant={VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>;
}
