// Game state model + server-side operations. All rule validation happens here
// (and only here) using chess.js, so clients can never make illegal moves.

import { Chess } from "chess.js";
import { getJSON, setJSON } from "./store";

export type Color = "white" | "black";

export type GameStatus =
  | "waiting" // not enough players have joined
  | "active"
  | "check"
  | "checkmate"
  | "stalemate"
  | "draw";

export interface GameState {
  fen: string;
  turn: "w" | "b";
  status: GameStatus;
  winner: Color | null;
  // clientId that has claimed each seat.
  players: { white: string | null; black: string | null };
  history: string[]; // SAN moves, in order
  lastMove: { from: string; to: string } | null;
  updatedAt: number;
}

const GAME_KEY = "chess:game:main";

const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function freshGame(): GameState {
  return {
    fen: START_FEN,
    turn: "w",
    status: "waiting",
    winner: null,
    players: { white: null, black: null },
    history: [],
    lastMove: null,
    updatedAt: Date.now(),
  };
}

export async function loadGame(): Promise<GameState> {
  const existing = await getJSON<GameState>(GAME_KEY);
  if (existing) return existing;
  const g = freshGame();
  await setJSON(GAME_KEY, g);
  return g;
}

export async function saveGame(g: GameState): Promise<GameState> {
  g.updatedAt = Date.now();
  await setJSON(GAME_KEY, g);
  return g;
}

function computeStatus(chess: Chess): { status: GameStatus; winner: Color | null } {
  if (chess.isCheckmate()) {
    // The side to move is checkmated, so the other side won.
    const winner: Color = chess.turn() === "w" ? "black" : "white";
    return { status: "checkmate", winner };
  }
  if (chess.isStalemate()) return { status: "stalemate", winner: null };
  if (chess.isDraw()) return { status: "draw", winner: null };
  if (chess.inCheck()) return { status: "check", winner: null };
  return { status: "active", winner: null };
}

function bothSeated(g: GameState): boolean {
  return Boolean(g.players.white && g.players.black);
}

// Claim a color for a client. Returns updated game or an error message.
export async function claimSeat(
  clientId: string,
  color: Color
): Promise<{ game: GameState } | { error: string }> {
  const g = await loadGame();

  // Already seated somewhere?
  if (g.players.white === clientId && color !== "white") {
    return { error: "You already joined as White." };
  }
  if (g.players.black === clientId && color !== "black") {
    return { error: "You already joined as Black." };
  }

  const seat = g.players[color];
  if (seat && seat !== clientId) {
    return { error: `${color === "white" ? "White" : "Black"} is already taken.` };
  }

  g.players[color] = clientId;
  if (g.status === "waiting" && bothSeated(g)) g.status = "active";
  return { game: await saveGame(g) };
}

export function seatOf(g: GameState, clientId: string): Color | null {
  if (g.players.white === clientId) return "white";
  if (g.players.black === clientId) return "black";
  return null;
}

export async function applyMove(
  clientId: string,
  from: string,
  to: string,
  promotion?: string
): Promise<{ game: GameState } | { error: string }> {
  const g = await loadGame();

  if (!bothSeated(g)) return { error: "Waiting for a second player to join." };

  const seat = seatOf(g, clientId);
  if (!seat) return { error: "You are only spectating this game." };

  const seatColorCode = seat === "white" ? "w" : "b";
  if (g.turn !== seatColorCode) return { error: "It is not your turn." };

  if (g.status === "checkmate" || g.status === "stalemate" || g.status === "draw") {
    return { error: "The game is over." };
  }

  const chess = new Chess(g.fen);
  let move;
  try {
    move = chess.move({ from, to, promotion: promotion || "q" });
  } catch {
    return { error: "Illegal move." };
  }
  if (!move) return { error: "Illegal move." };

  const { status, winner } = computeStatus(chess);
  g.fen = chess.fen();
  g.turn = chess.turn();
  g.status = status;
  g.winner = winner;
  g.history.push(move.san);
  g.lastMove = { from: move.from, to: move.to };

  return { game: await saveGame(g) };
}

// Reset the board but keep both players in their seats.
export async function resetGame(): Promise<GameState> {
  const g = await loadGame();
  const fresh = freshGame();
  fresh.players = g.players;
  fresh.status = bothSeated(fresh) ? "active" : "waiting";
  return saveGame(fresh);
}

// Return legal destination squares for a given square, for UI highlighting.
export function legalTargets(fen: string, square: string): string[] {
  const chess = new Chess(fen);
  try {
    const moves = chess.moves({ square: square as any, verbose: true });
    return moves.map((m: any) => m.to);
  } catch {
    return [];
  }
}
