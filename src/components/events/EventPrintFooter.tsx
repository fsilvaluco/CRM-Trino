"use client";

export function EventPrintFooter() {
  return (
    <div
      data-section="footer"
      className="hidden print:flex items-center gap-2 mt-8 pt-3 border-t border-slate-200 text-slate-400"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-icon.png" alt="" className="h-4 w-4 opacity-60" />
      <p className="text-[10px]">Documento generado por Artist Pro</p>
    </div>
  );
}
