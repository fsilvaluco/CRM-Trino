"use client";

export function EventPrintHeader({
  projectName,
  projectAvatarUrl,
  eventName,
  eventDateLabel,
  addressLine,
}: {
  projectName: string | null;
  projectAvatarUrl: string | null;
  eventName: string;
  eventDateLabel: string;
  addressLine?: string | null;
}) {
  return (
    <div data-section="header" className="hidden print:flex items-center gap-3 mb-4 pb-3 border-b border-slate-300">
      {projectAvatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={projectAvatarUrl} alt="" className="h-11 w-11 rounded-full object-cover shrink-0" />
      ) : (
        <div className="h-11 w-11 rounded-full bg-slate-200 flex items-center justify-center text-sm font-semibold text-slate-600 shrink-0">
          {projectName?.[0]?.toUpperCase() ?? "?"}
        </div>
      )}
      <div className="min-w-0">
        {projectName && <p className="text-xs uppercase tracking-wide text-slate-500">{projectName}</p>}
        <p className="text-lg font-bold text-slate-900 leading-tight">{eventName}</p>
        <p className="text-xs text-slate-500">{eventDateLabel}</p>
        {addressLine && <p className="text-xs text-slate-500">{addressLine}</p>}
      </div>
    </div>
  );
}
