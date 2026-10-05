-- The legacy wrapper predates Gas bill reservation at handoff. The canonical
-- K6 wrapper with the Gas bill set is the only operational handoff boundary.
drop function public.tb810_mark_monthly_obligation_ready_for_review(uuid, integer, integer);
