import { NextResponse } from "next/server";

export async function GET() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.DEBUG_GOOGLE_OCR !== "true"
  ) {
    return new Response(null, { status: 404 });
  }

  return NextResponse.json({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    location: process.env.GOOGLE_CLOUD_LOCATION,
    processorIdPresent: !!process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID,
    credentialsPathPresent: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
    serviceAccountJsonPresent: !!process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON,
  });
}
