import { NextResponse } from "next/server";
import { z } from "zod";

import { generateModelComparison } from "@/domain/evals/model-comparison.service";
import { getCurrentUser } from "@/lib/auth";

const ComparisonRequestSchema = z.object({
  reportType: z.enum(["daily", "blueprint"]),
  includeScorers: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();

    if (user === null) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const input = ComparisonRequestSchema.parse(body);
    const result = await generateModelComparison({
      userId: user.id,
      userEmail: user.email ?? null,
      reportType: input.reportType,
      includeScorers: input.includeScorers,
    });

    return NextResponse.json({
      document: result.document,
      document_html: result.documentHtml,
      generated_at: result.data.generatedAt,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to generate model comparison.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
