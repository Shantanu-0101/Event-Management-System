import { apiError } from "@/server/api";
import { pdfResponse } from "@/server/pdf-response";
import { downloadCertificate } from "@/server/services/certificates";
import { getCurrentUser } from "@/server/session";

/** One certificate as a PDF, for the person it belongs to or the event's staff. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/v1/certificates/[id]">,
) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) return apiError(401, "UNAUTHENTICATED", "Log in again to continue.");

  try {
    const file = await downloadCertificate(id, me);
    // Someone else's certificate looks the same as one that doesn't exist.
    if (!file) return apiError(404, "CERTIFICATE_NOT_FOUND", "This certificate doesn't exist.");
    return pdfResponse(file);
  } catch (e) {
    console.error("Could not draw a certificate:", e);
    return apiError(502, "CERTIFICATE_FAILED", "The certificate couldn't be made. Try again soon.");
  }
}
