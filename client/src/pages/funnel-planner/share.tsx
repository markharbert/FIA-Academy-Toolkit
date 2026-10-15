import { useState } from "react";
import { normalizeFunnelEdges } from "@shared/funnel-edges";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  ReactFlowProvider,
} from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "@/components/funnel-planner/node-types";
import { edgeTypes } from "@/components/funnel-planner/custom-edge";
import { CanvasThemeContext } from "@/components/funnel-planner/canvas-theme-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, AlertTriangle, GitFork, Sun, Moon } from "lucide-react";
import type { CanvasTheme } from "@/components/funnel-planner/canvas-theme-context";

interface SharedFunnel {
  id: string;
  name: string;
  description?: string | null;
  canvasData: { nodes?: Node[]; edges?: Edge[] } | null;
  updatedAt: string;
}

function PasswordGate({ token, onUnlock }: { token: string; onUnlock: (data: SharedFunnel) => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setChecking(true);
    try {
      const res = await fetch(`/api/funnels/share/${token}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        const data = await res.json() as SharedFunnel;
        onUnlock(data);
      } else {
        const json = await res.json().catch(() => ({})) as { message?: string };
        setError(json.message || "Incorrect password.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0d1424] flex items-center justify-center p-4">
      <div className="bg-[hsl(230,45%,11%)] border border-white/10 rounded-2xl p-8 w-full max-w-sm text-center space-y-5">
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-violet-500/15 border border-violet-400/20 mx-auto">
          <Lock className="w-6 h-6 text-violet-400" />
        </div>
        <div>
          <h2 className="text-white font-semibold text-lg">Password Protected</h2>
          <p className="text-white/40 text-sm mt-1">Enter the password to view this funnel.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 text-left">
          <div>
            <Label className="text-xs text-white/50 uppercase tracking-wide">Password</Label>
            <Input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Enter password"
              className="mt-1 bg-white/[0.04] border-white/10 text-white"
              data-testid="input-share-password"
              autoFocus
            />
            {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
          </div>
          <Button
            type="submit"
            disabled={checking || !pw}
            className="w-full"
            data-testid="button-share-password-submit"
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            View Funnel
          </Button>
        </form>
      </div>
    </div>
  );
}

function SharedCanvas({ funnel }: { funnel: SharedFunnel }) {
  const nodes: Node[] = funnel.canvasData?.nodes ?? [];
  const edges: Edge[] = normalizeFunnelEdges(funnel.canvasData?.edges ?? []);

  const [theme, setTheme] = useState<CanvasTheme>(() =>
    (localStorage.getItem("funnelCanvasTheme") as CanvasTheme) || "dark"
  );

  const toggleTheme = () => {
    setTheme((prev) => {
      const next: CanvasTheme = prev === "dark" ? "light" : "dark";
      localStorage.setItem("funnelCanvasTheme", next);
      return next;
    });
  };

  const isLight = theme === "light";

  return (
    <div className="flex flex-col" style={{ height: "100vh" }}>
      {/* Header */}
      <div className="h-12 shrink-0 flex items-center gap-3 px-5 bg-[hsl(230,45%,11%)] border-b border-white/10">
        <div className="flex items-center gap-2">
          <GitFork className="h-4 w-4 text-violet-400" />
          <span className="text-white font-semibold text-sm truncate max-w-xs" data-testid="text-share-funnel-name">
            {funnel.name}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={toggleTheme}
            title={isLight ? "Switch to dark canvas" : "Switch to light canvas"}
            className="flex items-center justify-center w-7 h-7 rounded-md bg-white/[0.06] border border-white/10 text-white/60 hover:bg-white/10 hover:text-white/90 transition-colors"
            data-testid="button-share-toggle-theme"
          >
            {isLight ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
          </button>
          <span className="text-[11px] text-white/30">View only</span>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <CanvasThemeContext.Provider value={theme}>
          <ReactFlow
            proOptions={{ hideAttribution: true }}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{ type: "custom", data: {} }}
            connectionMode="loose"
            fitView
            fitViewOptions={{ padding: 0.2 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            zoomOnDoubleClick={false}
            style={{ background: isLight ? "#f8fafc" : "#0d1424" }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color={isLight ? "#cbd5e1" : "#1e2d4a"}
            />
            <Controls
              showInteractive={false}
              className={isLight
                ? "!bg-white !border-gray-200 [&>button]:!border-gray-200 [&>button]:!text-gray-500 [&>button:hover]:!bg-gray-100"
                : "!bg-[hsl(230,45%,11%)] !border-white/10"
              }
            />
            <MiniMap
              className={isLight ? "!bg-gray-50 !border-gray-200" : "!bg-[hsl(230,45%,9%)] !border-white/10"}
              nodeColor="#6366f1"
              maskColor={isLight ? "rgba(200,210,220,0.5)" : "rgba(0,0,0,0.6)"}
            />
          </ReactFlow>
        </CanvasThemeContext.Provider>
      </div>
    </div>
  );
}

export default function FunnelSharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [unlockedFunnel, setUnlockedFunnel] = useState<SharedFunnel | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);

  const { data, isLoading, isError, error } = useQuery<SharedFunnel>({
    queryKey: ["/api/funnels/share", token],
    queryFn: async () => {
      const res = await fetch(`/api/funnels/share/${token}`);
      if (res.status === 401) {
        const json = await res.json().catch(() => ({})) as { passwordRequired?: boolean };
        if (json.passwordRequired) {
          setPasswordRequired(true);
          throw new Error("password_required");
        }
        throw new Error("Unauthorized");
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(json.message || "Not found");
      }
      setPasswordRequired(false);
      return res.json();
    },
    retry: false,
    enabled: !unlockedFunnel,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0d1424] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
      </div>
    );
  }

  if (unlockedFunnel) {
    return (
      <ReactFlowProvider>
        <SharedCanvas funnel={unlockedFunnel} />
      </ReactFlowProvider>
    );
  }

  if (passwordRequired && !data) {
    return <PasswordGate token={token} onUnlock={(d) => setUnlockedFunnel(d)} />;
  }

  if (isError && !passwordRequired) {
    const msg = error instanceof Error ? error.message : "Not found";
    return (
      <div className="min-h-screen bg-[#0d1424] flex flex-col items-center justify-center gap-4 p-4">
        <div className="flex items-center gap-2 text-amber-400">
          <AlertTriangle className="w-6 h-6" />
          <span className="font-semibold text-lg">Link Not Found</span>
        </div>
        <p className="text-white/40 text-sm text-center max-w-sm">
          {msg === "password_required" ? "A password is required." : msg}
        </p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <ReactFlowProvider>
      <SharedCanvas funnel={data} />
    </ReactFlowProvider>
  );
}
