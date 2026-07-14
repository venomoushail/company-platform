import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminContextForUserId } from "@/lib/auth/server";
import { isAdminRole } from "@/lib/auth/roles";
import {
  createAdminSupabaseClient,
  getSupabaseAdminConfig,
} from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bucket = "training-slide-images";
const maxFileSizeBytes = 5 * 1024 * 1024;
const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;
}

function sanitizePathSegment(value: string, fallback: string) {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized || fallback;
}

export async function POST(request: Request) {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  if (!url || !serviceRoleKey) {
    return jsonError("Image storage is not configured.", 500);
  }

  const token = getBearerToken(request);
  if (!token) return jsonError("You must be signed in to upload images.", 401);

  const supabase = createAdminSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return jsonError("Your session is invalid or expired.", 401);
  }

  const { profile } = await getAdminContextForUserId(userData.user.id);
  if (!profile || !profile.is_active || !isAdminRole(profile.role)) {
    return jsonError("Only active admins or managers can upload training images.", 403);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Unable to read the image upload.", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return jsonError("Choose an image to upload.", 400);
  if (!allowedMimeTypes.has(file.type)) {
    return jsonError("Use a JPG, PNG, or WebP image.", 400);
  }
  if (file.size === 0 || file.size > maxFileSizeBytes) {
    return jsonError("Images must be between 1 byte and 5MB.", 400);
  }

  const requestedModuleId = String(formData.get("moduleId") || "").trim();
  if (requestedModuleId) {
    const { data: module } = await supabase
      .from("training_modules")
      .select("id")
      .eq("id", requestedModuleId)
      .eq("company_id", profile.company_id)
      .maybeSingle();

    if (!module) return jsonError("That training is not available to your company.", 403);
  }

  const moduleSegment = requestedModuleId || `draft-${profile.id}`;
  const slideSegment = sanitizePathSegment(
    String(formData.get("slideId") || "slide"),
    "slide"
  );
  const safeFileName = sanitizePathSegment(file.name, "image");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const storagePath = `${profile.company_id}/training-slides/${moduleSegment}/${slideSegment}/${timestamp}-${randomUUID()}-${safeFileName}`;
  const fileBuffer = await file.arrayBuffer();
  const upload = await supabase.storage.from(bucket).upload(storagePath, fileBuffer, {
    contentType: file.type,
    upsert: false,
  });

  if (upload.error) {
    console.error("[training-images] Storage upload failed", upload.error);
    return jsonError("Unable to upload the image. Please try again.", 500);
  }

  const publicUrl = supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
  return NextResponse.json({ url: publicUrl, storagePath });
}
