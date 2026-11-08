import { apiError, requireEventStaff } from "@/server/api";
import { pdfResponse } from "@/server/pdf-response";
import { downloadAllCertificates, previewCertificate } from "@/server/services/certificates";

/** All of an event's certificates in one PDF, or with ?sample=MERIT a sample page. */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/v1/events/[id]/certificates">,
) {
  const { id } = await params;
  const access = await requireEventStaff(id);
  if (!access.ok) return access.response;

  const sample = new URL(request.url).searchParams.get("sample");
  if (sample !== null && sample !== "MERIT" && sample !== "PARTICIPATION") {
    return apiError(400, "BAD_SAMPLE", "Sample must be MERIT or PARTICIPATION.");
  }

  try {
    if (sample) return pdfResponse(await previewCertificate(access.event, sample));
    const file = await downloadAllCertificates(access.user, access.event);
    if (!file) return apiError(404, "NO_CERTIFICATES", "No certificates have been issued yet.");
    return pdfResponse(file);
  } catch (e) {
    console.error("Could not draw certificates:", e);
    return apiError(
      502,
      "CERTIFICATE_FAILED",
      "The certificates couldn't be made. Try again soon.",
    );
  }
}
