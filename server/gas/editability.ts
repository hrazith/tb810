export function gasReadingMutationKind(readingId: string | null) {
  return readingId ? "update" : "create";
}

export function shouldSubmitGasReading(
  committed: { currentReading: string; readingDate: string },
  current: { currentReading: string; readingDate: string },
  pending: boolean,
) {
  return !pending && (
    committed.currentReading !== current.currentReading ||
    committed.readingDate !== current.readingDate
  );
}

export type GasReadingDraft = {
  currentReading: string;
  readingDate: string;
};

export type GasReadingCanonical = {
  readingId: string | null;
  currentReading: number | null;
  readingDate: string | null;
};

export function gasReadingDraftFromCanonical(row: GasReadingCanonical): GasReadingDraft {
  return {
    currentReading: row.currentReading == null ? "" : String(row.currentReading),
    readingDate: row.readingDate ?? "",
  };
}

export function reconcileGasReadingDraft(
  previous: GasReadingCanonical,
  next: GasReadingCanonical,
  draft: GasReadingDraft,
): GasReadingDraft {
  const previousDraft = gasReadingDraftFromCanonical(previous);
  const nextDraft = gasReadingDraftFromCanonical(next);
  const canonicalChanged = previous.readingId !== next.readingId
    || previous.currentReading !== next.currentReading
    || previous.readingDate !== next.readingDate;

  if (!canonicalChanged || draft.currentReading !== previousDraft.currentReading || draft.readingDate !== previousDraft.readingDate) {
    return draft;
  }

  return nextDraft;
}
