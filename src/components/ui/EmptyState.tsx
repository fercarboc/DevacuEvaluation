import React from "react";

export default function EmptyState({
  title,
  description,
  ctaLabel,
  onCta,
}: {
  title: string;
  description: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
        {description}
      </div>
      {ctaLabel && onCta && (
        <button
          onClick={onCta}
          className="mt-5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}
