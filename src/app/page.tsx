"use client";

import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import type { FlyTarget } from "@/components/Map";
import Toasts, { toast } from "@/components/Toasts";
import BottomNav, { type NavTab } from "@/components/BottomNav";
import type { SessionUser, ToiletPin } from "@/lib/types";

const CacarteMap = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => <Splash />,
});

// Interaction-gated: nobody sees these on first paint (a marker tap, the "+" button,
// or "Connexion" is required), so keeping them out of the initial bundle — they and
// their shared framer-motion import are only fetched once actually needed — shrinks
// the JS the browser must parse/execute before the map becomes interactive.
const DetailPanel = dynamic(() => import("@/components/DetailPanel"), { ssr: false });
const AddToiletModal = dynamic(() => import("@/components/AddToiletModal"), { ssr: false });
const AuthModal = dynamic(() => import("@/components/AuthModal"), { ssr: false });
// Only ever rendered for a logged-in user (returns null otherwise), so it's just as
// interaction-gated as the modals above from an anonymous visitor's point of view.
const NotificationBell = dynamic(() => import("@/components/NotificationBell"), { ssr: false });
const ProfilePage = dynamic(() => import("@/components/ProfilePage"), { ssr: false });
const UserProfileModal = dynamic(() => import("@/components/UserProfileModal"), { ssr: false });
const LeaderboardPage = dynamic(() => import("@/components/LeaderboardPage"), { ssr: false });
const GamesPage = dynamic(() => import("@/components/GamesPage"), { ssr: false });

const CACHE_KEY = "cacarte_cache_v1";

function Splash() {
  return (
    <div className="grid h-full w-full place-items-center bg-cream">
      <div className="text-center">
        <span className="animate-bounce-poop text-6xl">💩</span>
        <p className="mt-3 font-display text-xl font-extrabold text-ink/70">Dépliage de la carte…</p>
      </div>
    </div>
  );
}

type Filter = "all" | "gratuit" | "payant" | "top";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "gratuit", label: "🆓 Gratuits" },
  { value: "payant", label: "💰 Payants" },
  { value: "top", label: "💩 Bien notés" },
];

function Home() {
  const params = useSearchParams();
  const [toilets, setToilets] = useState<ToiletPin[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [me, setMe] = useState<SessionUser | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [viewedUserId, setViewedUserId] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [showAuth, setShowAuth] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [draftPos, setDraftPos] = useState<{ lat: number; lng: number } | null>(null);
  const [flyTarget, setFlyTarget] = useState<FlyTarget>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [view, setView] = useState<NavTab>("map");
  const versionRef = useRef(-1);

  /** Cheap sync: sends the last known version, server replies 304 if nothing changed. */
  const sync = useCallback(async (force = false) => {
    try {
      const res = await fetch(`/api/toilets${force ? "" : `?v=${versionRef.current}`}`, { cache: "no-store" });
      if (res.status === 304 || !res.ok) return;
      const data = await res.json();
      versionRef.current = data.version;
      setToilets(data.toilets);
      setLoaded(true);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch {
        /* storage full or unavailable — non-fatal */
      }
    } catch {
      /* offline — cached data (if any) stays on screen, we retry next tick */
    }
  }, []);

  // On-launch: paint instantly from the local cache, then refresh from the network.
  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        versionRef.current = data.version;
        setToilets(data.toilets);
        setLoaded(true);
      }
    } catch {
      /* corrupt cache — ignore, network sync will repopulate it */
    }
    void sync(true);
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d.user ?? null))
      .catch(() => {});
  }, [sync]);

  // Warm the lazy modal chunks once the map has had a chance to become interactive,
  // so the first marker tap / "+" / "Connexion" doesn't wait on a network round trip
  // for code that's overwhelmingly likely to be needed in this session anyway.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 2000));
    const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(() => {
      void import("@/components/DetailPanel");
      void import("@/components/AddToiletModal");
      void import("@/components/AuthModal");
      void import("@/components/NotificationBell");
      void import("@/components/ProfilePage");
      void import("@/components/UserProfileModal");
    });
    return () => cancelIdle(id as never);
  }, []);

  useEffect(() => {
    // No point polling a backgrounded tab — pause while hidden, catch up on return.
    let iv: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (iv === null) iv = setInterval(() => void sync(), 20_000);
    };
    const stopPolling = () => {
      if (iv !== null) {
        clearInterval(iv);
        iv = null;
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void sync();
        startPolling();
      } else {
        stopPolling();
      }
    };
    startPolling();
    document.addEventListener("visibilitychange", onVis);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedId(null);
        setShowAdd(false);
        setPlacing(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("keydown", onKey);
    };
  }, [sync]);

  // Deep-link from /admin ("?focus=12"): select + fly to the spot.
  useEffect(() => {
    if (!loaded) return;
    const focusId = Number(params.get("focus"));
    if (!focusId) return;
    const t = toilets.find((x) => x.id === focusId);
    if (t) {
      setSelectedId(t.id);
      setFlyTarget({ lat: t.lat, lng: t.lng, ts: Date.now() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const selected = toilets.find((t) => t.id === selectedId) ?? null;
  useEffect(() => {
    if (selectedId !== null && !selected) setSelectedId(null);
  }, [selectedId, selected]);

  // Memoized: this array is passed straight to the map, which rebuilds its marker
  // list whenever the reference changes. Without this, unrelated state updates in
  // this component (selecting a pin, opening a modal, flying the camera) would hand
  // the map a fresh array every time and force it to re-diff every marker.
  const visible = useMemo(
    () =>
      toilets.filter((t) => {
        if (filter === "gratuit") return t.kind === "gratuit";
        if (filter === "payant") return t.kind !== "gratuit";
        if (filter === "top") return t.score >= 4;
        return true;
      }),
    [toilets, filter]
  );

  const approvedCount = toilets.filter((t) => t.status === "approved").length;

  const geolocate = (onOk: (pos: { lat: number; lng: number }) => void) => {
    if (!navigator.geolocation) {
      toast("La géolocalisation n'est pas dispo ici 😢", "err");
      return;
    }
    // Safari (iOS included) refuses the Geolocation API on an insecure origin — it
    // fails with a permission-shaped error instantly, without ever showing the OS
    // prompt, even when the browser itself has location access granted. Testing over
    // a plain http:// LAN address (e.g. http://192.168.x.x:3000) hits this every time;
    // it needs HTTPS or `localhost` to work at all.
    if (!window.isSecureContext) {
      toast("La géolocalisation exige une connexion sécurisée (HTTPS) — pas disponible en http:// sur le réseau local", "err");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => onOk({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          toast("Localisation refusée — active la permission dans les réglages du navigateur", "err");
        } else {
          toast("Position introuvable — réessaie dans un instant", "err");
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Auto-locate on arrival: prompt for location immediately, and if granted, center
  // the map on the user right away — same effect as tapping the 📍 button, just
  // without waiting for that tap. Denial/error still surfaces via geolocate's own toast.
  useEffect(() => {
    geolocate((pos) => {
      setUserPos(pos);
      setFlyTarget({ ...pos, zoom: 16, ts: Date.now() });
    });
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe(null);
    toast("À bientôt sur le trône 👋");
  };

  // Stable references: Map is memoized (tens of thousands of markers at OSM-seeded
  // scale make a full re-render genuinely expensive), so passing fresh inline
  // closures here would defeat that memoization and force it to re-render — and
  // therefore visibly stutter — on every unrelated state change in this component
  // (opening a modal, toggling a filter, anything).
  const onMarkerSelect = useCallback((id: number) => setSelectedId(id), []);
  const onMapPlace = useCallback((lat: number, lng: number) => {
    setDraftPos({ lat, lng });
    setPlacing(false);
    setShowAdd(true);
  }, []);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-cream">
      <div className="absolute inset-0 z-0">
        <CacarteMap
          toilets={visible}
          selectedId={selectedId}
          placing={placing}
          userPos={userPos}
          flyTarget={flyTarget}
          onSelect={onMarkerSelect}
          onPlace={onMapPlace}
        />
      </div>

      {/*
        Header row + filter chips share one flex-col flow so the chips always land right
        below the header card, whatever its actual rendered height turns out to be (emoji
        line-height and font metrics vary across OS/browsers — a hardcoded top offset for
        the chips row broke as soon as the header was taller than assumed).
      */}
      <header
        className={`pointer-events-none absolute inset-x-0 top-0 z-[1000] flex-col gap-2 p-3 ${view === "map" ? "flex" : "hidden"}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="sticker-sm pointer-events-auto flex items-center gap-2.5 rounded-2xl px-3.5 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVG, no benefit from next/image here */}
            <img src="/cacarte-logo.svg" alt="Caca'rte" className="h-9 w-9 shrink-0" />
            <div className="leading-none">
              <p className="font-display text-xl font-extrabold tracking-tight">Caca&apos;rte</p>
              <p className="text-[10px] font-bold text-ink/60">la carte qui a du nez</p>
            </div>
            <span className="ml-1 hidden shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-blush px-2.5 py-1 text-[11px] font-extrabold leading-none sm:inline-flex">
              <span aria-hidden>🧻</span> {approvedCount} spot{approvedCount > 1 ? "s" : ""}
            </span>
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            <NotificationBell me={me} />
          </div>
        </div>

        {placing ? (
          <div className="flex justify-center px-3">
            <div className="sticker pointer-events-auto animate-toast flex items-center gap-3 bg-signage px-4 py-2.5">
              <span className="text-lg">🎯</span>
              <p className="text-sm font-extrabold">Touche la carte pour poser ton petit coin</p>
              <button onClick={() => setPlacing(false)} className="rounded-lg border-2 border-ink bg-white px-2.5 py-1 text-xs font-extrabold hover:bg-red-50">
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <div className="no-scrollbar pointer-events-auto -m-2 flex max-w-full gap-1.5 overflow-x-auto p-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`shrink-0 rounded-full border-2 border-ink px-3.5 py-1.5 text-xs font-extrabold shadow-[3px_3px_0_#1a1a1a] transition hover:-translate-y-0.5 ${
                  filter === f.value ? "bg-teal text-white" : "bg-white hover:bg-blush"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {view === "map" && (
        <div className="absolute bottom-24 right-4 z-[950]">
          <button
            onClick={() =>
              geolocate((pos) => {
                setUserPos(pos);
                setFlyTarget({ ...pos, zoom: 16, ts: Date.now() });
              })
            }
            className="sticker sticker-press grid h-12 w-12 place-items-center rounded-full text-xl transition hover:-translate-y-1"
            title="Me localiser"
            aria-label="Me localiser"
          >
            📍
          </button>
        </div>
      )}

      {view === "map" && (
        <p className="absolute bottom-1.5 left-2 z-[900] rounded bg-white/80 px-1.5 py-0.5 text-[9px] font-semibold text-ink/60">
          © les contributeurs d&apos;OpenStreetMap France
        </p>
      )}

      <AnimatePresence>
        {view === "profile" && (
          <ProfilePage
            me={me}
            onLoginClick={() => setShowAuth(true)}
            onLogout={() => void logout()}
            onPseudoChanged={(pseudo) => setMe((u) => (u ? { ...u, pseudo } : u))}
            onSelectToilet={(id) => {
              setView("map");
              setSelectedId(id);
              const t = toilets.find((x) => x.id === id);
              if (t) setFlyTarget({ lat: t.lat, lng: t.lng, zoom: 17, ts: Date.now() });
            }}
          />
        )}
        {view === "leaderboard" && <LeaderboardPage me={me} onSelectUser={setViewedUserId} />}
        {view === "games" && <GamesPage me={me} />}
      </AnimatePresence>

      <BottomNav
        active={view}
        onNavigate={setView}
        onAdd={() => {
          setDraftPos(null);
          setShowAdd(true);
        }}
      />

      <AnimatePresence>
        {selected && (
          <DetailPanel
            key={selected.id}
            pin={selected}
            me={me}
            onClose={() => setSelectedId(null)}
            onPosted={() => void sync()}
            onLoginClick={() => setShowAuth(true)}
            onSelectUser={setViewedUserId}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewedUserId !== null && (
          <UserProfileModal
            key={viewedUserId}
            userId={viewedUserId}
            onClose={() => setViewedUserId(null)}
            onSelectToilet={(id) => {
              setViewedUserId(null);
              setSelectedId(id);
              const t = toilets.find((x) => x.id === id);
              if (t) setFlyTarget({ lat: t.lat, lng: t.lng, zoom: 17, ts: Date.now() });
            }}
          />
        )}
      </AnimatePresence>

      <AddToiletModal
        open={showAdd}
        pos={draftPos}
        me={me}
        onClose={() => {
          setShowAdd(false);
          setPlacing(false);
        }}
        onDone={() => {
          setShowAdd(false);
          setDraftPos(null);
          void sync(true);
        }}
        onPickOnMap={() => {
          setShowAdd(false);
          setPlacing(true);
        }}
        onUseMyLocation={() =>
          geolocate((pos) => {
            setUserPos(pos);
            setDraftPos(pos);
            setFlyTarget({ ...pos, zoom: 17, ts: Date.now() });
          })
        }
        onLoginClick={() => {
          setShowAdd(false);
          setShowAuth(true);
        }}
      />
      <AuthModal
        open={showAuth}
        onClose={() => setShowAuth(false)}
        onAuthed={(u) => {
          setMe(u);
          setShowAuth(false);
        }}
      />
      <Toasts />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Splash />}>
      <Home />
    </Suspense>
  );
}
