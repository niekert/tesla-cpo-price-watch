import { checkPricesWorkflow } from "@/workflows/check-prices";
import { NextResponse } from "next/server";
import { start } from "workflow/api";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes max

export async function GET(request: Request) {
  console.log("CRON TRIGGERED");
  // Verify the request is from Vercel Cron (only if CRON_SECRET is configured)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    console.log("Starting price check workflow...");
    await start(checkPricesWorkflow, []);

    return NextResponse.json({
      success: true,
      message: "Price check workflow started",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to start workflow:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
