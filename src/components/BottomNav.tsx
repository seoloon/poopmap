"use client";

export type NavTab = "map" | "profile" | "leaderboard" | "games";

const LEFT_TABS: { tab: NavTab; emoji: string; label: string }[] = [
  { tab: "map", emoji: "🗺️", label: "Carte" },
  { tab: "profile", emoji: "👤", label: "Profil" },
];

const RIGHT_TABS: { tab: NavTab; emoji: string; label: string }[] = [
  { tab: "leaderboard", emoji: "🏆", label: "Classement" },
  { tab: "games", emoji: "🎮", label: "Jeux" },
];

/**
 * Fixed bottom tab bar — the app's primary navigation on mobile. The center "+" tab
 * is a one-shot action (opens the add-toilet modal), not a persisted tab, so it never
 * renders as active. Tabs sit Carte, Profil, +, Classement, Jeux — left/right of the
 * add button, in that fixed order.
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
  const renderTab = ({ tab, emoji, label }: { tab: NavTab; emoji: string; label: string }) => (
    <button
      key={tab}
      onClick={() => onNavigate(tab)}
      className={`flex flex-col items-center gap-0.5 rounded-3xl px-3 py-2 transition ${
        active === tab ? "bg-teal text-white" : "hover:bg-blush"
      }`}
      aria-label={label}
      aria-current={active === tab}
    >
      <span className="text-lg leading-none" aria-hidden>
        {emoji}
      </span>
      <span className="text-[10px] font-extrabold leading-none">{label}</span>
    </button>
  );

  return (
    <nav
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[1100] flex justify-center px-3 pb-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="sticker pointer-events-auto flex items-center gap-1 rounded-[28px] p-1.5">
        {LEFT_TABS.map(renderTab)}

        <button
          onClick={onAdd}
          className="group mx-1 grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-ink bg-signage shadow-[3px_3px_0_#1a1a1a] transition hover:-translate-y-1"
          aria-label="Un petit coin"
        >
          <span className="font-display text-2xl font-extrabold leading-none transition group-hover:rotate-90">+</span>
        </button>

        {RIGHT_TABS.map(renderTab)}
      </div>
    </nav>
  );
}
