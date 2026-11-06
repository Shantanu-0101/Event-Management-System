import writeExcelFile from "write-excel-file/node";
import { exportTable, parseRegistrationFilters, toCsv } from "@/lib/registration-list";
import { apiError, requireEventStaff } from "@/server/api";
import { exportRegistrations, listRegistrations } from "@/server/services/registration-list";

const CONTENT_TYPES = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** The event's registrations: JSON by default, or a file with ?format=csv or ?format=xlsx. */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/v1/events/[id]/registrations">,
) {
  const { id } = await params;
  const access = await requireEventStaff(id);
  if (!access.ok) return access.response;

  const searchParams = new URL(request.url).searchParams;
  const filters = parseRegistrationFilters(Object.fromEntries(searchParams));
  const format = searchParams.get("format") ?? "json";

  if (format === "json") {
    const page = Math.floor(Number(searchParams.get("page"))) || 1;
    return Response.json(await listRegistrations(id, filters, page), {
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (format !== "csv" && format !== "xlsx") {
    return apiError(400, "BAD_FORMAT", "Format must be json, csv or xlsx.");
  }

  const table = exportTable(await exportRegistrations(access.user.id, id, filters, format));
  const file =
    format === "csv"
      ? toCsv(table)
      : await writeExcelFile(table, { stickyRowsCount: 1 }).toBuffer();

  return new Response(file as BodyInit, {
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      // Slugs are only letters, numbers and dashes, so they're safe in a header.
      "Content-Disposition": `attachment; filename="${access.event.slug}-registrations.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}
