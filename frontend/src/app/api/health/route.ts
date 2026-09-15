import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    service: "frontend-nextjs",
    timestamp: new Date().toISOString(),
  });
}
