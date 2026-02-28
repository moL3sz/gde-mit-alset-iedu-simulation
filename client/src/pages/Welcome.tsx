

import { Button } from "primereact/button";
import { useNavigate } from "react-router-dom";

export const Welcome = () => {
  const navigate = useNavigate();
  const laraPrimary = "var(--primary-color, #6366f1)";
  const laraPrimaryDark = "var(--primary-600, #4f46e5)";
  const laraPrimarySoft = "var(--primary-300, #a5b4fc)";
  const laraSurface = "var(--surface-card, #ffffff)";
  const laraText = "var(--text-color, #1f2937)";
  const laraTextMuted = "var(--text-color-secondary, #64748b)";

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden px-6 py-10 sm:py-14">
      <style>
        {`
          @keyframes welcomeSkyShift {
            0% { background-position: 0% 40%; }
            50% { background-position: 100% 60%; }
            100% { background-position: 0% 40%; }
          }
          @keyframes welcomeBlobFloatA {
            0% { transform: translate3d(-8%, 0%, 0) rotate(-4deg) scale(1.02); }
            50% { transform: translate3d(7%, -4%, 0) rotate(4deg) scale(1.1); }
            100% { transform: translate3d(-8%, 0%, 0) rotate(-4deg) scale(1.02); }
          }
          @keyframes welcomeBlobFloatB {
            0% { transform: translate3d(8%, 0%, 0) rotate(4deg) scale(1.03); }
            50% { transform: translate3d(-8%, 4%, 0) rotate(-4deg) scale(1.12); }
            100% { transform: translate3d(8%, 0%, 0) rotate(4deg) scale(1.03); }
          }
          @keyframes welcomeWaveDrift {
            0% { transform: translate3d(-4%, 2%, 0); }
            50% { transform: translate3d(4%, -2%, 0); }
            100% { transform: translate3d(-4%, 2%, 0); }
          }
        `}
      </style>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(122deg, #4f46e5 0%, #6366f1 18%, #818cf8 36%, #60a5fa 54%, #38bdf8 72%, #6366f1 100%)",
          backgroundSize: "230% 230%",
          animation: "welcomeSkyShift 14s ease-in-out infinite",
        }}
      />
      <div
        className="pointer-events-none absolute -left-[20%] -top-[26%] h-[60%] w-[120%] rounded-[100%] blur-3xl"
        style={{
          background: "radial-gradient(circle, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 70%)",
          animation: "welcomeBlobFloatA 16s ease-in-out infinite",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-[32%] -right-[18%] h-[72%] w-[130%] rounded-[100%] blur-3xl"
        style={{
          background: "radial-gradient(circle, rgba(79,70,229,0.28) 0%, rgba(79,70,229,0) 75%)",
          animation: "welcomeBlobFloatB 18s ease-in-out infinite",
        }}
      />

      <main className="relative z-10 flex flex-1 items-center justify-center">
        <section
          className="w-full max-w-6xl overflow-hidden rounded-2xl p-6 shadow-[0_24px_64px_rgba(30,41,59,0.35)] sm:p-10"
          style={{
            background: laraSurface,
            fontFamily: "'Avenir Next', 'Segoe UI', 'Trebuchet MS', sans-serif",
          }}
        >
          <div className="grid gap-8 lg:grid-cols-[1.02fr_1fr] lg:gap-10">
            <div className="relative z-10 flex flex-col justify-center pt-2 sm:pt-4">
              <div
                className="mb-7 inline-flex h-14 w-14 items-center justify-center rounded-lg text-white"
                style={{
                  background: `linear-gradient(135deg, ${laraPrimaryDark}, ${laraPrimary})`,
                  boxShadow: "0 12px 28px rgba(79,70,229,0.32)",
                }}
              >
                <span className="text-xl font-black tracking-wider">IE</span>
              </div>

              <h1
                className="max-w-xl text-4xl font-black uppercase leading-[1.02] tracking-[0.08em] sm:text-5xl"
                style={{ color: laraText }}
              >
                Interactive
                <br />
                Classroom
                <br />
                Simulation
              </h1>
              <p
                className="mt-5 max-w-lg text-sm leading-7 sm:text-base"
                style={{ color: laraTextMuted }}
              >
                Build realistic multi-agent lessons, configure student profiles, then run
                supervised or unsupervised sessions with real-time graph feedback.
              </p>

              <div className="mt-9">
                <Button
                  label="Start Setup"
                  icon="pi pi-arrow-right"
                  iconPos="right"
                  onClick={() => navigate("/students")}
                />
              </div>
            </div>

            <div className="relative min-h-[320px] sm:min-h-[380px]">
              <div
                className="absolute -bottom-[35%] left-[5%] h-[90%] w-[125%] rounded-[58%] opacity-90"
                style={{
                  background: `linear-gradient(118deg, ${laraPrimarySoft} 0%, ${laraPrimary} 56%, ${laraPrimaryDark} 100%)`,
                  animation: "welcomeWaveDrift 11s ease-in-out infinite",
                }}
              >
              </div>
              <div
                className="absolute -bottom-[48%] left-[-6%] h-[82%] w-[118%] rounded-[56%] opacity-85"
                style={{
                  background:
                    "linear-gradient(120deg, rgba(96,165,250,0.86) 0%, rgba(99,102,241,0.78) 46%, rgba(79,70,229,0.84) 100%)",
                  animation: "welcomeWaveDrift 14s ease-in-out infinite reverse",
                }}
              >
              </div>

              <div className="absolute right-[14%] top-[14%] flex flex-col gap-4">
                <div
                  className="h-16 w-16 rounded-full text-center text-lg font-bold leading-[64px] text-white"
                  style={{ background: laraPrimaryDark }}
                  title="Teacher Agent"
                >
                  TA
                </div>
                <div
                  className="ml-14 h-14 w-14 rounded-full text-center text-sm font-bold leading-[56px] text-white"
                  style={{ background: laraPrimary }}
                  title="Student 1"
                >
                  S1
                </div>
                <div
                  className="ml-2 h-14 w-14 rounded-full text-center text-sm font-bold leading-[56px] text-white"
                  style={{ background: "#38bdf8" }}
                  title="Student 2"
                >
                  S2
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 pb-1 pt-4 text-center text-white/95">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/80">Developers</p>
        <p className="mt-2 text-sm font-medium">Angyal Sándor, Fekete Adrián, Molnár Kristóf, Molnár Bálint</p>
        <p className="mt-3 text-xs font-black uppercase tracking-[0.34em] text-white/90">ALSET</p>
      </footer>
    </div>
  );
};
