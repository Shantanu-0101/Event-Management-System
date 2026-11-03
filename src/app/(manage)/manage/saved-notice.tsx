import { CircleCheckIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** Shown on a list page after a save or delete sent the admin back to it. */
export function SavedNotice({ text }: { text: string }) {
  return (
    <Alert>
      <CircleCheckIcon />
      <AlertDescription className="text-foreground">{text}</AlertDescription>
    </Alert>
  );
}
