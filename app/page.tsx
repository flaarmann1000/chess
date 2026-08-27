"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Board from "@/components/Board";
import ThemeToggle from "@/components/ThemeToggle";

type Color = "white" | "black";

interface PlayerInfo {
  id: string;
  name: string;
}

interface GameState {
  fen: string;
  turn: "w" | "b";
  status: "waiting" | "active" | "check" | "checkmate" | "stalemate" | "draw";
  winner: Color | null;
  players: { white: PlayerInfo | null; black: PlayerInfo | null };
  history: string[];
  lastMove: { from: string; to: string } | null;
  updatedAt: number;
}

interface ApiResponse {
  game: GameState;
  you: Color | null;
}

// U+FE0E forces monochrome text rendering (see components/Board.tsx).
const VS = "︎";
const GLYPH: Record<string, string> = {
  k: "♚" + VS, q: "♛" + VS, r: "♜" + VS, b: "♝" + VS, n: "♞" + VS, p: "♟" + VS,
};

// Derive captured pieces by diffing the board against the full starting set.
function capturedPieces(fen: string) {
  const start: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const whiteHas: Record<string, number> = {};
  const blackHas: Record<string, number> = {};
  const placement = fen.split(" ")[0];
  for (const ch of placement) {
    if (/[a-z]/.test(ch)) blackHas[ch] = (blackHas[ch] || 0) + 1;
    else if (/[A-Z]/.test(ch)) {
      const l = ch.toLowerCase();
      whiteHas[l] = (whiteHas[l] || 0) + 1;
    }
  }
  const capturedWhite: string[] = []; // white pieces taken by black
  const capturedBlack: string[] = []; // black pieces taken by white
  for (const t of ["q", "r", "b", "n", "p"]) {
    for (let i = 0; i < start[t] - (whiteHas[t] || 0); i++) capturedWhite.push(t);
    for (let i = 0; i < start[t] - (blackHas[t] || 0); i++) capturedBlack.push(t);
  }
  return { capturedWhite, capturedBlack };
}

export default function GamePage() {
  const router = useRouter();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [movesOpen, setMovesOpen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  const fetchGame = useCallback(async () => {
    try {
      const res = await fetch("/api/game", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.ok) setData(await res.json());
    } catch {
      /* transient network error — next poll retries */
    }
  }, [router]);

  // Poll for updates.
  useEffect(() => {
    fetchGame();
    const id = setInterval(fetchGame, 1500);
    return () => clearInterval(id);
  }, [fetchGame]);

  async function post(body: object): Promise<ApiResponse | null> {
    setBusy(true);
    try {
      const res = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(json.error || "Something went wrong.");
        return null;
      }
      setData(json);
      return json;
    } catch {
      showToast("Network error.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function claim(color: Color) {
    post({ action: "claim", color });
  }

  function move(from: string, to: string, promotion?: string) {
    post({ action: "move", from, to, promotion });
  }

  function reset() {
    if (confirm("Start a new game? The current board will be cleared.")) {
      post({ action: "reset" });
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
  }

  if (!data) {
    return (
      <div className="login-wrap">
        <div style={{ color: "var(--text-dim)" }}>Loading game…</div>
      </div>
    );
  }

  const { game, you } = data;
  const orientation: Color = you === "black" ? "black" : "white";
  const youCode = you === "white" ? "w" : you === "black" ? "b" : null;
  const gameOver =
    game.status === "checkmate" ||
    game.status === "stalemate" ||
    game.status === "draw";
  const isYourTurn =
    !gameOver && youCode !== null && game.turn === youCode && game.status !== "waiting";
  const canMove =
    isYourTurn && Boolean(game.players.white && game.players.black);

  const { capturedWhite, capturedBlack } = capturedPieces(game.fen);

  // Status banner text.
  let statusText = "";
  let statusClass = "status";
  if (game.status === "waiting") {
    statusText = "Waiting for both players to join…";
  } else if (game.status === "checkmate") {
    statusText = `Checkmate — ${game.winner === "white" ? "White" : "Black"} wins`;
    statusClass += " over";
  } else if (game.status === "stalemate") {
    statusText = "Draw — stalemate";
    statusClass += " over";
  } else if (game.status === "draw") {
    statusText = "Draw";
    statusClass += " over";
  } else {
    const mover = game.turn === "w" ? "White" : "Black";
    if (isYourTurn) {
      if (game.status === "check") {
        statusText = "Your move — you're in check!";
        statusClass += " your-turn warn";
      } else {
        statusText = "Your move";
        statusClass += " your-turn";
      }
    } else {
      statusText = `${mover} to move${game.status === "check" ? " — check" : ""}`;
    }
  }

  const showJoin = you === null;

  // Name/meta shown in a player's row.
  function seatDisplay(color: Color) {
    const seat = game.players[color];
    const isYou = you === color;
    if (!seat) {
      return { name: color === "white" ? "White" : "Black", meta: "open" };
    }
    return { name: seat.name, meta: isYou ? "you" : "" };
  }

  return (
    <div className="page">
      <div className="topbar">
        <div className="brand">
          <span className="brand-logo">♞</span>
          <span>Chess</span>
        </div>
        <div className="topbar-actions">
          <ThemeToggle />
          <button className="chip-btn" onClick={reset} disabled={busy}>
            New game
          </button>
          <button className="chip-btn" onClick={logout}>
            Log out
          </button>
        </div>
      </div>

      <div className="layout">
        <div className="board-col">
          {/* Opponent strip (top) */}
          {(() => {
            const oppColor = orientation === "white" ? "black" : "white";
            const d = seatDisplay(oppColor);
            return (
              <PlayerStrip
                color={oppColor}
                name={d.name}
                meta={d.meta}
                active={
                  !gameOver &&
                  game.turn === (orientation === "white" ? "b" : "w") &&
                  game.status !== "waiting"
                }
                captured={orientation === "white" ? capturedBlack : capturedWhite}
              />
            );
          })()}

          <div className={statusClass}>
            <span className="dot" />
            <span>{statusText}</span>
            {you && <span className="sub">You are {you}</span>}
          </div>

          <Board
            fen={game.fen}
            orientation={orientation}
            youColor={youCode}
            canMove={canMove}
            lastMove={game.lastMove}
            onMove={move}
          />

          {/* Your strip (bottom) */}
          {(() => {
            const d = seatDisplay(orientation);
            return (
              <PlayerStrip
                color={orientation}
                name={d.name}
                meta={d.meta}
                active={
                  !gameOver &&
                  game.turn === (orientation === "white" ? "w" : "b") &&
                  game.status !== "waiting"
                }
                captured={orientation === "white" ? capturedWhite : capturedBlack}
              />
            );
          })()}
        </div>

        <div className="board-col">
          {showJoin && (
            <div className="panel">
              <div className="join">
                <div className="join-title">Join the game</div>
                <div className="join-sub">Pick a side to start playing.</div>
                <div className="color-grid">
                  <button
                    className="color-card"
                    onClick={() => claim("white")}
                    disabled={busy || Boolean(game.players.white)}
                  >
                    <span className="big piece w">{GLYPH.k}</span>
                    <span className="lbl">White</span>
                    <span className="taken">
                      {game.players.white ? "taken" : "available"}
                    </span>
                  </button>
                  <button
                    className="color-card"
                    onClick={() => claim("black")}
                    disabled={busy || Boolean(game.players.black)}
                  >
                    <span className="big piece b">{GLYPH.k}</span>
                    <span className="lbl">Black</span>
                    <span className="taken">
                      {game.players.black ? "taken" : "available"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="panel">
            <button
              className="panel-toggle"
              onClick={() => setMovesOpen((o) => !o)}
              aria-expanded={movesOpen}
            >
              <span className={`caret ${movesOpen ? "open" : ""}`}>›</span>
              <h3>Moves</h3>
              <span className="panel-count">
                {game.history.length > 0 ? game.history.length : ""}
              </span>
            </button>
            {movesOpen && <MoveList history={game.history} />}
          </div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function PlayerStrip({
  color,
  name,
  meta,
  active,
  captured,
}: {
  color: Color;
  name: string;
  meta: string;
  active: boolean;
  captured: string[];
}) {
  return (
    <div className={`pstrip ${active ? "active" : ""}`}>
      <span className={`swatch ${color}`} />
      <span className="name">{name}</span>
      <span className="captured">
        {captured.map((p, i) => (
          <span key={i}>{GLYPH[p]}</span>
        ))}
      </span>
      {meta && <span className="meta">{meta}</span>}
    </div>
  );
}

function MoveList({ history }: { history: string[] }) {
  if (history.length === 0) {
    return <div className="moves-empty">No moves yet.</div>;
  }
  const rows: { num: number; white: string; black: string }[] = [];
  for (let i = 0; i < history.length; i += 2) {
    rows.push({
      num: i / 2 + 1,
      white: history[i],
      black: history[i + 1] || "",
    });
  }
  return (
    <div className="moves">
      {rows.map((r) => (
        <div key={r.num} style={{ display: "contents" }}>
          <span className="num">{r.num}.</span>
          <span className="san">{r.white}</span>
          <span className="san">{r.black}</span>
        </div>
      ))}
    </div>
  );
}
