import { ownerAvisoFilename, renderOwnerAvisoPdf } from "@/server/invoices/owner-aviso-pdf";
import { loadOwnerAvisoData } from "@/server/invoices/owner-aviso-data";
import { getStaffContext } from "@/server/staff-context";

export const runtime = "nodejs";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function plain(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

// Read-only AVISO DE PAGO preview for one Owner and month. Nothing is persisted.
export async function GET(request: Request, ctx: RouteContext<"/obligations/owners/[ownerId]/aviso">) {
  const staffContext = await getStaffContext();
  if (!staffContext) return plain("No autorizado.", 401);

  const { ownerId } = await ctx.params;
  // A malformed id never reaches the database, so its error is never echoed back.
  if (!UUID_PATTERN.test(ownerId)) return plain("Owner not found.", 404);
  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!MONTH_PATTERN.test(month)) return plain("Mes inválido. Use el formato AAAA-MM.", 400);

  const result = await loadOwnerAvisoData({ ownerId, obligationMonth: month });
  if (result.error !== null) return plain(result.error, result.status);

  const pdf = await renderOwnerAvisoPdf(result.data, new Date());
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${ownerAvisoFilename(result.data)}"`,
      "Cache-Control": "no-store",
    },
  });
}
