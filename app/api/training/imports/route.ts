import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { getAdminContextForUserId } from "@/lib/auth/server";
import { isAdminRole } from "@/lib/auth/roles";
import {
  createAdminSupabaseClient,
  getSupabaseAdminConfig,
} from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const importBucket = "training-imports";
const maxFileSizeBytes = 10 * 1024 * 1024;
const allowedFileExtensions = new Set(["docx", "pdf", "txt"]);
const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

type FieldErrors = Partial<Record<string, string>>;
type ExtractionStatus = "extracting" | "text_ready" | "failed";

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) return null;

  return authHeader.slice("Bearer ".length).trim();
}

function jsonError(message: string, status: number, fieldErrors: FieldErrors = {}) {
  return NextResponse.json({ error: message, fieldErrors }, { status });
}

function logServerError(message: string, error: unknown) {
  console.error(`[training-imports] ${message}`, error);
}

function validateSupabaseAdminEnv() {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();

  if (!url) {
    return jsonError(
      "Missing NEXT_PUBLIC_SUPABASE_URL. Add it to your server environment.",
      500
    );
  }

  try {
    new URL(url);
  } catch {
    return jsonError(
      "Invalid NEXT_PUBLIC_SUPABASE_URL. Check the Supabase project URL.",
      500
    );
  }

  if (!serviceRoleKey) {
    return jsonError(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Add it to your server environment.",
      500
    );
  }

  return null;
}

async function requireAdminContext(request: Request) {
  const envError = validateSupabaseAdminEnv();

  if (envError) {
    return { response: envError, supabase: null, profile: null };
  }

  const token = getBearerToken(request);

  if (!token) {
    return {
      response: jsonError("You must be signed in to import training.", 401),
      supabase: null,
      profile: null,
    };
  }

  const supabase = createAdminSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return {
      response: jsonError("Your session is invalid or expired.", 401),
      supabase: null,
      profile: null,
    };
  }

  const { profile } = await getAdminContextForUserId(userData.user.id);

  if (!profile) {
    return {
      response: jsonError("You do not have access to this admin area.", 403),
      supabase: null,
      profile: null,
    };
  }

  return { response: null, supabase, profile };
}

function getFileExtension(fileName: string) {
  const extension = fileName.split(".").pop();
  return extension ? extension.toLowerCase() : "";
}

function sanitizeFileName(fileName: string) {
  const cleanedName = fileName
    .trim()
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._ -]/g, "")
    .replace(/\s+/g, "-");

  return cleanedName || "training-document";
}

function validateImportFile(file: File) {
  const extension = getFileExtension(file.name);

  if (!allowedFileExtensions.has(extension)) {
    return "Upload a .docx, .pdf, or .txt file.";
  }

  if (file.type && !allowedMimeTypes.has(file.type)) {
    return "Upload a valid Word document, PDF, or text file.";
  }

  if (file.size > maxFileSizeBytes) {
    return "Training import files must be 10MB or smaller.";
  }

  if (file.size === 0) {
    return "Choose a file that is not empty.";
  }

  return null;
}

function getReadableExtractionError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to extract text from the uploaded document.";
}

async function extractTextFromFile(fileExtension: string, fileBuffer: ArrayBuffer) {
  if (fileExtension === "docx") {
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(fileBuffer),
    });

    return result.value.trim();
  }

  if (fileExtension === "txt") {
    return new TextDecoder("utf-8").decode(fileBuffer).trim();
  }

  if (fileExtension === "pdf") {
    const parser = new PDFParse({ data: Buffer.from(fileBuffer) });

    try {
      const result = await parser.getText();
      return result.text.trim();
    } finally {
      await parser.destroy();
    }
  }

  return "";
}

async function updateImportJob(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  jobId: string,
  companyId: string,
  values: {
    status: ExtractionStatus;
    raw_text?: string | null;
    error_message?: string | null;
    completed_at?: string | null;
  }
) {
  return supabase
    .from("training_import_jobs")
    .update(values)
    .eq("id", jobId)
    .eq("company_id", companyId)
    .select("*")
    .single();
}

export async function POST(request: Request) {
  const { response, supabase, profile } = await requireAdminContext(request);

  if (response) return response;

  if (!profile.is_active || !isAdminRole(profile.role)) {
    return jsonError("Only active admins or managers can import training.", 403);
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch (error) {
    logServerError("Training import form parsing failed", error);
    return jsonError("Unable to read the uploaded file.", 400);
  }

  const fileValue = formData.get("file");

  if (!(fileValue instanceof File)) {
    return jsonError("Choose a training document to upload.", 400, {
      file: "Choose a training document to upload.",
    });
  }

  const fileError = validateImportFile(fileValue);

  if (fileError) {
    return jsonError(fileError, 400, { file: fileError });
  }

  const fileExtension = getFileExtension(fileValue.name);
  const safeFileName = sanitizeFileName(fileValue.name);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = `${profile.company_id}/imports/${timestamp}-${safeFileName}`;
  const fileBuffer = await fileValue.arrayBuffer();

  const uploadResult = await supabase.storage
    .from(importBucket)
    .upload(filePath, fileBuffer, {
      contentType: fileValue.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadResult.error) {
    logServerError("Training import storage upload failed", uploadResult.error);
    return jsonError("Unable to upload the training document.", 500);
  }

  const publicUrlResult = supabase.storage.from(importBucket).getPublicUrl(filePath);
  const fileUrl = publicUrlResult.data.publicUrl;

  // TODO: Send text to AI.
  // TODO: Create draft training module.
  const { data: job, error: jobError } = await supabase
    .from("training_import_jobs")
    .insert({
      company_id: profile.company_id,
      uploaded_by: profile.id,
      file_name: fileValue.name,
      file_type: fileExtension,
      file_url: fileUrl,
      file_path: filePath,
      status: "uploaded",
      raw_text: null,
      generated_json: null,
      created_module_id: null,
      error_message: null,
      completed_at: null,
    })
    .select("*")
    .single();

  if (jobError || !job) {
    logServerError("Training import job insert failed", jobError);
    await supabase.storage.from(importBucket).remove([filePath]);
    return jsonError("Unable to create the import job.", 500);
  }

  const extractingResult = await updateImportJob(
    supabase,
    job.id,
    profile.company_id,
    {
      status: "extracting",
      error_message: null,
    }
  );

  if (extractingResult.error || !extractingResult.data) {
    logServerError("Training import extracting status update failed", extractingResult.error);
    return jsonError("Unable to start document text extraction.", 500);
  }

  try {
    const rawText = await extractTextFromFile(fileExtension, fileBuffer);

    const readyResult = await updateImportJob(supabase, job.id, profile.company_id, {
      status: "text_ready",
      raw_text: rawText,
      error_message: null,
      completed_at: new Date().toISOString(),
    });

    if (readyResult.error || !readyResult.data) {
      logServerError("Training import text-ready update failed", readyResult.error);
      return jsonError("Unable to save extracted document text.", 500);
    }

    return NextResponse.json({ job: readyResult.data }, { status: 201 });
  } catch (error) {
    const errorMessage = getReadableExtractionError(error);

    logServerError("Training import text extraction failed", error);

    const failedResult = await updateImportJob(supabase, job.id, profile.company_id, {
      status: "failed",
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    });

    if (failedResult.error || !failedResult.data) {
      logServerError("Training import failed status update failed", failedResult.error);
      return jsonError("Document text extraction failed.", 500);
    }

    return NextResponse.json({ job: failedResult.data }, { status: 201 });
  }

}
