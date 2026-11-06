-- The report needs to resolve collector names across team profiles. The
-- function itself checks owner/manager membership before reading any gym data.
alter function public.report_overview(uuid, date, date) security definer;
