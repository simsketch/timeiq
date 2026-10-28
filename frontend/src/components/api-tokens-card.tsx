"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { apiFetch } from "@/lib/api";
import { API_BASE } from "@/lib/invoicing";

interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
}

interface ConnectedApp {
  id: string;
  client_name: string;
  created_at: string;
  last_used_at: string | null;
}

const MCP_URL = `${API_BASE.replace(/\/$/, "")}/mcp`;

type Client = "claude-code" | "json";

function setupSnippet(client: Client, token: string) {
  if (client === "claude-code") {
    return `claude mcp add --transport http timeiq ${MCP_URL} --header "Authorization: Bearer ${token}"`;
  }
  return JSON.stringify(
    { mcpServers: { timeiq: { type: "http", url: MCP_URL, headers: { Authorization: `Bearer ${token}` } } } },
    null,
    2,
  );
}

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "never";
}

export function ApiTokensCard() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);
  const [apps, setApps] = useState<ConnectedApp[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [client, setClient] = useState<Client>("claude-code");
  const [copied, setCopied] = useState<string | null>(null);

  const authed = useCallback(async () => ({ Authorization: `Bearer ${await getToken()}` }), [getToken]);

  const load = useCallback(async () => {
    try {
      const headers = await authed();
      const [tokens, apps] = await Promise.all([
        apiFetch<ApiToken[]>("/api/me/tokens", { headers }),
        apiFetch<ConnectedApp[]>("/api/me/connections", { headers }),
      ]);
      setTokens(tokens);
      setApps(apps);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [authed]);

  useEffect(() => {
    // setTokens runs after the request's await; the rule can't see that.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const out = await apiFetch<ApiToken & { token: string }>("/api/me/tokens", {
        method: "POST",
        headers: await authed(),
        body: JSON.stringify({ name: name.trim() || "AI assistant" }),
      });
      setCreated(out.token);
      setName("");
      await load();
    } catch (error) {
      toast({ title: "Couldn't create a token", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: ApiToken) {
    try {
      await apiFetch(`/api/me/tokens/${token.id}`, { method: "DELETE", headers: await authed() });
      toast({ title: `Revoked "${token.name}"`, description: "Anything using it stops working right away." });
      await load();
    } catch (error) {
      toast({ title: "Couldn't revoke the token", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  }

  async function copy(text: string, what: string) {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied((c) => (c === what ? null : c)), 1600);
  }

  async function disconnect(app: ConnectedApp) {
    try {
      await apiFetch(`/api/me/connections/${app.id}`, { method: "DELETE", headers: await authed() });
      toast({ title: `Disconnected ${app.client_name}` });
      await load();
    } catch (error) {
      toast({ title: "Couldn't disconnect the app", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI assistants (MCP)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Connect TimeIQ to Claude, ChatGPT, Cursor or any MCP client, then ask things like &ldquo;when am I free
          Thursday?&rdquo; or &ldquo;find a time with Ana next week&rdquo;. Assistants check with you before
          sending anything.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm">Claude (web and desktop) and ChatGPT: add a custom connector with this URL.</p>
          <div className="flex gap-2">
            <Input value={MCP_URL} readOnly className="font-mono text-xs" aria-label="MCP connector URL" />
            <Button type="button" variant="outline" onClick={() => copy(MCP_URL, "url")} aria-label="Copy connector URL">
              {copied === "url" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Sign in and click Allow. No token needed.</p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Connected apps</h3>
          {apps === null ? !loadError && <p className="text-sm text-muted-foreground">Loading connected apps…</p> : apps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No connected apps yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {apps.map((app) => (
                <li key={app.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{app.client_name}</p>
                    <p className="text-xs text-muted-foreground">Connected {when(app.created_at)} · last used {when(app.last_used_at)}</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => disconnect(app)}>Disconnect</Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {loadError && <p role="alert" className="text-sm text-destructive">Couldn&apos;t load your connections. <button type="button" onClick={load} className="underline">Try again</button>.</p>}

        <h3 className="text-sm font-medium">Personal tokens for Claude Code, Cursor and other clients</h3>
        <form onSubmit={create} className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name this token, e.g. Claude Code"
            maxLength={100}
            aria-label="Token name"
          />
          <Button type="submit" disabled={busy} className="shrink-0">
            <KeyRound className="mr-1.5 h-4 w-4" /> Create token
          </Button>
        </form>

        {created && (
          <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-medium">Copy this token now. TimeIQ won&apos;t show it again.</p>
            <div className="flex gap-2">
              <Input value={created} readOnly className="font-mono text-xs" aria-label="New token" />
              <Button type="button" variant="outline" onClick={() => copy(created, "token")} aria-label="Copy token">
                {copied === "token" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex gap-1 text-xs" role="tablist" aria-label="Setup instructions">
              {([["claude-code", "Claude Code"], ["json", "Cursor and other clients"]] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={client === id}
                  onClick={() => setClient(id)}
                  className={`rounded-full px-3 py-1 ${client === id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative">
              <pre className="overflow-x-auto whitespace-pre rounded-md bg-muted p-3 pr-12 text-xs leading-relaxed">{setupSnippet(client, created)}</pre>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1.5 top-1.5"
                onClick={() => copy(setupSnippet(client, created), "setup")}
                aria-label="Copy setup"
              >
                {copied === "setup" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {client === "claude-code"
                ? "Run it in a terminal; TimeIQ's tools appear in your next Claude Code session."
                : "Add this JSON to the client's MCP settings (Cursor: Settings → MCP)."}
              {" "}Server URL: <code className="font-mono">{MCP_URL}</code>
            </p>
          </div>
        )}

        <div>
          {tokens === null ? null : tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tokens yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {tokens.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{t.prefix}…</span> · created {when(t.created_at)} · last used {when(t.last_used_at)}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => revoke(t)} aria-label={`Revoke ${t.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
