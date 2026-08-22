"use client";

export type NavTab = "map" | "profile";

/**
 * Fixed bottom tab bar — the app's primary navigation on mobile. The center "+" tab
 * is a one-shot action (opens the add-toilet modal), not a persisted tab, so it never
 * renders as active.
 */
export default function BottomNav({
  active,
  onNavigate,
  onAdd,
}: {
  active: NavTab;
  onNavigate: (tab: NavTab) => void;
  onAdd: () => void;
}) {
  return (
    <nav
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[1100] flex justify-center px-3 pb-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="sticker pointer-events-auto flex items-center gap-1 rounded-[28px] p-1.5">
        <button
          onClick={() => onNavigate("map")}
          className={`flex flex-col items-center gap-0.5 rounded-3xl px-5 py-2 transition ${
            active === "map" ? "bg-teal text-white" : "hover:bg-blush"
          }`}
          aria-label="Carte"
          aria-current={active === "map"}
        >
          <span className="text-lg leading-none" aria-hidden>
            🗺️
          </span>
          <span className="text-[10px] font-extrabold leading-none">Carte</span>
        </button>

        <button
          onClick={onAdd}
          className="group mx-1 grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-ink bg-signage shadow-[3px_3px_0_#1a1a1a] transition hover:-translate-y-1"
          aria-label="Un petit coin"
        >
          <span className="font-display text-2xl font-extrabold leading-none transition group-hover:rotate-90">+</span>
        </button>

        <button
          onClick={() => onNavigate("profile")}
          className={`flex flex-col items-center gap-0.5 rounded-3xl px-5 py-2 transition ${
            active === "profile" ? "bg-teal text-white" : "hover:bg-blush"
          }`}
          aria-label="Profil"
          aria-current={active === "profile"}
        >
          <span className="text-lg leading-none" aria-hidden>
            👤
          </span>
          <span className="text-[10px] font-extrabold leading-none">Profil</span>
        </button>
      </div>
    </nav>
  );
}
