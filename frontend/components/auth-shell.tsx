"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, LockKeyhole } from "lucide-react";

import AssistantWorkspace from "@/components/assistant-workspace";
import { MobileAssistantApp } from "@/components/mobile-assistant-app";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getAuthSession,
  login,
  logout,
  type AuthSessionResponse,
} from "@/lib/api/client";

type AuthShellProps = {
  variant?: "auto" | "desktop" | "mobile";
};

const sessionCheckTimeoutMs = 8000;

export function AuthShell({ variant = "auto" }: AuthShellProps) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSessionResponse | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthMutating, setIsAuthMutating] = useState(false);
  const [autoVariant, setAutoVariant] = useState<"desktop" | "mobile">("desktop");

  const effectiveVariant = variant === "auto" ? autoVariant : variant;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadSession() {
      const timeoutId = window.setTimeout(() => controller.abort(), sessionCheckTimeoutMs);

      try {
        const nextSession = await getAuthSession(controller.signal);
        if (!cancelled) {
          setSession(nextSession);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          const isTimeout =
            loadError instanceof DOMException && loadError.name === "AbortError";
          setError(
            isTimeout
              ? "登录状态检查超时。请确认后端已启动，并重启前端服务后再用手机访问。"
              : loadError instanceof Error
                ? loadError.message
                : "加载登录状态失败。",
          );
          setSession({ authenticated: false, username: null });
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (variant !== "auto") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateVariant = () => setAutoVariant(mediaQuery.matches ? "mobile" : "desktop");
    updateVariant();
    mediaQuery.addEventListener("change", updateVariant);

    return () => {
      mediaQuery.removeEventListener("change", updateVariant);
    };
  }, [variant]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsAuthMutating(true);
    setError(null);

    try {
      const nextSession = await login({ username, password });
      queryClient.clear();
      setSession(nextSession);
      setPassword("");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登录失败。");
    } finally {
      setIsAuthMutating(false);
    }
  }

  async function handleLogout() {
    setIsAuthMutating(true);
    setError(null);

    try {
      await logout();
      queryClient.clear();
      setSession({ authenticated: false, username: null });
      setPassword("");
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "退出登录失败。");
    } finally {
      setIsAuthMutating(false);
    }
  }

  if (isLoading) {
    return (
      <main className="flex h-[100dvh] items-center justify-center bg-slate-100">
        <div className="inline-flex items-center gap-2 text-sm text-slate-600">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          正在检查登录状态...
        </div>
      </main>
    );
  }

  if (session?.authenticated) {
    if (effectiveVariant === "mobile") {
      return (
        <main className="h-[100dvh] overflow-hidden">
          <MobileAssistantApp
            authUsername={session.username}
            onLogout={() => void handleLogout()}
            isAuthMutating={isAuthMutating}
          />
        </main>
      );
    }

    return (
      <main className="h-[100dvh] overflow-hidden">
        <AssistantWorkspace
          authUsername={session.username}
          onLogout={() => void handleLogout()}
          isAuthMutating={isAuthMutating}
        />
      </main>
    );
  }

  return (
    <main className="flex h-[100dvh] items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.06),_transparent_45%),linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-4">
      <Card className="w-full max-w-md border-slate-200 bg-white/95 shadow-xl">
        <CardHeader className="space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="font-display text-2xl text-slate-950">
              登录 {effectiveVariant === "mobile" ? "Jeeves Mobile" : "Jeeves"}
            </CardTitle>
            <CardDescription className="mt-2 text-sm leading-6 text-slate-500">
              {effectiveVariant === "mobile"
                ? "手机访问同样需要管理员登录，登录后会进入移动端聊天应用。"
                : "部署到公网后，先完成管理员登录，再进入工作台。"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleLogin}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">用户名</label>
              <Input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">密码</label>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </div>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={isAuthMutating || !username.trim() || !password.trim()}>
              {isAuthMutating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
              登录
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
