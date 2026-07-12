"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileText, UploadCloud, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/layout/AdminLayout";
import LessonContent from "@/components/training/LessonContent";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  getGeneratedTrainingDraftMetadata,
  normalizeGeneratedTrainingDraft,
} from "@/lib/training/importDraft";
import { getGeneratedCurriculumRecord } from "@/lib/training/curriculumBuilder";
import type { TrainingImportJob } from "@/types/supabase";
import type { TrainingModule } from "@/types/supabase";
import type { GeneratedTrainingDraft } from "@/lib/training/importDraft";
import {
  availablePromptVersions,
  defaultPromptVersion,
  type GenerationStyle,
  type PromptVersion,
} from "@/lib/ai/prompts/restaurantTraining";

type UploadState = "idle" | "uploading" | "success" | "error";
type ImportMode = "single" | "library";

type ImportJobResponse = {
  job: TrainingImportJob;
};

type ImportJobsResponse = {
  jobs: TrainingImportJob[];
};

type TrainingModulesResponse = {
  modules: TrainingModule[];
};

type GeneratedModuleSummary = Pick<TrainingModule, "id" | "title" | "status">;

type SaveDraftResponse = {
  job: TrainingImportJob;
  moduleId: string;
};

type GenerateSelectedTrainingsResponse = {
  job: TrainingImportJob;
  modules: { id: string; title: string }[];
};

const maxFileSizeBytes = 10 * 1024 * 1024;
const allowedExtensions = new Set(["docx", "pdf", "txt"]);
const generationSteps = [
  "Analyzing document...",
  "Creating lesson outline...",
  "Writing slides...",
  "Generating quiz...",
];
const curriculumGenerationSteps = [
  "Analyzing handbook...",
  "Finding training topics...",
  "Building curriculum outline...",
];
const selectedTrainingGenerationSteps = [
  "Generating selected trainings...",
  "Writing draft modules...",
  "Saving slides and quizzes...",
];
const extractionStageLabels = [
  "Uploading document...",
  "Reading PDF...",
  "Checking PDF text quality...",
  "Preparing OCR sections...",
  "Running OCR on a large document...",
  "Combining extracted text...",
  "Text ready",
];
const generationStyleOptions: { value: GenerationStyle; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "beginner_friendly", label: "Beginner Friendly" },
  { value: "detailed", label: "Detailed" },
  { value: "executive_summary", label: "Executive Summary" },
];
const promptVersionOptions = [...availablePromptVersions];

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

function formatSlideType(slideType: string) {
  if (slideType === "image_hotspot") return "Image Hotspot";
  if (slideType === "knowledge_check") return "Knowledge Check";
  return formatStatus(slideType);
}

function getDraftConfig(slide: GeneratedTrainingDraft["slides"][number]) {
  return slide.config && typeof slide.config === "object" ? slide.config : {};
}

function readConfigString(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" ? value : "";
}

function readConfigAnswers(config: Record<string, unknown>) {
  const answers = config.answers;
  if (!Array.isArray(answers)) return [];

  return answers
    .map((answer) => {
      if (!answer || typeof answer !== "object") return null;
      const answerRecord = answer as Record<string, unknown>;
      const id = readConfigString(answerRecord, "id");
      const text = readConfigString(answerRecord, "text");
      return id && text ? { id, text } : null;
    })
    .filter((answer): answer is { id: string; text: string } => Boolean(answer));
}

function readConfigStringArray(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];
}

function readSuggestedHotspots(config: Record<string, unknown>) {
  const value = config.suggestedHotspots;
  if (!Array.isArray(value)) return [];

  return value
    .map((hotspot) => {
      if (!hotspot || typeof hotspot !== "object") return null;
      const hotspotRecord = hotspot as Record<string, unknown>;
      const title = readConfigString(hotspotRecord, "title");
      const description = readConfigString(hotspotRecord, "description");
      return title || description ? { title, description } : null;
    })
    .filter(
      (hotspot): hotspot is { title: string; description: string } =>
        Boolean(hotspot)
    );
}

function renderGeneratedBlockPreview(slide: GeneratedTrainingDraft["slides"][number]) {
  const config = getDraftConfig(slide);

  if (slide.slide_type === "knowledge_check" || slide.slide_type === "scenario") {
    const answers = readConfigAnswers(config);
    const correctAnswerId = readConfigString(config, "correctAnswerId");
    const correctAnswer = answers.find((answer) => answer.id === correctAnswerId);
    const prompt =
      slide.slide_type === "scenario"
        ? readConfigString(config, "question")
        : readConfigString(config, "question") || slide.question_text;

    return (
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        {slide.slide_type === "scenario" && (
          <p className="mb-2 text-sm leading-6 text-slate-700">
            {readConfigString(config, "scenarioText")}
          </p>
        )}
        <p className="text-sm font-semibold text-slate-900">{prompt}</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          {answers.map((answer) => (
            <li key={answer.id}>
              {answer.id}. {answer.text}
            </li>
          ))}
        </ul>
        {correctAnswer && (
          <p className="mt-2 text-xs font-semibold text-slate-500">
            Correct answer: {correctAnswer.text}
          </p>
        )}
        {readConfigString(config, "explanation") && (
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {readConfigString(config, "explanation")}
          </p>
        )}
      </div>
    );
  }

  if (slide.slide_type === "reflection") {
    return (
      <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
          Reflection Prompt
        </p>
        <p className="mt-1 text-sm leading-6 text-slate-700">
          {readConfigString(config, "prompt")}
        </p>
      </div>
    );
  }

  if (slide.slide_type === "recap") {
    const items = readConfigStringArray(config, "items");
    return (
      <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3">
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
        {readConfigString(config, "closingMessage") && (
          <p className="mt-2 text-sm font-semibold text-green-900">
            {readConfigString(config, "closingMessage")}
          </p>
        )}
      </div>
    );
  }

  if (slide.slide_type === "image_hotspot") {
    const suggestedHotspots = readSuggestedHotspots(config);
    return (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
          Admin setup required
        </p>
        <p className="mt-1 text-sm leading-6 text-amber-900">
          {readConfigString(config, "imageSuggestion") || "Upload an image and place hotspots in the Training Builder."}
        </p>
        {suggestedHotspots.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {suggestedHotspots.map((hotspot, index) => (
              <li key={`${hotspot.title}-${index}`}>
                <span className="font-semibold">{hotspot.title}</span>
                {hotspot.description ? `: ${hotspot.description}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return null;
}

function getStatusBadgeClass(status: string) {
  if (
    status === "draft_ready" ||
    status === "draft_created" ||
    status === "curriculum_ready" ||
    status === "modules_created"
  ) {
    return "bg-green-100 text-green-700";
  }
  if (status === "text_ready") return "bg-green-100 text-green-700";
  if (status === "failed" || status === "curriculum_failed") {
    return "bg-red-100 text-red-700";
  }
  if (
    status === "extracting" ||
    status === "generating" ||
    status === "curriculum_generating" ||
    status === "modules_generating"
  ) {
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

function getExtractionMethodLabel(job: TrainingImportJob) {
  switch (job.extraction_method) {
    case "docx":
      return "Text extracted from Word document";
    case "txt":
      return "Text extracted from text file";
    case "pdf_embedded_text":
      return "Text extracted from PDF";
    case "pdf_ocr":
      return "OCR used for scanned or unreadable PDF";
    case "manual_paste":
      return "Text pasted manually";
    default:
      return "Extraction method not recorded";
  }
}

function formatConfidence(confidence: number | null) {
  if (typeof confidence !== "number") return null;

  return `${Math.round(confidence * 100)}%`;
}

function hasLowExtractionConfidence(job: TrainingImportJob) {
  return (
    typeof job.extraction_confidence === "number" &&
    job.extraction_confidence < 0.75
  );
}

function toHexString(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getFileHash(file: File) {
  const digest = await window.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return toHexString(digest);
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

async function fetchImportJobs(token: string) {
  const response = await fetch("/api/training/imports", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const responseData = (await response.json().catch(() => null)) as
    | ImportJobsResponse
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(
      getReadableErrorMessage(responseData, "Unable to load imported documents.")
    );
  }

  return (responseData as ImportJobsResponse).jobs;
}

async function fetchTrainingModules(token: string) {
  const response = await fetch("/api/training", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const responseData = (await response.json().catch(() => null)) as
    | TrainingModulesResponse
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(
      getReadableErrorMessage(responseData, "Unable to load generated trainings.")
    );
  }

  return (responseData as TrainingModulesResponse).modules;
}

async function saveManualPastedText(jobId: string, rawText: string, token: string) {
  const response = await fetch(`/api/training/imports/${encodeURIComponent(jobId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ rawText }),
  });
  const responseData = (await response.json().catch(() => null)) as
    | ImportJobResponse
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(
      getReadableErrorMessage(responseData, "Unable to save pasted document text.")
    );
  }

  return (responseData as ImportJobResponse).job;
}

function getLikelyDuplicateImport(
  file: File | null,
  fileHash: string,
  jobs: TrainingImportJob[]
) {
  if (!file) return null;

  const fileName = file.name.trim().toLowerCase();
  const fileType = getFileExtension(file.name);
  const hashMatch = fileHash
    ? jobs.find((job) => job.file_hash && job.file_hash === fileHash)
    : null;

  if (hashMatch) return hashMatch;

  return (
    jobs.find(
      (job) =>
        job.file_name.trim().toLowerCase() === fileName &&
        job.file_type.trim().toLowerCase() === fileType
    ) ?? null
  );
}

function getCreatedModuleIds(job: TrainingImportJob) {
  const curriculumRecord = getGeneratedCurriculumRecord(job.generated_json);
  const moduleIds = [
    ...(curriculumRecord?.created_module_ids ?? []),
    ...(job.created_module_id ? [job.created_module_id] : []),
  ];

  return Array.from(new Set(moduleIds));
}

function getStatusBadgeClassForModule(status: string) {
  if (status === "published") return "bg-green-100 text-green-700";
  if (status === "archived") return "bg-slate-200 text-slate-600";

  return "bg-yellow-100 text-yellow-700";
}

function GeneratedModuleLinks({
  moduleIds,
  moduleMap,
}: {
  moduleIds: string[];
  moduleMap: Map<string, GeneratedModuleSummary>;
}) {
  if (moduleIds.length === 0) return null;

  // TODO: Extend this with module completion counts, last edited date, assigned employee count, and publish status detail.
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Generated Modules
      </p>
      <div className="space-y-1.5">
        {moduleIds.map((moduleId) => {
          const generatedModule = moduleMap.get(moduleId);
          const title = generatedModule?.title?.trim() || "Unknown Training";
          const status = generatedModule?.status?.trim() || "";

          return (
            <a
              key={moduleId}
              href={`/training/new?id=${encodeURIComponent(moduleId)}`}
              title={title}
              className="flex max-w-72 items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <span className="min-w-0 truncate">📘 {title}</span>
              {status && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${getStatusBadgeClassForModule(
                    status
                  )}`}
                >
                  {formatStatus(status)}
                </span>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}

export default function ImportTrainingPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileHash, setSelectedFileHash] = useState("");
  const [validationError, setValidationError] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [importJob, setImportJob] = useState<TrainingImportJob | null>(null);
  const [existingImports, setExistingImports] = useState<TrainingImportJob[]>([]);
  const [generatedModuleMap, setGeneratedModuleMap] = useState<
    Map<string, GeneratedModuleSummary>
  >(new Map());
  const [importsStatus, setImportsStatus] = useState<UploadState>("idle");
  const [importsMessage, setImportsMessage] = useState("");
  const [importSearch, setImportSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [allowDuplicateUpload, setAllowDuplicateUpload] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState("");
  const [generationStatus, setGenerationStatus] = useState<UploadState>("idle");
  const [generationStepIndex, setGenerationStepIndex] = useState(0);
  const [generationMessage, setGenerationMessage] = useState("");
  const [generationStepLabels, setGenerationStepLabels] = useState(generationSteps);
  const [importMode, setImportMode] = useState<ImportMode>("single");
  const [selectedCurriculumModules, setSelectedCurriculumModules] = useState<number[]>(
    []
  );
  const [createdCurriculumModules, setCreatedCurriculumModules] = useState<
    { id: string; title: string }[]
  >([]);
  const [generationStyle, setGenerationStyle] =
    useState<GenerationStyle>("standard");
  const [promptVersion, setPromptVersion] =
    useState<PromptVersion>(defaultPromptVersion);
  const [saveStatus, setSaveStatus] = useState<UploadState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [manualPasteText, setManualPasteText] = useState("");
  const [manualPasteStatus, setManualPasteStatus] = useState<UploadState>("idle");
  const [manualPasteMessage, setManualPasteMessage] = useState("");

  const selectedFileSummary = useMemo(() => {
    if (!selectedFile) return "DOCX, PDF, or TXT up to 10MB";

    return `${selectedFile.name} (${formatFileSize(selectedFile.size)})`;
  }, [selectedFile]);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialImports() {
      const supabase = createBrowserSupabaseClient();

      if (!supabase) {
        if (isMounted) {
          setImportsStatus("error");
          setImportsMessage("Supabase environment variables are not configured.");
        }
        return;
      }

      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session?.access_token) {
        if (isMounted) {
          setImportsStatus("error");
          setImportsMessage(error?.message || "Sign in to view imported documents.");
        }
        return;
      }

      try {
        if (isMounted) {
          setImportsStatus("uploading");
          setImportsMessage("");
        }
        const [jobs, modules] = await Promise.all([
          fetchImportJobs(data.session.access_token),
          fetchTrainingModules(data.session.access_token),
        ]);

        if (isMounted) {
          setExistingImports(jobs);
          setGeneratedModuleMap(
            new Map(
              modules.map((module) => [
                module.id,
                {
                  id: module.id,
                  title: module.title,
                  status: module.status,
                },
              ])
            )
          );
          setImportsStatus("success");
        }
      } catch (error) {
        if (isMounted) {
          setImportsStatus("error");
          setImportsMessage(
            error instanceof Error ? error.message : "Unable to load imported documents."
          );
        }
      }
    }

    void loadInitialImports();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    const error = validateFile(file);

    setSelectedFile(file);
    setSelectedFileHash("");
    setValidationError(error);
    setMessage("");
    setDuplicateWarning("");
    setAllowDuplicateUpload(false);
    setGenerationMessage("");
    setSaveMessage("");
    setManualPasteMessage("");
    setUploadState("idle");
    setGenerationStatus("idle");
    setSaveStatus("idle");
    setUploadProgress(0);

    if (!file || error) return;

    try {
      const fileHash = await getFileHash(file);
      const likelyDuplicate = getLikelyDuplicateImport(
        file,
        fileHash,
        existingImports
      );

      setSelectedFileHash(fileHash);
      setDuplicateWarning(
        likelyDuplicate
          ? "This document appears to already exist in your Training Document Library."
          : ""
      );
    } catch {
      const likelyDuplicate = getLikelyDuplicateImport(file, "", existingImports);

      setDuplicateWarning(
        likelyDuplicate
          ? "This document appears to already exist in your Training Document Library."
          : ""
      );
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const fileError = validateFile(selectedFile);
    if (fileError || !selectedFile) {
      setValidationError(fileError);
      setUploadState("error");
      return;
    }

    const fileHash = selectedFileHash || (await getFileHash(selectedFile).catch(() => ""));
    const likelyDuplicate = getLikelyDuplicateImport(
      selectedFile,
      fileHash,
      existingImports
    );

    if (likelyDuplicate && !allowDuplicateUpload) {
      setSelectedFileHash(fileHash);
      setDuplicateWarning(
        "This document appears to already exist in your Training Document Library."
      );
      setImportJob(likelyDuplicate);
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
      updateExistingImportJob(response.job);
      setUploadState(response.job.status === "failed" ? "error" : "success");
      setGenerationStatus("idle");
      setGenerationMessage("");
      setSaveStatus("idle");
      setSaveMessage("");
      setManualPasteText("");
      setManualPasteMessage("");
      setManualPasteStatus("idle");
      setUploadProgress(100);
      setMessage(
        response.job.status === "text_ready"
          ? "Training document uploaded and text extracted."
          : response.job.status === "failed"
            ? "Training document uploaded, but text extraction failed."
            : "Training document uploaded and import job created."
      );
      setSelectedFile(null);
      setSelectedFileHash("");
      setDuplicateWarning("");
      setAllowDuplicateUpload(false);

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

  async function loadExistingImportJobs() {
    setImportsStatus("uploading");
    setImportsMessage("");

    try {
      const token = await getAccessToken();
      const [jobs, modules] = await Promise.all([
        fetchImportJobs(token),
        fetchTrainingModules(token),
      ]);

      setExistingImports(jobs);
      setGeneratedModuleMap(
        new Map(
          modules.map((module) => [
            module.id,
            {
              id: module.id,
              title: module.title,
              status: module.status,
            },
          ])
        )
      );
      setImportsStatus("success");
    } catch (error) {
      setImportsStatus("error");
      setImportsMessage(
        error instanceof Error ? error.message : "Unable to load imported documents."
      );
    }
  }

  function updateExistingImportJob(job: TrainingImportJob) {
    setExistingImports((currentJobs) => {
      const nextJobs = currentJobs.filter((currentJob) => currentJob.id !== job.id);
      return [job, ...nextJobs].sort(
        (first, second) =>
          new Date(second.created_at).getTime() - new Date(first.created_at).getTime()
      );
    });
  }

  function updateGeneratedModuleSummaries(modules: GeneratedModuleSummary[]) {
    setGeneratedModuleMap((currentMap) => {
      const nextMap = new Map(currentMap);

      for (const generatedModule of modules) {
        nextMap.set(generatedModule.id, generatedModule);
      }

      return nextMap;
    });
  }

  function selectImportJob(job: TrainingImportJob) {
    const curriculumRecord = getGeneratedCurriculumRecord(job.generated_json);

    setImportJob(job);
    setGenerationMessage("");
    setSaveMessage("");
    setGenerationStatus("idle");
    setSaveStatus("idle");
    setManualPasteStatus("idle");
    setManualPasteMessage("");
    setManualPasteText("");
    setCreatedCurriculumModules([]);

    if (curriculumRecord) {
      setImportMode("library");
      setSelectedCurriculumModules(
        curriculumRecord.curriculum.recommended_modules.map(
          (module) => module.module_order
        )
      );
    }
  }

  async function handleGenerateTraining(targetJob?: TrainingImportJob) {
    const jobToGenerate = targetJob ?? importJob;

    if (!jobToGenerate) return;

    setImportJob(jobToGenerate);

    setGenerationStatus("uploading");
    setGenerationStepIndex(0);
    setGenerationStepLabels(generationSteps);
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
        `/api/training/imports/${encodeURIComponent(jobToGenerate.id)}/generate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ generationStyle, promptVersion }),
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

      const updatedJob = (responseData as ImportJobResponse).job;
      setImportJob(updatedJob);
      updateExistingImportJob(updatedJob);
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

  async function handleDetectCurriculum(targetJob?: TrainingImportJob) {
    const jobToGenerate = targetJob ?? importJob;

    if (!jobToGenerate) return;

    setImportJob(jobToGenerate);
    setImportMode("library");
    setGenerationStatus("uploading");
    setGenerationStepIndex(0);
    setGenerationStepLabels(curriculumGenerationSteps);
    setGenerationMessage("");
    setSaveMessage("");
    setCreatedCurriculumModules([]);

    let currentStep = 0;
    const progressTimer = window.setInterval(() => {
      currentStep = Math.min(currentStep + 1, curriculumGenerationSteps.length - 1);
      setGenerationStepIndex(currentStep);
    }, 1800);

    try {
      const token = await getAccessToken();
      const response = await fetch(
        `/api/training/imports/${encodeURIComponent(
          jobToGenerate.id
        )}/detect-curriculum`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ generationStyle }),
        }
      );
      const responseData = (await response.json().catch(() => null)) as
        | ImportJobResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          getReadableErrorMessage(responseData, "Unable to detect curriculum.")
        );
      }

      const updatedJob = (responseData as ImportJobResponse).job;
      const curriculumRecord = getGeneratedCurriculumRecord(updatedJob.generated_json);

      setImportJob(updatedJob);
      updateExistingImportJob(updatedJob);
      setSelectedCurriculumModules(
        curriculumRecord?.curriculum.recommended_modules.map(
          (module) => module.module_order
        ) ?? []
      );
      setGenerationStatus("success");
      setGenerationMessage("AI curriculum outline is ready for review.");
    } catch (error) {
      setGenerationStatus("error");
      setGenerationMessage(
        error instanceof Error ? error.message : "Unable to detect curriculum."
      );
    } finally {
      window.clearInterval(progressTimer);
      setGenerationStepIndex(curriculumGenerationSteps.length - 1);
    }
  }

  function toggleCurriculumModule(moduleOrder: number) {
    setSelectedCurriculumModules((currentOrders) =>
      currentOrders.includes(moduleOrder)
        ? currentOrders.filter((order) => order !== moduleOrder)
        : [...currentOrders, moduleOrder].sort((first, second) => first - second)
    );
  }

  async function handleGenerateSelectedTrainings() {
    if (!importJob || selectedCurriculumModules.length === 0) return;

    setSaveStatus("uploading");
    setGenerationStepIndex(0);
    setGenerationStepLabels(selectedTrainingGenerationSteps);
    setSaveMessage("");
    setGenerationMessage("");
    setCreatedCurriculumModules([]);

    let currentStep = 0;
    const progressTimer = window.setInterval(() => {
      currentStep = Math.min(
        currentStep + 1,
        selectedTrainingGenerationSteps.length - 1
      );
      setGenerationStepIndex(currentStep);
    }, 2200);

    try {
      const token = await getAccessToken();
      const response = await fetch(
        `/api/training/imports/${encodeURIComponent(
          importJob.id
        )}/generate-selected-trainings`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            selectedModuleOrders: selectedCurriculumModules,
            generationStyle,
            promptVersion,
          }),
        }
      );
      const responseData = (await response.json().catch(() => null)) as
        | GenerateSelectedTrainingsResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          getReadableErrorMessage(
            responseData,
            "Unable to generate selected trainings."
          )
        );
      }

      const selectedResponse = responseData as GenerateSelectedTrainingsResponse;
      setImportJob(selectedResponse.job);
      updateExistingImportJob(selectedResponse.job);
      setCreatedCurriculumModules(selectedResponse.modules);
      updateGeneratedModuleSummaries(
        selectedResponse.modules.map((module) => ({
          id: module.id,
          title: module.title,
          status: "draft",
        }))
      );
      setSaveStatus("success");
      setSaveMessage(
        `${selectedResponse.modules.length} draft training module${
          selectedResponse.modules.length === 1 ? "" : "s"
        } created.`
      );
    } catch (error) {
      setSaveStatus("error");
      setSaveMessage(
        error instanceof Error
          ? error.message
          : "Unable to generate selected trainings."
      );
    } finally {
      window.clearInterval(progressTimer);
      setGenerationStepIndex(selectedTrainingGenerationSteps.length - 1);
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
      updateExistingImportJob(saveResponse.job);
      if (generatedDraft?.module.title) {
        updateGeneratedModuleSummaries([
          {
            id: saveResponse.moduleId,
            title: generatedDraft.module.title,
            status: "draft",
          },
        ]);
      }
      setSaveStatus("success");
      router.push(`/training/new?id=${encodeURIComponent(saveResponse.moduleId)}`);
    } catch (error) {
      setSaveStatus("error");
      setSaveMessage(
        error instanceof Error ? error.message : "Unable to save the training draft."
      );
    }
  }

  async function handleDeleteImport(job: TrainingImportJob) {
    if (job.created_module_id || job.status === "modules_created") return;

    const confirmed = window.confirm(
      `Delete ${job.file_name}? This removes the import job and uploaded source file.`
    );

    if (!confirmed) return;

    setImportsMessage("");

    try {
      const token = await getAccessToken();
      const response = await fetch(
        `/api/training/imports/${encodeURIComponent(job.id)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const responseData = (await response.json().catch(() => null)) as
        | { success?: boolean }
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          getReadableErrorMessage(responseData, "Unable to delete the import job.")
        );
      }

      setExistingImports((currentJobs) =>
        currentJobs.filter((currentJob) => currentJob.id !== job.id)
      );

      if (importJob?.id === job.id) {
        setImportJob(null);
      }

      setImportsStatus("success");
      setImportsMessage("Import job deleted.");
    } catch (error) {
      setImportsStatus("error");
      setImportsMessage(
        error instanceof Error ? error.message : "Unable to delete the import job."
      );
    }
  }

  async function handleManualPasteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!importJob) return;

    setManualPasteStatus("uploading");
    setManualPasteMessage("");

    try {
      const token = await getAccessToken();
      const updatedJob = await saveManualPastedText(
        importJob.id,
        manualPasteText,
        token
      );

      setImportJob(updatedJob);
      updateExistingImportJob(updatedJob);
      setManualPasteText("");
      setManualPasteStatus("success");
      setManualPasteMessage("Pasted text saved. You can generate training now.");
      setUploadState("success");
      setMessage("");
    } catch (error) {
      setManualPasteStatus("error");
      setManualPasteMessage(
        error instanceof Error
          ? error.message
          : "Unable to save pasted document text."
      );
    }
  }

  const isUploading = uploadState === "uploading";
  const isGenerating = generationStatus === "uploading";
  const isSaving = saveStatus === "uploading";
  const isManualPasteSaving = manualPasteStatus === "uploading";
  const extractedTextPreview = getTextPreview(importJob?.raw_text ?? null);
  const characterCount = importJob?.raw_text?.length ?? 0;
  const extractionConfidence = importJob
    ? formatConfidence(importJob.extraction_confidence)
    : null;
  const generatedDraft = useMemo<GeneratedTrainingDraft | null>(
    () => normalizeGeneratedTrainingDraft(importJob?.generated_json ?? null),
    [importJob?.generated_json]
  );
  const generatedDraftMetadata = useMemo(
    () => getGeneratedTrainingDraftMetadata(importJob?.generated_json ?? null),
    [importJob?.generated_json]
  );
  const generatedCurriculumRecord = useMemo(
    () => getGeneratedCurriculumRecord(importJob?.generated_json ?? null),
    [importJob?.generated_json]
  );
  const statusOptions = useMemo(
    () =>
      Array.from(new Set(existingImports.map((job) => job.status)))
        .filter(Boolean)
        .sort(),
    [existingImports]
  );
  const filteredImports = useMemo(() => {
    const searchTerm = importSearch.trim().toLowerCase();

    return existingImports.filter((job) => {
      const matchesSearch =
        !searchTerm || job.file_name.toLowerCase().includes(searchTerm);
      const matchesStatus = statusFilter === "all" || job.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [existingImports, importSearch, statusFilter]);
  const selectedDuplicateImport = getLikelyDuplicateImport(
    selectedFile,
    selectedFileHash,
    existingImports
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
                Upload New Document
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
              <div className="space-y-3">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span>
                    {uploadProgress < 100
                      ? "Uploading document..."
                      : "Preparing extracted text..."}
                  </span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-[var(--company-secondary)] transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {extractionStageLabels.map((stage) => (
                    <div
                      key={stage}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                    >
                      {stage}
                    </div>
                  ))}
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

            {duplicateWarning && selectedDuplicateImport && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                <p className="font-semibold">{duplicateWarning}</p>
                <p className="mt-1">
                  Existing import: {selectedDuplicateImport.file_name} from{" "}
                  {formatDateTime(selectedDuplicateImport.created_at)}.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => selectImportJob(selectedDuplicateImport)}
                    className="rounded-lg border border-yellow-300 bg-white px-3 py-2 text-xs font-semibold text-yellow-900 hover:bg-yellow-100"
                  >
                    Use Existing Import
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAllowDuplicateUpload(true);
                      setDuplicateWarning("");
                    }}
                    className="rounded-lg bg-yellow-700 px-3 py-2 text-xs font-semibold text-white hover:bg-yellow-800"
                  >
                    Upload Anyway
                  </button>
                </div>
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
          <h2 className="text-lg font-bold text-slate-900">Selected Import Job</h2>
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
                  Extraction
                </dt>
                <dd className="mt-1 space-y-2 text-sm font-semibold text-slate-900">
                  <p>{getExtractionMethodLabel(importJob)}</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {typeof importJob.page_count === "number" && (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
                        {importJob.page_count.toLocaleString()} pages
                      </span>
                    )}
                    {extractionConfidence && (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
                        {extractionConfidence} confidence
                      </span>
                    )}
                    {hasLowExtractionConfidence(importJob) && (
                      <span className="rounded-full bg-yellow-100 px-2.5 py-1 font-semibold text-yellow-800">
                        Low confidence
                      </span>
                    )}
                  </div>
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
              {importJob.status === "failed" && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Paste Text Instead
                  </dt>
                  <dd className="mt-2">
                    <form onSubmit={handleManualPasteSubmit} className="space-y-3">
                      <textarea
                        value={manualPasteText}
                        onChange={(event) => setManualPasteText(event.target.value)}
                        rows={6}
                        placeholder="Paste the source document text here."
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
                      />
                      <button
                        type="submit"
                        disabled={isManualPasteSaving}
                        className="company-primary-button rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isManualPasteSaving ? "Saving..." : "Save Pasted Text"}
                      </button>
                      {manualPasteMessage && (
                        <p
                          className={`text-sm font-medium ${
                            manualPasteStatus === "error"
                              ? "text-red-700"
                              : "text-green-700"
                          }`}
                        >
                          {manualPasteMessage}
                        </p>
                      )}
                    </form>
                  </dd>
                </div>
              )}
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

      <section className="mt-6 rounded-xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Training Document Library
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Reuse company source documents and extracted text for future training drafts.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="text-sm font-semibold text-slate-700">
              Search
              <input
                value={importSearch}
                onChange={(event) => setImportSearch(event.target.value)}
                placeholder="File name"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 shadow-sm sm:w-56"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm sm:w-44"
              >
                <option value="all">All</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={loadExistingImportJobs}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {importsMessage && (
          <div
            className={`mt-5 rounded-lg border px-4 py-3 text-sm font-medium ${
              importsStatus === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-green-200 bg-green-50 text-green-700"
            }`}
          >
            {importsMessage}
          </div>
        )}

        {importsStatus === "uploading" && existingImports.length === 0 ? (
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Loading imported documents...
          </div>
        ) : filteredImports.length === 0 ? (
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            No training documents have been imported yet.
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Document</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Extracted Text</th>
                    <th className="px-4 py-3">AI Metadata</th>
                    <th className="px-4 py-3">Generated Training</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredImports.map((job) => {
                    const metadata = getGeneratedTrainingDraftMetadata(job.generated_json);
                    const curriculumMetadata = getGeneratedCurriculumRecord(
                      job.generated_json
                    );
                    const canGenerate = job.status === "text_ready";
                    const canReview = job.status === "draft_ready";
                    const canReviewCurriculum =
                      job.status === "curriculum_ready" ||
                      job.status === "modules_created";
                    const canRegenerate = Boolean(job.generated_json && job.raw_text);
                    const characterCount = job.raw_text?.length ?? 0;
                    const createdModuleIds = getCreatedModuleIds(job);

                    return (
                      <tr key={job.id} className="align-top">
                        <td className="px-4 py-4">
                          <p className="max-w-xs break-words font-semibold text-slate-900">
                            {job.file_name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {job.file_type.toUpperCase()} · {formatDateTime(job.created_at)}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(
                              job.status
                            )}`}
                          >
                            {formatStatus(job.status)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          <div className="space-y-1">
                            <p>
                              {characterCount > 0
                                ? `${characterCount.toLocaleString()} chars`
                                : "No text"}
                            </p>
                            <p className="text-xs">{getExtractionMethodLabel(job)}</p>
                            <div className="flex flex-wrap gap-1">
                              {typeof job.page_count === "number" && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                                  {job.page_count.toLocaleString()} pages
                                </span>
                              )}
                              {formatConfidence(job.extraction_confidence) && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                                  {formatConfidence(job.extraction_confidence)} confidence
                                </span>
                              )}
                              {hasLowExtractionConfidence(job) && (
                                <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800">
                                  Low confidence
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          {curriculumMetadata ? (
                            <div className="space-y-1 text-xs">
                              <p>curriculumBuilder {curriculumMetadata.prompt_version || "v1"}</p>
                              <p>
                                {curriculumMetadata.curriculum.recommended_modules.length} modules
                              </p>
                              {curriculumMetadata.model && <p>{curriculumMetadata.model}</p>}
                              {curriculumMetadata.generated_at && (
                                <p>{formatDateTime(curriculumMetadata.generated_at)}</p>
                              )}
                            </div>
                          ) : metadata ? (
                            <div className="space-y-1 text-xs">
                              <p>Prompt {metadata.prompt_version || "unknown"}</p>
                              <p>{formatStatus(metadata.generation_style || "standard")}</p>
                              {metadata.model && <p>{metadata.model}</p>}
                              {metadata.generated_at && (
                                <p>{formatDateTime(metadata.generated_at)}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">None</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {createdModuleIds.length > 0 ? (
                            <GeneratedModuleLinks
                              moduleIds={createdModuleIds}
                              moduleMap={generatedModuleMap}
                            />
                          ) : (
                            <span className="text-xs text-slate-400">Not created</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => selectImportJob(job)}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              View Extracted Text
                            </button>
                            {canGenerate && (
                              <button
                                type="button"
                                disabled={isGenerating}
                                onClick={() => handleGenerateTraining(job)}
                                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Generate Training
                              </button>
                            )}
                            {canGenerate && (
                              <button
                                type="button"
                                disabled={isGenerating}
                                onClick={() => handleDetectCurriculum(job)}
                                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Build Library
                              </button>
                            )}
                            {canReview && (
                              <button
                                type="button"
                                onClick={() => selectImportJob(job)}
                                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                Review AI Draft
                              </button>
                            )}
                            {canReviewCurriculum && (
                              <button
                                type="button"
                                onClick={() => selectImportJob(job)}
                                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                Review Curriculum
                              </button>
                            )}
                            {canRegenerate && (
                              <button
                                type="button"
                                disabled={isGenerating}
                                onClick={() =>
                                  curriculumMetadata
                                    ? handleDetectCurriculum(job)
                                    : handleGenerateTraining(job)
                                }
                                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Regenerate
                              </button>
                            )}
                            {!job.created_module_id &&
                              job.status !== "modules_created" &&
                              !curriculumMetadata?.created_module_ids?.length && (
                              <button
                                type="button"
                                onClick={() => handleDeleteImport(job)}
                                className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {importJob?.status === "text_ready" && (
        <section className="mt-6 rounded-xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Generate from Import
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Choose whether to create one training or detect a training library.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="min-w-56 text-sm font-semibold text-slate-700">
                Import Mode
                <select
                  value={importMode}
                  disabled={isGenerating}
                  onChange={(event) => setImportMode(event.target.value as ImportMode)}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="single">Single Training</option>
                  <option value="library">Build Training Library</option>
                </select>
              </label>
              <label className="min-w-56 text-sm font-semibold text-slate-700">
                Generation Style
                <select
                  value={generationStyle}
                  disabled={isGenerating}
                  onChange={(event) =>
                    setGenerationStyle(event.target.value as GenerationStyle)
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generationStyleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {importMode === "single" && (
                <label className="min-w-36 text-sm font-semibold text-slate-700">
                  Prompt Version
                  <select
                    value={promptVersion}
                    disabled={isGenerating}
                    onChange={(event) =>
                      setPromptVersion(event.target.value as PromptVersion)
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {promptVersionOptions.map((version) => (
                      <option key={version} value={version}>
                        {version}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                disabled={isGenerating}
                onClick={() =>
                  importMode === "single"
                    ? handleGenerateTraining()
                    : handleDetectCurriculum()
                }
                className="company-primary-button rounded-lg px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGenerating
                  ? importMode === "single"
                    ? "Generating..."
                    : "Analyzing..."
                  : importMode === "single"
                    ? "Generate Training with AI"
                    : "Build Training Library"}
              </button>
            </div>
          </div>

          {isGenerating && (
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                {generationStepLabels[generationStepIndex]}
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-[var(--company-secondary)] transition-all"
                  style={{
                    width: `${((generationStepIndex + 1) / generationStepLabels.length) * 100}%`,
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

      {(importJob?.status === "curriculum_ready" ||
        importJob?.status === "modules_created") &&
        generatedCurriculumRecord && (
          <section className="mt-6 rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  AI Curriculum Review
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Review suggested modules before generating draft trainings.
                </p>
                <p className="mt-2 text-xs font-semibold text-slate-400">
                  Generated with curriculumBuilder{" "}
                  {generatedCurriculumRecord.prompt_version || "v1"}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  disabled={isGenerating || isSaving}
                  onClick={() => handleDetectCurriculum()}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Regenerate Curriculum
                </button>
                <button
                  type="button"
                  disabled={
                    isGenerating || isSaving || selectedCurriculumModules.length === 0
                  }
                  onClick={handleGenerateSelectedTrainings}
                  className="company-primary-button rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Generating..." : "Generate Selected Trainings"}
                </button>
                <a
                  href="/training"
                  className="rounded-lg border border-slate-300 px-4 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </a>
              </div>
            </div>

            {generationMessage && (
              <div
                className={`mb-6 rounded-lg border px-4 py-3 text-sm font-medium ${
                  generationStatus === "error"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-green-200 bg-green-50 text-green-700"
                }`}
              >
                {generationMessage}
              </div>
            )}

            {saveMessage && (
              <div
                className={`mb-6 rounded-lg border px-4 py-3 text-sm font-medium ${
                  saveStatus === "success"
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {saveMessage}
                {createdCurriculumModules.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {createdCurriculumModules.map((module) => (
                      <a
                        key={module.id}
                        href={`/training/new?id=${encodeURIComponent(module.id)}`}
                        className="rounded-lg border border-green-300 bg-white px-3 py-2 text-xs font-semibold text-green-800 hover:bg-green-50"
                      >
                        Open {module.title}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {isSaving && (
              <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  {generationStepLabels[generationStepIndex]}
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-[var(--company-secondary)] transition-all"
                    style={{
                      width: `${((generationStepIndex + 1) / generationStepLabels.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Curriculum Title
                </p>
                <p className="mt-2 text-lg font-bold text-slate-900">
                  {generatedCurriculumRecord.curriculum.curriculum_title}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Recommended Modules
                </p>
                <p className="mt-2 text-lg font-bold text-slate-900">
                  {generatedCurriculumRecord.curriculum.recommended_modules.length}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Selected
                </p>
                <p className="mt-2 text-lg font-bold text-slate-900">
                  {selectedCurriculumModules.length}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Description
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {generatedCurriculumRecord.curriculum.description}
              </p>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {generatedCurriculumRecord.curriculum.recommended_modules.map((module) => {
                const isSelected = selectedCurriculumModules.includes(
                  module.module_order
                );

                return (
                  <article
                    key={module.module_order}
                    className={`rounded-lg border p-4 ${
                      isSelected
                        ? "border-slate-900 bg-white"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isSaving}
                        onChange={() => toggleCurriculumModule(module.module_order)}
                        className="mt-1 h-4 w-4 rounded border-slate-300"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-slate-900">
                          {module.module_order}. {module.title}
                        </span>
                        <span className="mt-2 block text-sm leading-6 text-slate-600">
                          {module.description}
                        </span>
                      </span>
                    </label>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Category
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">
                          {module.category}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Audience
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">
                          {module.recommended_audience}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Estimated Time
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">
                          {module.estimated_minutes} min
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Suggested Contents
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">
                          {module.suggested_slide_count} slides,{" "}
                          {module.suggested_quiz_question_count} quiz questions
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Why Separate
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {module.why_this_should_be_separate}
                      </p>
                    </div>
                    <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Source Topic Summary
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {module.source_topic_summary}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
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
              {generatedDraftMetadata?.prompt_version && (
                <p className="mt-2 text-xs font-semibold text-slate-400">
                  Generated with restaurantTraining {generatedDraftMetadata.prompt_version}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                disabled={isGenerating || isSaving}
                onClick={() => handleGenerateTraining()}
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
                {generationStepLabels[generationStepIndex]}
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
                {generatedDraft.slides.length} blocks, {generatedDraft.quiz.length} quiz questions
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

          {generatedDraft.learning_objectives.length > 0 && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Learning Objectives
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
                {generatedDraft.learning_objectives.map((objective, index) => (
                  <li key={`${objective}-${index}`}>{objective}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Learning Blocks
              </h3>
              <div className="mt-3 space-y-3">
                {generatedDraft.slides.map((slide) => (
                  <article
                    key={slide.slide_order}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {formatSlideType(slide.slide_type)}
                      </span>
                      {slide.slide_type === "image_hotspot" &&
                        getDraftConfig(slide).requiresAdminSetup === true && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                            Admin setup required
                          </span>
                        )}
                    </div>
                    <p className="text-sm font-bold text-slate-900">
                      {slide.slide_order}. {slide.title}
                    </p>
                    <div className="mt-2 line-clamp-4">
                      <LessonContent
                        content={slide.body}
                        className="space-y-2 text-sm leading-6 text-slate-600"
                        emptyClassName="text-sm text-slate-500"
                        headingClassName="text-sm font-bold leading-6 text-slate-900"
                      />
                    </div>
                    {renderGeneratedBlockPreview(slide)}
                    {slide.coach_note && (
                      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Coach Note
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {slide.coach_note}
                        </p>
                      </div>
                    )}
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
