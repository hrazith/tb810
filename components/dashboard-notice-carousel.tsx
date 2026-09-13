"use client";

import Link from "next/link";
import { CaretLeft, CaretRight, Info, Warning } from "@phosphor-icons/react";
import { useState } from "react";

import type { DashboardAttention, DashboardWorthNoting } from "@/server/dashboard";

type AttentionItem = DashboardAttention & { href: string };

type DashboardNoticeCarouselProps = {
  attentions: AttentionItem[];
  worthNoting: DashboardWorthNoting[];
};

function formatMoney(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

function formatMonthLabel(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return monthKey;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export function DashboardNoticeCarousel({ attentions, worthNoting }: DashboardNoticeCarouselProps) {
  const frames = [
    ...(attentions.length > 0 ? [{ kind: "attention" as const, items: attentions }] : []),
    ...(worthNoting.length > 0 ? [{ kind: "worth_noting" as const, items: worthNoting }] : []),
  ];
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const safeFrameIndex = Math.min(activeFrameIndex, Math.max(frames.length - 1, 0));

  if (frames.length === 0) return null;

  const frame = frames[safeFrameIndex];
  const hasMultipleFrames = frames.length > 1;

  return (
    <section className="mt-6 space-y-6" aria-label="Pay attention">
      <div className="flex items-center gap-3 border-b border-zinc-200 pb-3">
        {frame.kind === "attention" ? <Warning size={22} weight="regular" aria-hidden="true" /> : <Info size={22} weight="regular" aria-hidden="true" />}
        <p className="text-lg font-medium text-zinc-950">{frame.kind === "attention" ? "Needs attention" : "Worth noting"}</p>
        {hasMultipleFrames ? (
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous notice"
              disabled={safeFrameIndex === 0}
              onClick={() => setActiveFrameIndex((current) => Math.max(current - 1, 0))}
              className="rounded-full p-2 text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <CaretLeft size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next notice"
              disabled={safeFrameIndex === frames.length - 1}
              onClick={() => setActiveFrameIndex((current) => Math.min(current + 1, frames.length - 1))}
              className="rounded-full p-2 text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <CaretRight size={20} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>

      {frame.kind === "attention" ? (
        <div className="grid gap-14 lg:grid-cols-3">
          {frame.items.map((attention, index) => (
            <Link
              key={`${attention.source}:${attention.happened}:${index}`}
              href={attention.href}
              className="text-lg font-normal leading-snug text-zinc-950 underline decoration-zinc-300 underline-offset-4 transition hover:decoration-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
            >
              {attention.happened}
            </Link>
          ))}
        </div>
      ) : (
        <div className="grid gap-2 lg:grid-cols-3">
          {frame.items.map((item) => (
            <div key={`${item.kind}:${item.unitNumber}:${item.obligationMonth}:${item.reason}:${item.amount}`} className="rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3">
              <p className="text-sm font-medium text-zinc-950">Unit {item.unitNumber} · Unit charge</p>
              <p className="mt-1 text-sm text-zinc-600">{formatMoney(item.amount)} · {formatMonthLabel(item.obligationMonth)} obligations</p>
              <p className="mt-1 text-sm text-zinc-600">{item.reason}</p>
            </div>
          ))}
        </div>
      )}

      {hasMultipleFrames ? (
        <div className="flex justify-center gap-2" aria-label={`Notice ${safeFrameIndex + 1} of ${frames.length}`}>
          {frames.map((_, index) => (
            <span key={index} className={`h-2 w-2 rounded-full ${index === safeFrameIndex ? "bg-zinc-950" : "bg-zinc-300"}`} aria-hidden="true" />
          ))}
        </div>
      ) : null}
    </section>
  );
}
