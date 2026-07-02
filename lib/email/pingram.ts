import "server-only";

import { Pingram } from "pingram";

type TrainingCompletionEmailParams = {
  recipients: string[];
  company: {
    name: string;
    logo_url: string | null;
  } | null;
  employeeName: string;
  employeeNumber: string;
  locationName: string;
  trainingTitle: string;
  latestScore: number | null;
  completedAt: string | null;
  trainingUrl: string;
};

type SendTrainingCompletionEmailResult =
  | {
      sent: true;
      skipped: false;
      recipientCount: number;
      failedRecipients: string[];
      reason: null;
    }
  | {
      sent: false;
      skipped: true;
      recipientCount: number;
      failedRecipients: string[];
      reason: "no_recipients" | "not_configured";
    }
  | {
      sent: false;
      skipped: false;
      recipientCount: number;
      failedRecipients: string[];
      reason: "send_failed";
    };

function normalizeEnvValue(value: string | undefined) {
  return value?.trim().replace(/^['"]|['"]$/g, "");
}

function getPingramConfig() {
  return {
    apiKey: normalizeEnvValue(process.env.PINGRAM_API_KEY),
    fromEmail: normalizeEnvValue(process.env.PINGRAM_FROM_EMAIL),
  };
}

export function isPingramEmailConfigured() {
  const { apiKey, fromEmail } = getPingramConfig();

  return Boolean(apiKey && fromEmail);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatScore(score: number | null) {
  return score === null ? "N/A" : `${score}%`;
}

function formatCompletionDate(value: string | null) {
  if (!value) return "N/A";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

function getAppUrl() {
  const appUrl = normalizeEnvValue(process.env.NEXT_PUBLIC_APP_URL);

  return appUrl?.replace(/\/+$/, "") || "";
}

function normalizeRecipients(recipients: string[]) {
  const byEmail = new Map<string, string>();

  for (const email of recipients) {
    const trimmed = email.trim();
    if (!trimmed) continue;
    byEmail.set(trimmed.toLowerCase(), trimmed);
  }

  return [...byEmail.values()];
}

function buildTrainingUrl(trainingUrl: string) {
  if (/^https?:\/\//i.test(trainingUrl)) return trainingUrl;

  const appUrl = getAppUrl();
  if (!appUrl) return trainingUrl || "/";

  return `${appUrl}${trainingUrl.startsWith("/") ? "" : "/"}${trainingUrl}`;
}

function buildTrainingCompletionEmail({
  company,
  employeeName,
  employeeNumber,
  locationName,
  trainingTitle,
  latestScore,
  completedAt,
  trainingUrl,
}: TrainingCompletionEmailParams) {
  const companyName = company?.name?.trim() || "Company";
  const subject = `Training Completed: ${employeeName} - ${trainingTitle}`;
  const rows = [
    ["Employee Name", employeeName],
    ["Employee Number", employeeNumber],
    ["Location/Store", locationName],
    ["Training Title", trainingTitle],
    ["Latest Score", formatScore(latestScore)],
    ["Completion Date", formatCompletionDate(completedAt)],
  ];
  const absoluteTrainingUrl = buildTrainingUrl(trainingUrl);
  const logoHtml = company?.logo_url
    ? `<img src="${escapeHtml(company.logo_url)}" alt="${escapeHtml(
        companyName
      )}" width="140" style="display:block;max-width:140px;height:auto;margin:0 0 16px 0;">`
    : "";

  const html = `
    <div style="margin:0;padding:0;background:#ffffff;color:#111827;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;">
      <div style="max-width:640px;margin:0 auto;padding:24px;">
        ${logoHtml}
        <h1 style="margin:0 0 8px 0;font-size:22px;line-height:1.25;color:#111827;">Training completed</h1>
        <p style="margin:0 0 20px 0;color:#374151;">${escapeHtml(
          employeeName
        )} completed and passed a training assignment.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 24px 0;">
          <tbody>
            ${rows
              .map(
                ([label, value]) => `
                  <tr>
                    <th align="left" style="border-top:1px solid #e5e7eb;padding:10px 12px 10px 0;color:#374151;font-weight:bold;width:42%;">${escapeHtml(
                      label
                    )}</th>
                    <td style="border-top:1px solid #e5e7eb;padding:10px 0;color:#111827;">${escapeHtml(
                      value
                    )}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
        <p style="margin:0 0 24px 0;">
          <a href="${escapeHtml(
            absoluteTrainingUrl
          )}" style="color:#2563eb;text-decoration:underline;">View training in the app</a>
        </p>
        <p style="margin:0;color:#6b7280;font-size:13px;">${escapeHtml(
          companyName
        )} Training</p>
      </div>
    </div>
  `;

  return {
    subject,
    html,
    senderName: `${companyName} Training`,
    previewText: `${employeeName} completed ${trainingTitle}.`,
  };
}

export async function sendTrainingCompletionEmail(
  params: TrainingCompletionEmailParams
): Promise<SendTrainingCompletionEmailResult> {
  const recipients = normalizeRecipients(params.recipients);

  if (recipients.length === 0) {
    return {
      sent: false,
      skipped: true,
      recipientCount: 0,
      failedRecipients: [],
      reason: "no_recipients",
    };
  }

  const { apiKey, fromEmail } = getPingramConfig();

  if (!apiKey || !fromEmail) {
    console.warn(
      "[email] Training completion email skipped; PINGRAM_API_KEY or PINGRAM_FROM_EMAIL is not configured."
    );
    return {
      sent: false,
      skipped: true,
      recipientCount: recipients.length,
      failedRecipients: [],
      reason: "not_configured",
    };
  }

  const pingram = new Pingram({
    apiKey,
    baseUrl: "https://api.pingram.io",
  });
  const email = buildTrainingCompletionEmail(params);
  const failedRecipients: string[] = [];

  for (const recipientEmail of recipients) {
    try {
      await pingram.send({
        type: "training_completed",
        to: { email: recipientEmail },
        email: {
          subject: email.subject,
          html: email.html,
          previewText: email.previewText,
          senderName: email.senderName,
          senderEmail: fromEmail,
        },
      });
    } catch (error) {
      failedRecipients.push(recipientEmail);
      console.error("[email] Training completion email send failed", {
        recipientEmail,
        error,
      });
    }
  }

  if (failedRecipients.length === recipients.length) {
    return {
      sent: false,
      skipped: false,
      recipientCount: recipients.length,
      failedRecipients,
      reason: "send_failed",
    };
  }

  return {
    sent: true,
    skipped: false,
    recipientCount: recipients.length,
    failedRecipients,
    reason: null,
  };
}
