import { Button } from "primereact/button";

export const Unsupervised = () => {
  return (
    <section className="h-full w-full p-2 md:w-1/2 md:p-3">
      <div
        className="flex h-full flex-col rounded-3xl border border-slate-300/70 bg-[#edf0f4] p-4 shadow-[0_18px_35px_rgba(15,23,42,0.12)] sm:p-5"
        style={{ fontFamily: "'Trebuchet MS', Verdana, sans-serif" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-black uppercase tracking-[0.14em] text-slate-700 sm:text-2xl">
            Unsupervised
          </h1>
          <div className="flex items-center gap-2">
            <Button icon="pi pi-chart-bar" rounded severity="secondary" tooltip="Charts" />
            <Button icon="pi pi-sitemap" rounded severity="secondary" tooltip="Graph" />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-400/70 bg-white/70 p-4 text-center">
          <p className="max-w-xs text-sm font-semibold text-slate-600">
            Ez a panel az önálló interakciókhoz lesz használva.
          </p>
        </div>
      </div>
    </section>
  );
};
