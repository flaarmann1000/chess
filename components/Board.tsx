"use client";

import { useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";

type Color = "w" | "b";

// U+FE0E (text variation selector) forces monochrome text rendering so mobile
// OS fonts don't promote the pawn glyph (U+265F) to a color emoji, which would
// ignore our CSS color and make white pawns appear black.
const VS = "︎";
const GLYPH: Record<string, string> = {
  k: "♚" + VS,
  q: "♛" + VS,
  r: "♜" + VS,
  b: "♝" + VS,
  n: "♞" + VS,
  p: "♟" + VS,
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

export interface BoardProps {
  fen: string;
  orientation: "white" | "black";
  youColor: Color | null; // which side's pieces this viewer owns
  canMove: boolean; // is it this viewer's turn and game live
  lastMove: { from: string; to: string } | null;
  onMove: (from: string, to: string, promotion?: string) => void;
}

export default function Board({
  fen,
  orientation,
  youColor,
  canMove,
  lastMove,
  onMove,
}: BoardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);

  const chess = useMemo(() => new Chess(fen), [fen]);
  const board = useMemo(() => chess.board(), [chess]);
  const turn = chess.turn();

  // King-in-check square (for the highlight).
  const checkSquare = useMemo(() => {
    if (!chess.inCheck()) return null;
    for (const row of board) {
      for (const cell of row) {
        if (cell && cell.type === "k" && cell.color === turn) return cell.square;
      }
    }
    return null;
  }, [chess, board, turn]);

  const legalTargets = useMemo(() => {
    if (!selected) return new Map<string, boolean>();
    const moves = chess.moves({ square: selected as Square, verbose: true });
    const m = new Map<string, boolean>();
    for (const mv of moves as any[]) {
      m.set(mv.to, Boolean(mv.captured) || mv.flags.includes("e"));
    }
    return m;
  }, [chess, selected]);

  const interactive = canMove && youColor !== null && youColor === turn;

  // Build render order of squares based on orientation.
  const ranks = orientation === "white" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === "white" ? FILES : [...FILES].reverse();

  function pieceAt(square: string) {
    for (const row of board) {
      for (const cell of row) {
        if (cell && cell.square === square) return cell;
      }
    }
    return null;
  }

  function isPromotion(from: string, to: string): boolean {
    const moves = chess.moves({ square: from as Square, verbose: true }) as any[];
    return moves.some((m) => m.to === to && m.promotion);
  }

  function handleSquare(square: string) {
    if (!interactive) return;
    const piece = pieceAt(square);

    // Selecting one of your own pieces.
    if (piece && piece.color === youColor) {
      setSelected(square === selected ? null : square);
      return;
    }

    if (selected && legalTargets.has(square)) {
      if (isPromotion(selected, square)) {
        setPromo({ from: selected, to: square });
        return;
      }
      onMove(selected, square);
      setSelected(null);
      return;
    }

    setSelected(null);
  }

  function choosePromo(piece: string) {
    if (promo) {
      onMove(promo.from, promo.to, piece);
      setPromo(null);
      setSelected(null);
    }
  }

  return (
    <div className="board-frame">
      <div className="board" role="grid" aria-label="Chess board">
        {ranks.map((rank, rIdx) =>
          files.map((file, fIdx) => {
            const square = `${file}${rank}`;
            const isLight = (FILES.indexOf(file) + rank) % 2 === 1;
            const piece = pieceAt(square);
            const isSel = selected === square;
            const target = legalTargets.get(square);
            const isTarget = legalTargets.has(square);
            const isLast =
              lastMove && (lastMove.from === square || lastMove.to === square);
            const isCheck = checkSquare === square;
            const movable =
              interactive && piece && piece.color === youColor;

            const cls = [
              "sq",
              isLight ? "light" : "dark",
              isSel ? "sel" : "",
              isLast ? "last" : "",
              isCheck ? "check" : "",
              movable ? "movable" : "",
            ]
              .filter(Boolean)
              .join(" ");

            // Coordinate labels on the edge squares.
            const showFile = rIdx === ranks.length - 1;
            const showRank = fIdx === 0;

            return (
              <div
                key={square}
                className={cls}
                onClick={() => handleSquare(square)}
                role="gridcell"
                aria-label={square}
              >
                {isTarget && !piece && <span className="hint" />}
                {isTarget && piece && <span className="hint capture" />}
                {piece && (
                  <span className={`piece ${piece.color}`}>
                    {GLYPH[piece.type]}
                  </span>
                )}
                {showRank && (
                  <span className={`coord rank ${isLight ? "on-light" : "on-dark"}`}>
                    {rank}
                  </span>
                )}
                {showFile && (
                  <span className={`coord file ${isLight ? "on-light" : "on-dark"}`}>
                    {file}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {promo && (
        <div className="overlay" onClick={() => setPromo(null)}>
          <div className="promo" onClick={(e) => e.stopPropagation()}>
            <h4>Promote to</h4>
            <div className="promo-row">
              {["q", "r", "b", "n"].map((p) => (
                <button
                  key={p}
                  className="promo-btn"
                  onClick={() => choosePromo(p)}
                >
                  <span className={`piece ${youColor}`}>{GLYPH[p]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
