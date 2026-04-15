"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, LockKeyhole } from "lucide-react";

import AssistantWorkspace from "@/components/assistant-workspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getAuthSession,
  login,
  logout,
  type AuthSessionResponse,
} from "@/lib/api/client";

export function AuthShell() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSessionResponse | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthMutating, setIsAuthMutating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const nextSession = await getAuthSession();
        if (!cancelled) {
          setSession(nextSession);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "加载登录状态失败。");
          setSession({ authenticated: false, username: null });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

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
      <main className="flex h-screen items-center justify-center bg-slate-100">
        <div className="inline-flex items-center gap-2 text-sm text-slate-600">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          正在检查登录状态...
        </div>
      </main>
    );
  }

  if (session?.authenticated) {
    return (
      <main className="h-screen overflow-hidden">
        <AssistantWorkspace
          authUsername={session.username}
          onLogout={() => void handleLogout()}
          isAuthMutating={isAuthMutating}
        />
      </main>
    );
  }

  return (
    <main className="flex h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.06),_transparent_45%),linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-4">
      <Card className="w-full max-w-md border-slate-200 bg-white/95 shadow-xl">
        <CardHeader className="space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="font-display text-2xl text-slate-950">登录 Jeeves</CardTitle>
            <CardDescription className="mt-2 text-sm leading-6 text-slate-500">
              部署到公网后，先完成管理员登录，再进入工作台。
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
