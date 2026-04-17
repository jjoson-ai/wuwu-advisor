import { getRequestAuth } from "@/lib/auth";
import { createDeleteDataRequestResponse } from "@/domain/privacy/privacy.service";

export async function POST(request: Request) {
  try {
    const { user, accessToken } = await getRequestAuth(request);

    if (user === null) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const payload = await createDeleteDataRequestResponse(user, accessToken);

    return Response.json(payload, {
      status: 202,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to submit deletion request.";

    return Response.json({ error: message }, { status: 500 });
  }
}
