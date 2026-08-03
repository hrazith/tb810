"use client";

import { useDevTools } from "@/components/dev-tools";

type Props = {
  historicalEditingAvailable: boolean;
  isHistoricalMonth: boolean;
};

export function HistoricalEditingBanner({
  historicalEditingAvailable,
  isHistoricalMonth,
}: Props) {
  const { historicalEditingEnabled } = useDevTools();

  if (!historicalEditingAvailable || !isHistoricalMonth || !historicalEditingEnabled) {
    return null;
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      Historical editing enabled - development only
    </div>
  );
}
