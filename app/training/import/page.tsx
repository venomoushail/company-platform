"use client";

import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileText, UploadCloud, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/layout/AdminLayout";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { normalizeGeneratedTrainingDraft } from "@/lib/training/importDraft";
import type { TrainingImportJob } from "@/types/supabase";
import type { GeneratedTrainingDraft } from "@/lib/training/importDraft";

type UploadState = "idle" | "uploading" | "success" | "error";

type ImportJobResponse = {
  job: TrainingImportJob;
};

type SaveDraftResponse = {
  job: TrainingImportJob;
  moduleId: string;
};

const maxFileSizeBytes = 10 * 1024 * 1024;
const allowedExtensions = new Set(["docx", "pdf", "txt"]);
const generationSteps = [
  "Analyzing document...",
  "Creating lesson outline...",
  "Writing slides...",
  "Generating quiz...",
];

function getReadableErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;

  const error = (data as { error?: unknown }).error;
  return typeof error === "string" ? error : fallback;
}

function getFileExtension(fileName: string) {
  const extension = fileName.split(".").pop();
  return extension ? extension.toLowerCase() : "";
}

function validateFile(file: File | null) {
  if (!file) return "Choose a training document to upload.";

  if (!allowedExtensions.has(getFileExtension(file.name))) {
    return "Upload a .docx, .pdf, or .txt file.";
  }

  if (file.size > maxFileSizeBytes) {
    return "Training import files must be 10MB or smaller.";
  }

  if (file.size === 0) {
    return "Choose a file that is not empty.";
  }

  return "";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatStatus(status: string) {
  return status
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getStatusBadgeClass(status: string) {
  if (status === "draft_ready" || status === "draft_created") {
    return "bg-green-100 text-green-700";
  }
  if (status === "text_ready") return "bg-green-100 text-green-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  if (status === "extracting" || status === "generating") {
    return "bg-yellow-100 text-yellow-700";
  }

  return "bg-blue-100 text-blue-700";
}

function getTextPreview(rawText: string | null) {
  if (!rawText) return "";

  const normalizedText = rawText.replace(/\s+/g, " ").trim();
  if (normalizedText.length <= 700) return normalizedText;

  return `${normalizedText.slice(0, 700)}...`;
}

function uploadImportFile(file: File, token: string, onProgress: (value: number) => void) {
  return new Promise<ImportJobResponse>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const formData = new FormData();

    formData.append("file", file);

    request.open("POST", "/api/training/imports");
    request.setRequestHeader("Authorization", `Bearer ${token}`);

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;

      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    request.onload = () => {
      let responseData: ImportJobResponse | { error?: string } | null = null;

      try {
        responseData = request.responseText
          ? (JSON.parse(request.responseText) as ImportJobResponse | { error?: string })
          : null;
      } catch {
        responseData = null;
      }

      if (request.status >= 200 && request.status < 300 && responseData) {
        resolve(responseData as ImportJobResponse);
        return;
      }

      reject(
        new Error(
          getReadableErrorMessage(responseData, "Unable to import the training document.")
        )
      );
    };

    request.onerror = () => {
      reject(new Error("Upload failed. Check your connection and try again."));
    };

    request.send(formData);
  });
}

export default function ImportTrainingPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [importJob, setImportJob] = useState<TrainingImportJob | null>(null);
  const [generationStatus, setGenerationStatus] = useState<UploadState>("idle");
  const [generationStepIndex, setGenerationStepIndex] = useState(0);
  const [generationMessage, setGenerationMessage] = useState("");
  const [saveStatus, setSaveStatus] = useState<UploadState>("idle");
  const [saveMessage, setSaveMessage] = useState("");

  const selectedFileSummary = useMemo(() => {
    if (!selectedFile) return "DOCX, PDF, or TXT up to 10MB";

    return `${selectedFile.name} (${formatFileSize(selectedFile.size)})`;
  }, [selectedFile]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    const error = validateFile(file);

    setSelectedFile(file);
    setValidationError(error);
    setMessage("");
    setGenerationMessage("");
    setSaveMessage("");
    setImportJob(null);
    setUploadState("idle");
    setGenerationStatus("idle");
    setSaveStatus("idle");
    setUploadProgress(0);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const fileError = validateFile(selectedFile);
    if (fileError || !selectedFile) {
      setValidationError(fileError);
      setUploadState("error");
      return;
    }

    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      setUploadState("error");
      setMessage("Supabase environment variables are not configured.");
      return;
    }

    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session?.access_token) {
      setUploadState("error");
      setMessage(error?.message || "Sign in before importing training documents.");
      return;
    }

    setUploadState("uploading");
    setUploadProgress(0);
    setMessage("");
    setValidationError("");

    try {
      const response = await uploadImportFile(
        selectedFile,
        data.session.access_token,
        setUploadProgress
      );

      setImportJob(response.job);
      setUploadState(response.job.status === "failed" ? "error" : "success");
      setGenerationStatus("idle");
      setGenerationMessage("");
      setSaveStatus("idle");
      setSaveMessage("");
      setUploadProgress(100);
      setMessage(
        response.job.status === "text_ready"
          ? "Training document uploaded and text extracted."
          : response.job.status === "failed"
            ? "Training document uploaded, but text extraction failed."
            : "Training document uploaded and import job created."
      );
      setSelectedFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      setUploadState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to import the training document."
      );
    }
  }

  async function getAccessToken() {
    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      throw new Error("Supabase environment variables are not configured.");
    }

    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session?.access_token) {
      throw new Error(error?.message || "Sign in before managing training imports.");
    }

    return data.session.access_token;
  }

  async function handleGenerateTraining() {
    if (!importJob) return;

    setGenerationStatus("uploading");
    setGenerationStepIndex(0);
    setGenerationMessage("");
    setSaveMessage("");

    let currentStep = 0;
    const progressTimer = window.setInterval(() => {
      currentStep = Math.min(currentStep + 1, generationSteps.length - 1);
      setGenerationStepIndex(currentStep);
    }, 1800);

    try {
      const token = await getAccessToken();
      const response = await fetch(
        `/api/training/imports/${encodeURIComponent(importJob.id)}/generate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const responseData = (await response.json().catch(() => null)) as
        | ImportJobResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          getReadableErrorMessage(responseData, "Unable to generate training.")
        );
      }

      setImportJob((responseData as ImportJobResponse).job);
      setGenerationStatus("success");
      setGenerationMessage("AI draft is ready for review.");
    } catch (error) {
      setGenerationStatus("error");
      setGenerationMessage(
        error instanceof Error ? error.message : "Unable to generate training."
      );
    } finally {
      window.clearInterval(progressTimer);
      setGenerationStepIndex(generationSteps.length - 1);
    }
  }

  async function handleSaveDraft() {
    if (!importJob) return;

    setSaveStatus("uploading");
    setSaveMessage("");

    try {
      const token = await getAccessToken();
      const response = await fetch(
        `/api/training/imports/${encodeURIComponent(importJob.id)}/save`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const responseData = (await response.json().catch(() => null)) as
        | SaveDraftResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          getReadableErrorMessage(responseData, "Unable to save the training draft.")
        );
      }

      const saveResponse = responseData as SaveDraftResponse;
      setImportJob(saveResponse.job);
      setSaveStatus("success");
      router.push(`/training/new?id=${encodeURIComponent(saveResponse.moduleId)}`);
    } catch (error) {
      setSaveStatus("error");
      setSaveMessage(
        error instanceof Error ? error.message : "Unable to save the training draft."
      );
    }
  }

  const isUploading = uploadState === "uploading";
  const isGenerating = generationStatus === "uploading";
  const isSaving = saveStatus === "uploading";
  const extractedTextPreview = getTextPreview(importJob?.raw_text ?? null);
  const characterCount = importJob?.raw_text?.length ?? 0;
  const generatedDraft = useMemo<GeneratedTrainingDraft | null>(
    () => normalizeGeneratedTrainingDraft(importJob?.generated_json ?? null),
    [importJob?.generated_json]
  );

  return (
    <AdminLayout
      title="Import Training"
      description="Upload a source document to prepare a future draft training module."
    >
      <div className="mb-6">
        <a
          href="/training"
          className="text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          Back to Training Modules
        </a>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <UploadCloud size={22} strokeWidth={2.2} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Upload Training Document
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Accepted formats: Word, PDF, and plain text.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <label
              className={`block rounded-xl border-2 border-dashed p-6 transition ${
                validationError
                  ? "border-red-200 bg-red-50"
                  : "border-slate-200 bg-slate-50 hover:border-slate-300"
              }`}
            >
              <span className="flex items-center gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm">
                  <FileText size={22} strokeWidth={2.2} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">
                    {selectedFileSummary}
                  </span>
                  <span className="mt-1 block text-sm text-slate-500">
                    Select a source document for this company.
                  </span>
                </span>
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.pdf,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                disabled={isUploading}
                onChange={handleFileChange}
                className="mt-5 block w-full cursor-pointer rounded-lg border border-slate-200 bg-white text-sm text-slate-600 file:mr-4 file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
              />
            </label>

            {validationError && (
              <p className="text-sm font-medium text-red-700">{validationError}</p>
            )}

            {isUploading && (
              <div>
                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span>Uploading</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-[var(--company-secondary)] transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {message && (
              <div
                className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm font-medium ${
                  uploadState === "success"
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {uploadState === "success" ? (
                  <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
                ) : (
                  <XCircle className="mt-0.5 shrink-0" size={18} />
                )}
                <span>{message}</span>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="submit"
                disabled={isUploading}
                className="company-primary-button rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUploading ? "Uploading..." : "Upload Document"}
              </button>
              <a
                href="/training/new"
                className="rounded-lg border border-slate-300 px-4 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-white"
              >
                Add Training Manually
              </a>
            </div>
          </form>
        </section>

        <aside className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Import Job</h2>
          <p className="mt-1 text-sm text-slate-500">
            The next processing steps will run from this saved job record.
          </p>

          {importJob ? (
            <dl className="mt-6 space-y-4">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  File name
                </dt>
                <dd className="mt-1 break-words text-sm font-semibold text-slate-900">
                  {importJob.file_name}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </dt>
                <dd className="mt-1">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(
                      importJob.status
                    )}`}
                  >
                    {formatStatus(importJob.status)}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Character count
                </dt>
                <dd className="mt-1 text-sm font-semibold text-slate-900">
                  {characterCount.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Extracted text preview
                </dt>
                <dd className="mt-2">
                  {extractedTextPreview ? (
                    <div className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                      {extractedTextPreview}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                      {importJob.status === "failed"
                        ? importJob.error_message || "Text extraction failed."
                        : "No extracted text is available yet."}
                    </div>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Uploaded
                </dt>
                <dd className="mt-1 text-sm font-semibold text-slate-900">
                  {formatDateTime(importJob.created_at)}
                </dd>
              </div>
            </dl>
          ) : (
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Upload a document to create an import job.
            </div>
          )}
        </aside>
      </div>

      {importJob?.status === "text_ready" && (
        <section className="mt-6 rounded-xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Generate Training Draft
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Use the extracted text to create an editable training draft for review.
              </p>
            </div>
            <button
              type="button"
              disabled={isGenerating}
              onClick={handleGenerateTraining}
              className="company-primary-button rounded-lg px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? "Generating..." : "Generate Training with AI"}
            </button>
          </div>

          {isGenerating && (
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                {generationSteps[generationStepIndex]}
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-[var(--company-secondary)] transition-all"
                  style={{
                    width: `${((generationStepIndex + 1) / generationSteps.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {generationMessage && (
            <div
              className={`mt-5 rounded-lg border px-4 py-3 text-sm font-medium ${
                generationStatus === "success"
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {generationMessage}
            </div>
          )}
        </section>
      )}

      {importJob?.status === "draft_ready" && generatedDraft && (
        <section className="mt-6 rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                AI Draft Review
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Review the generated training before saving it as an editable draft.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                disabled={isGenerating || isSaving}
                onClick={handleGenerateTraining}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Regenerate
              </button>
              <button
                type="button"
                disabled={isSaving || isGenerating}
                onClick={handleSaveDraft}
                className="company-primary-button rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "Saving..." : "Save Draft"}
              </button>
              <a
                href="/training"
                className="rounded-lg border border-slate-300 px-4 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </a>
            </div>
          </div>

          {saveMessage && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {saveMessage}
            </div>
          )}

          {isGenerating && (
            <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                {generationSteps[generationStepIndex]}
              </p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Course Title
              </p>
              <p className="mt-2 text-lg font-bold text-slate-900">
                {generatedDraft.module.title}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Estimated Minutes
              </p>
              <p className="mt-2 text-lg font-bold text-slate-900">
                {generatedDraft.module.estimated_minutes}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Contents
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {generatedDraft.slides.length} slides, {generatedDraft.quiz.length} quiz questions
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Description
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {generatedDraft.module.description}
            </p>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Slide List
              </h3>
              <div className="mt-3 space-y-3">
                {generatedDraft.slides.map((slide) => (
                  <article
                    key={slide.slide_order}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    <p className="text-sm font-bold text-slate-900">
                      {slide.slide_order}. {slide.title}
                    </p>
                    <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                      {slide.body}
                    </p>
                  </article>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Quiz List
              </h3>
              <div className="mt-3 space-y-3">
                {generatedDraft.quiz.map((question) => (
                  <article
                    key={question.question_order}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    <p className="text-sm font-bold text-slate-900">
                      {question.question_order}. {question.question_text}
                    </p>
                    <ul className="mt-3 space-y-1 text-sm text-slate-600">
                      <li>A. {question.answer_a}</li>
                      <li>B. {question.answer_b}</li>
                      <li>C. {question.answer_c}</li>
                      <li>D. {question.answer_d}</li>
                    </ul>
                    <p className="mt-3 text-xs font-semibold text-slate-500">
                      Correct answer: {question.correct_answer}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </AdminLayout>
  );
}
