import { getRequestAuth } from "@/lib/auth";
import { deleteUserAccount } from "@/domain/privacy/privacy.service";

export async function POST(request: Request) {
  try {
    const { user } = await getRequestAuth(request);

    if (user === null) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const result = await deleteUserAccount(user.id);

    return Response.json(
      {
        deletedAt: result.deletedAt,
        message:
          "Your account and all associated data have been permanently deleted. Some billing records may be retained to satisfy legal obligations.",
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete account.";

    return Response.json({ error: message }, { status: 500 });
  }
}
