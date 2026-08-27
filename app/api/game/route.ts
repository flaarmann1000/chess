import { NextRequest, NextResponse } from "next/server";
import { CLIENT_COOKIE } from "@/lib/auth";
import {
  applyMove,
  claimSeat,
  loadGame,
  resetGame,
  seatOf,
  type Color,
} from "@/lib/game";

export const dynamic = "force-dynamic";

function clientIdFrom(req: NextRequest): string | null {
  return req.cookies.get(CLIENT_COOKIE)?.value ?? null;
}

// Shape returned to the client: game state plus this viewer's own seat.
async function withViewer(req: NextRequest, game: Awaited<ReturnType<typeof loadGame>>) {
  const clientId = clientIdFrom(req);
  return {
    game,
    you: clientId ? seatOf(game, clientId) : null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const game = await loadGame();
    return NextResponse.json(await withViewer(req, game));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Storage error." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const clientId = clientIdFrom(req);
  if (!clientId) {
    return NextResponse.json({ error: "No client identity." }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const action = String(body?.action ?? "");

  try {
    if (action === "claim") {
      const color = body?.color as Color;
      if (color !== "white" && color !== "black") {
        return NextResponse.json({ error: "Invalid color." }, { status: 400 });
      }
      const result = await claimSeat(clientId, color);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 409 });
      }
      return NextResponse.json(await withViewer(req, result.game));
    }

    if (action === "move") {
      const from = String(body?.from ?? "");
      const to = String(body?.to ?? "");
      const promotion = body?.promotion ? String(body.promotion) : undefined;
      if (!from || !to) {
        return NextResponse.json({ error: "Missing move." }, { status: 400 });
      }
      const result = await applyMove(clientId, from, to, promotion);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 409 });
      }
      return NextResponse.json(await withViewer(req, result.game));
    }

    if (action === "reset") {
      const game = await resetGame();
      return NextResponse.json(await withViewer(req, game));
    }
  } catch (e) {
    // e.g. Edge Config write rejected, or missing VERCEL_API_TOKEN.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Storage error." },
      { status: 500 }
    );
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
