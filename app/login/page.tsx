"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function readNameCookie(): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)chess_name=([^;]*)/);
  try {
    return m ? decodeURIComponent(m[1]) : "";
  } catch {
    return "";
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Prefill the name from a previous session.
  useEffect(() => {
    const saved = readNameCookie();
    if (saved) setName(saved);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Login failed.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">♞</div>
        <h1 className="login-title">Chess</h1>
        <p className="login-sub">Choose a name and enter the password to play.</p>
        <div className="field">
          <input
            className="input"
            type="text"
            autoComplete="nickname"
            placeholder="Your name"
            maxLength={24}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <input
            className="input"
            type="password"
            inputMode="text"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn" type="submit" disabled={loading || !password}>
            {loading ? "Checking…" : "Enter game"}
          </button>
        </div>
        <div className="error-text">{error}</div>
      </form>
    </div>
  );
}
