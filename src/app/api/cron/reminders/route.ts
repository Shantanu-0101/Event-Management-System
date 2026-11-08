import { isCronAuthorized } from "@/server/cron";
import { sendDueReminders } from "@/server/services/reminders";

/** Reminds people about events starting soon. Scheduled in vercel.json. */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return Response.json({ error: "Not allowed." }, { status: 401 });
  }
  return Response.json(await sendDueReminders(new Date()));
}
