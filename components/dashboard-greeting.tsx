"use client";

function greetingPeriod(hour: number) {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

export function DashboardGreeting({ firstName }: { firstName: string }) {
  const period = greetingPeriod(new Date().getHours());

  return (
    <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl" aria-live="polite" suppressHydrationWarning>
      {`Good ${period}, ${firstName}.`}
    </h1>
  );
}
