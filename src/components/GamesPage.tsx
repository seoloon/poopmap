"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { SessionUser } from "@/lib/types";
import type { GameKind } from "@/lib/games/scoring";
import GameShell from "./GameShell";
import Game2048 from "./games/Game2048";
import GameMinesweeper from "./games/GameMinesweeper";
import GameSudoku from "./games/GameSudoku";
import GameTetris from "./games/GameTetris";
import type { Difficulty as MinesweeperDifficulty } from "@/lib/games/minesweeper";
import type { Difficulty as SudokuDifficulty } from "@/lib/games/sudoku";
import type { Difficulty as TetrisDifficulty } from "@/lib/games/tetris";

const DOORS: { game: GameKind; emoji: string; title: string }[] = [
  { game: "2048", emoji: "🔢", title: "2048" },
  { game: "minesweeper", emoji: "💣", title: "Démineur" },
  { game: "sudoku", emoji: "🧩", title: "Sudoku" },
  { game: "tetris", emoji: "🧱", title: "Tetris" },
];

function Game2048Screen({ me, onExit }: { me: SessionUser | null; onExit: () => void }) {
  return (
    <GameShell title="2048" emoji="🔢" game="2048" me={me} onExit={onExit}>
      {({ finish }) => <Game2048 onFinish={finish} />}
    </GameShell>
  );
}

function MinesweeperScreen({ me, onExit }: { me: SessionUser | null; onExit: () => void }) {
  return (
    <GameShell title="Démineur" emoji="💣" game="minesweeper" me={me} onExit={onExit}>
      {({ difficulty, finish }) => (
        <GameMinesweeper difficulty={difficulty as MinesweeperDifficulty} onFinish={finish} />
      )}
    </GameShell>
  );
}

function SudokuScreen({ me, onExit }: { me: SessionUser | null; onExit: () => void }) {
  return (
    <GameShell title="Sudoku" emoji="🧩" game="sudoku" me={me} onExit={onExit}>
      {({ difficulty, finish }) => <GameSudoku difficulty={difficulty as SudokuDifficulty} onFinish={finish} />}
    </GameShell>
  );
}

function TetrisScreen({ me, onExit }: { me: SessionUser | null; onExit: () => void }) {
  return (
    <GameShell title="Tetris" emoji="🧱" game="tetris" me={me} onExit={onExit}>
      {({ difficulty, finish }) => <GameTetris difficulty={difficulty as TetrisDifficulty} onFinish={finish} />}
    </GameShell>
  );
}

/** The "Jeux" tab: a toilet-arcade lobby — a row of stall doors, each opening its game. */
export default function GamesPage({ me }: { me: SessionUser | null }) {
  const [open, setOpen] = useState<GameKind | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.22 }}
      className="absolute inset-0 z-[1000] overflow-y-auto bg-cream"
    >
      <AnimatePresence mode="wait">
        {open === null ? (
          <motion.div key="lobby" exit={{ opacity: 0 }} className="mx-auto max-w-lg px-4 pb-32 pt-6">
            <h1 className="mb-1 font-display text-2xl font-extrabold tracking-tight">🚻 Salle d&apos;arcade</h1>
            <p className="mb-4 text-xs font-bold text-ink/50">Pousse une porte, la cabine est toujours libre</p>
            <div className="grid grid-cols-2 gap-3">
              {DOORS.map((d) => (
                <button
                  key={d.game}
                  onClick={() => setOpen(d.game)}
                  className="sticker sticker-press group relative flex flex-col items-center gap-2 rounded-[24px] border-4 border-ink bg-white p-5 pt-8 transition hover:-translate-y-1"
                >
                  <span className="absolute -top-3 rounded-full border-2 border-ink bg-teal px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white shadow-[2px_2px_0_#1a1a1a]">
                    Libre
                  </span>
                  <span className="text-4xl transition group-hover:scale-110" aria-hidden>
                    {d.emoji}
                  </span>
                  <span className="font-display text-sm font-extrabold">{d.title}</span>
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div key={open} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {open === "2048" && <Game2048Screen me={me} onExit={() => setOpen(null)} />}
            {open === "minesweeper" && <MinesweeperScreen me={me} onExit={() => setOpen(null)} />}
            {open === "sudoku" && <SudokuScreen me={me} onExit={() => setOpen(null)} />}
            {open === "tetris" && <TetrisScreen me={me} onExit={() => setOpen(null)} />}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
