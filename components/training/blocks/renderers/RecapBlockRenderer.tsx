import type { RecapBlockConfig } from "@/types/learningBlocks";
import { CheckCircle2 } from "lucide-react";

type Props = {
  title: string;
  config: RecapBlockConfig;
};

export default function RecapBlockRenderer({ title, config }: Props) {
  const items = config.items.filter((item) => item.trim());

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-green-700">
          Recap
        </p>
        <h1 className="mt-1 text-3xl font-bold leading-tight text-slate-900">
          {title || "Recap"}
        </h1>
      </div>

      <div className="rounded-xl border border-green-200 bg-green-50 p-5">
        <div className="space-y-3">
          {(items.length > 0 ? items : ["Add a takeaway."]).map((item, index) => (
            <div key={`${item}-${index}`} className="flex gap-3">
              <CheckCircle2
                size={20}
                strokeWidth={2.4}
                className="mt-0.5 shrink-0 text-green-700"
                aria-hidden="true"
              />
              <p className="text-base font-semibold leading-7 text-slate-900">
                {item}
              </p>
            </div>
          ))}
        </div>

        {config.closingMessage && (
          <p className="mt-5 border-t border-green-200 pt-4 text-sm font-semibold leading-6 text-green-900">
            {config.closingMessage}
          </p>
        )}
      </div>
    </div>
  );
}
