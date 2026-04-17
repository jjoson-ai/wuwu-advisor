import { getRequestAuth } from "@/lib/auth";
import { buildUserDataExport } from "@/domain/privacy/privacy.service";

export async function GET(request: Request) {
  try {
    const { user, accessToken } = await getRequestAuth(request);

    if (user === null) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const payload = await buildUserDataExport(user, accessToken);
    const filename = `wuwu-advisor-data-export-${new Date().toISOString().slice(0, 10)}.json`;

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to prepare data export.";

    return Response.json({ error: message }, { status: 500 });
  }
}
