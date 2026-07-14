import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Funnel } from "@shared/schema";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  ReactFlowProvider,
  useReactFlow,
  Panel,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes, NODE_CONFIGS, TRAFFIC_PLATFORMS, type FunnelNodeType, type FunnelNodeData } from "@/components/funnel-planner/node-types";
import { edgeTypes } from "@/components/funnel-planner/custom-edge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Download, Save, Loader2, CheckCircle, ChevronLeft, ChevronRight, X, Camera, ImagePlus, Share2, Copy, Lock, Trash2, Sparkles, Brain, Wand2, Sun, Moon, BookMarked } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { CanvasThemeContext, type CanvasTheme } from "@/components/funnel-planner/canvas-theme-context";
import dagre from "dagre";
import { FunnelBrainPanel } from "@/components/funnel-planner/funnel-brain-panel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toPng } from "html-to-image";

const NODE_TYPE_LIST = Object.entries(NODE_CONFIGS) as [FunnelNodeType, typeof NODE_CONFIGS[FunnelNodeType]][];

let nodeIdCounter = Date.now();
function genId() {
  return `n${++nodeIdCounter}`;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

function EditorInner({ funnel }: { funnel: Funnel }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getViewport, fitView } = useReactFlow();

  const initialCanvas = funnel.canvasData as { nodes?: Node[]; edges?: Edge[] } | null;
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialCanvas?.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialCanvas?.edges ?? []);
  const [funnelName, setFunnelName] = useState(funnel.name);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [palettePinned, setPalettePinned] = useState(true);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [canvasTheme, setCanvasTheme] = useState<CanvasTheme>(() =>
    (localStorage.getItem("funnelCanvasTheme") as CanvasTheme) || "dark"
  );
  const toggleCanvasTheme = useCallback(() => {
    setCanvasTheme((prev) => {
      const next: CanvasTheme = prev === "dark" ? "light" : "dark";
      localStorage.setItem("funnelCanvasTheme", next);
      return next;
    });
  }, []);

  // Close settings panel when the selected node is deleted
  useEffect(() => {
    if (selectedNode && !nodes.some((n) => n.id === selectedNode.id)) {
      setSelectedNode(null);
    }
  }, [nodes, selectedNode]);

  // Funnel Brain panel
  const [brainOpen, setBrainOpen] = useState(false);

  // Save as Template (admin only)
  const { user } = useAuth();
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");
  const saveTemplateMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/funnel-templates", {
        name: templateName.trim() || funnelName,
        description: templateDesc.trim(),
        canvasData: JSON.parse(canvasJson),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/funnel-templates"] });
      setSaveTemplateOpen(false);
      setTemplateName("");
      setTemplateDesc("");
      toast({ title: "Template saved", description: "This funnel is now available as a template for all users." });
    },
    onError: () => toast({ title: "Error", description: "Failed to save template", variant: "destructive" }),
  });

  // Share state
  const [shareOpen, setShareOpen] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(funnel.shareToken ?? null);
  const [hasPassword, setHasPassword] = useState(!!funnel.sharePasswordHash);
  const [sharePassword, setSharePassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);

  // Serialize to stable JSON string so debounce only fires on actual content changes,
  // not on every render that recreates the object reference.
  const canvasJson = useMemo(() => JSON.stringify({ nodes, edges }), [nodes, edges]);
  const debouncedCanvasJson = useDebounce(canvasJson, 1200);
  const debouncedName = useDebounce(funnelName, 1200);

  const saveMutation = useMutation({
    mutationFn: async (data: { name?: string; canvasData?: unknown }) => {
      const res = await apiRequest("PATCH", `/api/funnels/${funnel.id}`, data);
      return res.json() as Promise<Funnel>;
    },
    onSuccess: (data) => {
      setSaveStatus("saved");
      queryClient.setQueryData(["/api/funnels", funnel.id], data);
    },
    onError: () => setSaveStatus("unsaved"),
  });

  const hasInitialized = useRef(false);
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      return;
    }
    setSaveStatus("saving");
    saveMutation.mutate({ name: debouncedName, canvasData: JSON.parse(debouncedCanvasJson) });
  }, [debouncedCanvasJson, debouncedName]);

  // Always-fresh ref so beforeunload closure is never stale
  const latestRef = useRef({ name: funnelName, canvasJson });
  useEffect(() => { latestRef.current = { name: funnelName, canvasJson }; });

  // Flush latest state via sendBeacon on browser close / refresh
  useEffect(() => {
    const onUnload = () => {
      const body = JSON.stringify({
        name: latestRef.current.name,
        canvasData: JSON.parse(latestRef.current.canvasJson),
      });
      navigator.sendBeacon(
        `/api/funnels/${funnel.id}/beacon`,
        new Blob([body], { type: "application/json" })
      );
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [funnel.id]);

  // Immediate flush-save before in-app navigation
  const handleBack = useCallback(async () => {
    setSaveStatus("saving");
    try {
      const res = await fetch(`/api/funnels/${funnel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: funnelName, canvasData: JSON.parse(canvasJson) }),
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        queryClient.setQueryData(["/api/funnels", funnel.id], data);
        setSaveStatus("saved");
      }
    } catch { /* navigate anyway */ }
    setLocation("/funnel-grid");
  }, [funnel.id, funnelName, canvasJson, setLocation]);

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) => addEdge({ ...connection, type: "custom", data: {} }, eds)),
    [setEdges]
  );


  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData("application/funnel-node-type") as FunnelNodeType;
      if (!nodeType) return;
      const cfg = NODE_CONFIGS[nodeType];
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setNodes((nds) => {
        const label =
          nodeType === "emailNode"
            ? `Email ${nds.filter((n) => (n.data as FunnelNodeData).nodeType === "emailNode").length + 1}`
            : cfg.label;
        const newNode: Node = {
          id: genId(),
          type: nodeType,
          position,
          ...(nodeType === "note" ? { style: { width: 220, height: 150 } } : {}),
          data: {
            label, nodeType, description: "",
            ...(nodeType === "trafficSource" ? { pickingMode: true } : {}),
            ...(nodeType === "delay" ? { delayAmount: 1, delayUnit: "days" } : {}),
          } as FunnelNodeData,
        };
        return [...nds, newNode];
      });
    },
    [screenToFlowPosition, setNodes]
  );

  const updateSelectedNodeData = useCallback(
    (updates: Partial<FunnelNodeData>) => {
      if (!selectedNode) return;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNode.id ? { ...n, data: { ...n.data, ...updates } } : n
        )
      );
      setSelectedNode((prev) => (prev ? { ...prev, data: { ...prev.data, ...updates } } : null));
    },
    [selectedNode, setNodes]
  );

  const generatePreview = useCallback(async () => {
    const rawUrl = (selectedNode?.data as FunnelNodeData)?.pageUrl;
    if (!rawUrl || isGeneratingPreview) return;
    let url = rawUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
    setIsGeneratingPreview(true);
    try {
      const apiRes = await fetch(
        `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true`
      );
      const json = await apiRes.json();
      const screenshotUrl: string | undefined = json?.data?.screenshot?.url;
      const ogImageUrl: string | undefined = json?.data?.image?.url;
      const pageTitle: string | undefined = json?.data?.title;
      const pageDescription: string | undefined = json?.data?.description;
      const previewUrl = screenshotUrl || ogImageUrl;
      if (previewUrl) {
        const updates: Record<string, string | undefined> = { pagePreviewUrl: previewUrl, pageUrl: url };
        if (pageTitle) updates.label = pageTitle;
        if (pageDescription) updates.description = pageDescription;
        updateSelectedNodeData(updates);
        toast({ title: "Preview captured!", description: pageTitle ? `"${pageTitle}" imported.` : "Page screenshot added to node." });
      } else {
        const reason = json?.message || "Page could not be captured — make sure it is publicly accessible.";
        toast({ title: "Couldn't capture preview", description: reason, variant: "destructive" });
      }
    } catch (err) {
      console.error("[generatePreview]", err);
      toast({ title: "Capture failed", description: err instanceof Error ? err.message : "Network error — check your connection and try again.", variant: "destructive" });
    } finally {
      setIsGeneratingPreview(false);
    }
  }, [selectedNode, isGeneratingPreview, updateSelectedNodeData, toast]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!e.target) return;
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      if (!src) return;
      const img = new Image();
      img.onload = () => {
        const MAX_W = 800;
        const scale = img.width > MAX_W ? MAX_W / img.width : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        updateSelectedNodeData({ pagePreviewUrl: dataUrl });
        toast({ title: "Image uploaded", description: "Custom image set on this node." });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }, [updateSelectedNodeData, toast]);

  const shareUrl = shareToken ? `${window.location.origin}/funnels/share/${shareToken}` : null;

  const handleGenerateShareLink = useCallback(async () => {
    setShareLoading(true);
    try {
      const res = await apiRequest("POST", `/api/funnels/${funnel.id}/share`, {
        password: usePassword && sharePassword ? sharePassword : null,
      });
      const data = await res.json() as { shareToken: string; hasPassword: boolean };
      setShareToken(data.shareToken);
      setHasPassword(data.hasPassword);
      setSharePassword("");
      queryClient.invalidateQueries({ queryKey: ["/api/funnels", funnel.id] });
      toast({ title: "Share link created!", description: "Anyone with the link can view this funnel." });
    } catch {
      toast({ title: "Failed to create link", variant: "destructive" });
    } finally {
      setShareLoading(false);
    }
  }, [funnel.id, usePassword, sharePassword, toast]);

  const handleRevokeShareLink = useCallback(async () => {
    setShareLoading(true);
    try {
      await apiRequest("DELETE", `/api/funnels/${funnel.id}/share`);
      setShareToken(null);
      setHasPassword(false);
      queryClient.invalidateQueries({ queryKey: ["/api/funnels", funnel.id] });
      toast({ title: "Share link revoked" });
    } catch {
      toast({ title: "Failed to revoke link", variant: "destructive" });
    } finally {
      setShareLoading(false);
    }
  }, [funnel.id, toast]);

  const handleCopyLink = useCallback(() => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      toast({ title: "Link copied to clipboard!" });
    });
  }, [shareUrl, toast]);

  const handleDraftEmail = useCallback(async () => {
    if (!selectedNode || isGeneratingEmail) return;
    const nodeData = selectedNode.data as FunnelNodeData;
    setIsGeneratingEmail(true);
    try {
      const res = await apiRequest("POST", `/api/funnels/${funnel.id}/draft-email`, {
        subject: (nodeData.emailSubject as string | undefined)?.trim() ?? "",
        emailDay: nodeData.emailDay,
        label: nodeData.label,
        nodeId: selectedNode.id,
        nodes,
        edges,
      });
      const data = await res.json() as { subject: string; body: string };
      updateSelectedNodeData({ emailSubject: data.subject, emailBody: data.body });
      toast({ title: "Email drafted!", description: "Subject and body generated — edit as needed." });
    } catch {
      toast({ title: "Draft failed", description: "Could not generate email. Try again.", variant: "destructive" });
    } finally {
      setIsGeneratingEmail(false);
    }
  }, [selectedNode, isGeneratingEmail, funnel.id, updateSelectedNodeData, toast, nodes, edges]);

  const exportPng = useCallback(async () => {
    const el = document.querySelector(".react-flow__viewport") as HTMLElement | null;
    if (!el) return;
    try {
      const dataUrl = await toPng(el, { backgroundColor: "#0f172a", quality: 1 });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${funnelName.replace(/[^a-z0-9]/gi, "_") || "funnel"}.png`;
      a.click();
    } catch {
      toast({ title: "Export failed", description: "Could not export canvas as PNG", variant: "destructive" });
    }
  }, [funnelName, toast]);

  const handleAutoLayout = useCallback(() => {
    if (nodes.length === 0) return;

    const H_GAP = 60;  // horizontal gap between nodes in the same row
    const V_GAP = 100; // vertical gap between rows

    // ── Step 1: Group nodes into rows via horizontal edges ─────────────
    // Nodes connected by left/right handles always belong in the same row,
    // regardless of where they were dragged. This prevents a node moved
    // slightly out of Y-threshold from landing in its own spurious row.

    const parent = new Map<string, string>();
    const find = (id: string): string => {
      if (!parent.has(id)) parent.set(id, id);
      if (parent.get(id) !== id) parent.set(id, find(parent.get(id)!));
      return parent.get(id)!;
    };
    const union = (a: string, b: string) => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };

    nodes.forEach((n) => find(n.id));

    edges.forEach((e) => {
      const sh = e.sourceHandle ?? "";
      const th = e.targetHandle ?? "";
      // Only horizontal handle pairs (left↔right) define same-row membership
      if ((sh === "left" || sh === "right") && (th === "left" || th === "right")) {
        union(e.source, e.target);
      }
    });

    // ── Step 2: Collect groups, sort rows top-to-bottom by avg Y ──────
    const groupMap = new Map<string, typeof nodes>();
    nodes.forEach((n) => {
      const root = find(n.id);
      if (!groupMap.has(root)) groupMap.set(root, []);
      groupMap.get(root)!.push(n);
    });

    const avgY = (group: typeof nodes) =>
      group.reduce((s, n) => s + n.position.y + (n.measured?.height ?? 160) / 2, 0) /
      group.length;

    const rows = [...groupMap.values()].sort((a, b) => avgY(a) - avgY(b));

    // ── Step 3: Lay out each row ───────────────────────────────────────
    const allCenterX =
      nodes.reduce((sum, n) => sum + n.position.x + (n.measured?.width ?? 148) / 2, 0) /
      nodes.length;

    const posMap = new Map<string, { x: number; y: number }>();
    let cursorY = 0;

    rows.forEach((row) => {
      // Sort within row by X position
      row.sort((a, b) => a.position.x - b.position.x);

      const rowHeight = Math.max(...row.map((n) => n.measured?.height ?? 160));
      const totalW =
        row.reduce((sum, n) => sum + (n.measured?.width ?? 148), 0) +
        Math.max(0, row.length - 1) * H_GAP;

      let x = allCenterX - totalW / 2;

      row.forEach((n) => {
        const w = n.measured?.width ?? 148;
        const h = n.measured?.height ?? 160;
        // Center each node vertically so all left/right handles share the
        // same Y → horizontal connections are perfectly straight lines.
        posMap.set(n.id, { x, y: cursorY + (rowHeight - h) / 2 });
        x += w + H_GAP;
      });

      cursorY += rowHeight + V_GAP;
    });

    const laid = nodes.map((n) => {
      const pos = posMap.get(n.id);
      return pos ? { ...n, position: pos } : n;
    });

    setNodes(laid);
    setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 50);
  }, [nodes, edges, setNodes, fitView]);

  const saveStatus2Icon = saveStatus === "saved"
    ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
    : saveStatus === "saving"
    ? <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" />
    : <Save className="h-3.5 w-3.5 text-amber-400" />;
  const saveStatusText = saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving…" : "Unsaved";

  return (
    <div className="flex h-full" style={{ height: "calc(100vh - 48px)" }}>
      {/* Left Palette */}
      {palettePinned && (
        <div className="w-60 shrink-0 bg-[hsl(230,45%,9%)] border-r border-white/10 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 pt-3 pb-2">
            <span className="text-xs font-semibold text-white/50 uppercase tracking-wide">Node Types</span>
            <button
              onClick={() => setPalettePinned(false)}
              className="text-white/30 hover:text-white/60"
              data-testid="button-close-palette"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1.5">
            {NODE_TYPE_LIST.map(([type, cfg]) => {
              const Icon = cfg.icon;
              return (
                <div
                  key={type}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/funnel-node-type", type);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className={`relative flex items-center gap-3 pl-4 pr-3 py-3 rounded-lg border cursor-grab active:cursor-grabbing select-none transition-all hover:border-white/25 hover:bg-white/[0.07] hover:scale-[1.01] ${cfg.bg} ${cfg.border}`}
                  data-testid={`palette-node-${type}`}
                >
                  {/* Color accent bar */}
                  <div
                    className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full"
                    style={{ background: cfg.hexColor }}
                  />
                  <Icon className={`h-5 w-5 shrink-0 ${cfg.color}`} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white/90 truncate leading-tight">{cfg.label}</div>
                    <div className="text-[10px] text-white/40 truncate mt-0.5 leading-tight">{cfg.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Canvas area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Top bar */}
        <div className="h-12 shrink-0 flex items-center gap-2 px-3 bg-[hsl(230,45%,11%)] border-b border-white/10 overflow-hidden">
          {!palettePinned && (
            <button
              onClick={() => setPalettePinned(true)}
              className="text-white/40 hover:text-white shrink-0"
              data-testid="button-open-palette"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={handleBack}
            className="text-white/40 hover:text-white shrink-0"
            data-testid="button-back-to-funnels"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          {/* Auto-sizing title — container grows with text, save status sits right beside it */}
          <div className="relative inline-flex items-center shrink min-w-0 max-w-xs">
            {/* Hidden mirror span that drives the container width */}
            <span
              aria-hidden
              className="invisible whitespace-pre text-white font-semibold text-sm px-2 h-7 pointer-events-none select-none border border-transparent"
            >{funnelName || "\u00a0"}</span>
            {/* Real input overlaid on top */}
            <input
              value={funnelName}
              onChange={(e) => { setFunnelName(e.target.value); setSaveStatus("unsaved"); }}
              className="absolute inset-0 w-full h-full bg-transparent rounded border border-white/0 hover:border-white/20 focus:border-white/30 text-white font-semibold text-sm px-2 outline-none"
              data-testid="input-funnel-name-editor"
            />
          </div>
          <span className="hidden sm:flex items-center gap-1.5 text-xs text-white/40 shrink-0">
            {saveStatus2Icon}
            {saveStatusText}
          </span>
          <div className="ml-auto shrink-0 flex items-center gap-2">
            {user?.isAdmin && (
              <button
                onClick={() => { setTemplateName(funnelName); setTemplateDesc(""); setSaveTemplateOpen(true); }}
                className="flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/35 hover:border-emerald-400/60 transition-colors"
                data-testid="button-save-as-template"
              >
                <BookMarked className="h-3.5 w-3.5" />
                Save as Template
              </button>
            )}
            <button
              onClick={() => setBrainOpen((v) => !v)}
              className={`flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium border transition-colors ${
                brainOpen
                  ? "bg-violet-500/30 border-violet-400/60 text-violet-200"
                  : "bg-indigo-500/20 border-indigo-400/40 text-indigo-200 hover:bg-indigo-500/35 hover:border-indigo-400/60"
              }`}
              data-testid="button-funnel-brain"
            >
              <Brain className="h-3.5 w-3.5" />
              Funnel Brain
            </button>
            <button
              onClick={() => setShareOpen(true)}
              className="flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 hover:bg-indigo-500/35 hover:border-indigo-400/60 transition-colors"
              data-testid="button-share-funnel"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>
            <button
              onClick={toggleCanvasTheme}
              title={canvasTheme === "dark" ? "Switch to light canvas" : "Switch to dark canvas"}
              className="flex items-center justify-center w-7 h-7 rounded-md bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 hover:bg-indigo-500/35 hover:border-indigo-400/60 transition-colors"
              data-testid="button-toggle-canvas-theme"
            >
              {canvasTheme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={exportPng}
              className="flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 hover:bg-indigo-500/35 hover:border-indigo-400/60 transition-colors"
              data-testid="button-export-png"
            >
              <Download className="h-3.5 w-3.5" />
              Export PNG
            </button>
          </div>

          {/* Save as Template Dialog (admin only) */}
          <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
            <DialogContent className="bg-[hsl(230,45%,11%)] border-white/10 text-white max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-white">
                  <BookMarked className="h-5 w-5 text-emerald-400" />
                  Save as Template
                </DialogTitle>
                <DialogDescription className="text-white/40">
                  This funnel's current canvas will be saved as a starting template for all users.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-1">
                <div>
                  <Label className="text-white/70 text-xs">Template Name</Label>
                  <Input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder={funnelName}
                    className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30"
                    data-testid="input-template-name"
                  />
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Description (optional)</Label>
                  <Textarea
                    value={templateDesc}
                    onChange={(e) => setTemplateDesc(e.target.value)}
                    placeholder="Brief description shown in the template picker..."
                    className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none h-20"
                    data-testid="input-template-description"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSaveTemplateOpen(false)} className="border-white/10 text-white/70 hover:text-white">
                  Cancel
                </Button>
                <Button
                  onClick={() => saveTemplateMutation.mutate()}
                  disabled={saveTemplateMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  data-testid="button-confirm-save-template"
                >
                  {saveTemplateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Save Template
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Share Dialog */}
          <Dialog open={shareOpen} onOpenChange={setShareOpen}>
            <DialogContent className="bg-[hsl(230,45%,11%)] border-white/10 text-white max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-white">
                  <Share2 className="h-5 w-5 text-violet-400" />
                  Share Funnel
                </DialogTitle>
                <DialogDescription className="text-white/40">
                  Create a view-only link so clients can see this funnel without an account.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-1">
                {shareToken ? (
                  <>
                    {/* Active link section */}
                    <div className="rounded-lg bg-white/[0.04] border border-white/10 p-3 space-y-2">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                        <span className="text-xs text-emerald-400 font-medium">Link active</span>
                        {hasPassword && (
                          <span className="ml-1 flex items-center gap-0.5 text-xs text-amber-400">
                            <Lock className="w-3 h-3" /> Password protected
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          readOnly
                          value={shareUrl ?? ""}
                          className="flex-1 bg-white/[0.04] border-white/10 text-white/70 text-xs h-8 font-mono"
                          data-testid="input-share-url"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCopyLink}
                          className="h-8 px-3 shrink-0 border-white/10 text-white/70 hover:text-white"
                          data-testid="button-copy-share-link"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Regenerate section */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-white/50 uppercase tracking-wide flex items-center gap-1.5">
                          <Lock className="w-3 h-3" /> Password protection
                        </Label>
                        <Switch
                          checked={usePassword}
                          onCheckedChange={setUsePassword}
                          data-testid="switch-use-password"
                        />
                      </div>
                      {usePassword && (
                        <Input
                          type="password"
                          value={sharePassword}
                          onChange={(e) => setSharePassword(e.target.value)}
                          placeholder="Set a new password"
                          className="bg-white/[0.04] border-white/10 text-white text-sm"
                          data-testid="input-share-new-password"
                        />
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleGenerateShareLink}
                        disabled={shareLoading || (usePassword && !sharePassword)}
                        className="w-full h-8 text-xs border-white/10 text-white/60 hover:text-white"
                        data-testid="button-regenerate-share-link"
                      >
                        {shareLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                        Regenerate link
                      </Button>
                    </div>

                    <div className="h-px bg-white/[0.07]" />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleRevokeShareLink}
                      disabled={shareLoading}
                      className="w-full h-8 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      data-testid="button-revoke-share-link"
                    >
                      {shareLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
                      Revoke link
                    </Button>
                  </>
                ) : (
                  <>
                    {/* No active link */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-white/50 uppercase tracking-wide flex items-center gap-1.5">
                          <Lock className="w-3 h-3" /> Password protection
                        </Label>
                        <Switch
                          checked={usePassword}
                          onCheckedChange={setUsePassword}
                          data-testid="switch-use-password"
                        />
                      </div>
                      {usePassword && (
                        <Input
                          type="password"
                          value={sharePassword}
                          onChange={(e) => setSharePassword(e.target.value)}
                          placeholder="Enter a password for this link"
                          className="bg-white/[0.04] border-white/10 text-white text-sm"
                          data-testid="input-share-password-set"
                        />
                      )}
                    </div>
                    <Button
                      onClick={handleGenerateShareLink}
                      disabled={shareLoading || (usePassword && !sharePassword)}
                      className="w-full"
                      data-testid="button-create-share-link"
                    >
                      {shareLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
                      Create share link
                    </Button>
                  </>
                )}
              </div>
              <DialogFooter className="text-[11px] text-white/25">
                Viewers can see the funnel but cannot edit it.
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* ReactFlow Canvas */}
        <div className="flex-1 relative" ref={reactFlowWrapper} onDragOver={onDragOver} onDrop={onDrop}>
          {/* Auto-arrange button — sits above the zoom controls (bottom-left) */}
          <button
            onClick={handleAutoLayout}
            title="Auto Arrange"
            className="absolute z-10 flex items-center justify-center w-7 h-7 rounded bg-[hsl(230,45%,11%)] border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-colors shadow"
            style={{ bottom: "160px", left: "10px" }}
            data-testid="button-auto-layout"
          >
            <Wand2 className="w-3.5 h-3.5" />
          </button>
          <CanvasThemeContext.Provider value={canvasTheme}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDoubleClick={onNodeDoubleClick}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={{ type: "custom", data: {} }}
              connectionMode="loose"
              snapToGrid
              snapGrid={[10, 10]}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              deleteKeyCode="Delete"
              style={{ background: canvasTheme === "light" ? "#f8fafc" : "#0d1424" }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1}
                color={canvasTheme === "light" ? "#cbd5e1" : "#1e2d4a"}
              />
              <Controls
                className={canvasTheme === "light"
                  ? "!bg-white !border-gray-200 [&>button]:!border-gray-200 [&>button]:!text-gray-500 [&>button:hover]:!bg-gray-100"
                  : "!bg-[hsl(230,45%,11%)] !border-white/10"
                }
              />
              <MiniMap
                className={canvasTheme === "light"
                  ? "!bg-gray-50 !border-gray-200"
                  : "!bg-[hsl(230,45%,9%)] !border-white/10"
                }
                nodeColor={canvasTheme === "light" ? "#6366f1" : "#6366f1"}
                maskColor={canvasTheme === "light" ? "rgba(200,210,220,0.5)" : "rgba(0,0,0,0.6)"}
              />
              {nodes.length === 0 && (
                <Panel position="top-center">
                  <div className={`text-sm mt-24 text-center select-none ${canvasTheme === "light" ? "text-gray-400" : "text-white/25"}`}>
                    Drag nodes from the left panel onto the canvas, or connect nodes by dragging between the handles
                  </div>
                </Panel>
              )}
            </ReactFlow>
          </CanvasThemeContext.Provider>
        </div>

        {/* Funnel Brain Panel - floats over canvas below toolbar */}
        {brainOpen && (
          <div className="absolute right-0 top-12 bottom-0 z-10 w-[400px]">
            <FunnelBrainPanel funnelId={funnel.id} onClose={() => setBrainOpen(false)} />
          </div>
        )}

        {/* Right Settings Panel - floats over canvas below toolbar */}
        {selectedNode && (
          <div className={`absolute top-12 bottom-0 z-10 w-[400px] overflow-y-auto bg-[hsl(230,45%,9%)] border-l border-white/10 ${brainOpen ? "right-[400px]" : "right-0"}`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-sm font-semibold text-white">Node Settings</span>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-white/30 hover:text-white"
              data-testid="button-close-node-settings"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="px-4 py-4 space-y-4">
            {/* ── Outline color picker ── */}
            {(() => {
              const SWATCH_COLORS = [
                { hex: "#38BDF8", label: "Sky"     },
                { hex: "#A78BFA", label: "Violet"  },
                { hex: "#34D399", label: "Emerald" },
                { hex: "#22D3EE", label: "Cyan"    },
                { hex: "#FCD34D", label: "Amber"   },
                { hex: "#FB7185", label: "Rose"    },
                { hex: "#818CF8", label: "Indigo"  },
                { hex: "#FB923C", label: "Orange"  },
                { hex: "#4ADE80", label: "Green"   },
                { hex: "#F472B6", label: "Pink"    },
                { hex: "#94A3B8", label: "Slate"   },
                { hex: "#FDE047", label: "Yellow"  },
                { hex: "#F87171", label: "Red"     },
                { hex: "#ffffff", label: "White"   },
              ];
              const current = (selectedNode.data as FunnelNodeData).accentColor as string | undefined;
              return (
                <div>
                  <Label className="text-xs text-white/50 uppercase tracking-wide">Color</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {/* Reset to default */}
                    <button
                      title="Default color"
                      onClick={() => updateSelectedNodeData({ accentColor: undefined })}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${!current ? "border-white/80 scale-110" : "border-white/20 hover:border-white/50"} bg-white/10`}
                      data-testid="button-accent-color-default"
                    >
                      <X className="w-3 h-3 text-white/50" />
                    </button>
                    {SWATCH_COLORS.map(({ hex, label }) => (
                      <button
                        key={hex}
                        title={label}
                        onClick={() => updateSelectedNodeData({ accentColor: hex })}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${current === hex ? "border-white scale-110 shadow-lg" : "border-transparent hover:scale-105 hover:border-white/40"}`}
                        style={{ background: hex }}
                        data-testid={`button-accent-color-${label.toLowerCase()}`}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}
            {(selectedNode.data as FunnelNodeData).nodeType === "trafficSource" && (() => {
              const nd = selectedNode.data as FunnelNodeData;
              const platforms: string[] = (nd.trafficPlatforms as string[] | undefined) ||
                (nd.trafficPlatform ? [nd.trafficPlatform as string] : []);
              const togglePlatform = (key: string) => {
                const idx = platforms.indexOf(key);
                let next: string[];
                if (idx >= 0) {
                  next = platforms.filter(x => x !== key);
                } else if (platforms.length < 4) {
                  next = [...platforms, key];
                } else {
                  return;
                }
                const autoLabel = next.length === 0
                  ? "Traffic Source"
                  : next.length === 1
                    ? (TRAFFIC_PLATFORMS[next[0]]?.label ?? next[0])
                    : "Multiple Sources";
                // Setting from the panel always closes the inline picker
                updateSelectedNodeData({ trafficPlatforms: next, trafficPlatform: next[0] || undefined, label: autoLabel, pickingMode: false });
              };
              return (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs text-white/50 uppercase tracking-wide">Traffic Sources</Label>
                    <span className="text-[10px] text-white/30">{platforms.length} / 4</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {Object.entries(TRAFFIC_PLATFORMS).map(([key, cfg]) => {
                      const active = platforms.includes(key);
                      const atMax = platforms.length >= 4 && !active;
                      return (
                        <button
                          key={key}
                          title={cfg.label}
                          onClick={() => togglePlatform(key)}
                          disabled={atMax}
                          className={`flex flex-col items-center gap-0.5 rounded-lg p-1.5 transition-colors border ${active ? "border-sky-400/60 bg-sky-500/15" : atMax ? "border-white/5 opacity-30 cursor-not-allowed" : "border-white/10 hover:bg-white/8"}`}
                          data-testid={`button-platform-${key}`}
                        >
                          <cfg.Icon style={{ color: cfg.color, fontSize: 16 }} />
                          <span className="text-[8px] text-white/50 leading-none truncate w-full text-center">{cfg.label.split(" ")[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                  {platforms.length > 0 && (
                    <button
                      onClick={() => updateSelectedNodeData({ trafficPlatforms: [], trafficPlatform: undefined, label: "Traffic Source" })}
                      className="mt-1.5 text-[10px] text-white/30 hover:text-white/60 transition-colors"
                      data-testid="button-clear-platform"
                    >
                      ✕ Clear all
                    </button>
                  )}
                </div>
              );
            })()}
            {/* ── Delay node fields ── */}
            {(selectedNode.data as FunnelNodeData).nodeType === "delay" && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-white/50 uppercase tracking-wide">Delay Amount</Label>
                  <Input
                    type="number"
                    min={1}
                    value={(selectedNode.data as FunnelNodeData).delayAmount ?? 1}
                    onChange={(e) => updateSelectedNodeData({ delayAmount: e.target.value ? Math.max(1, Number(e.target.value)) : 1 })}
                    className="mt-1 bg-white/[0.04] border-white/10 text-white text-sm"
                    placeholder="e.g. 3"
                    data-testid="input-delay-amount"
                  />
                </div>
                <div>
                  <Label className="text-xs text-white/50 uppercase tracking-wide">Unit</Label>
                  <div className="flex gap-1.5 mt-1.5">
                    {(["minutes", "hours", "days", "weeks"] as const).map((u) => {
                      const active = ((selectedNode.data as FunnelNodeData).delayUnit ?? "days") === u;
                      return (
                        <button
                          key={u}
                          onClick={() => updateSelectedNodeData({ delayUnit: u })}
                          className={`flex-1 py-1.5 rounded-md text-xs font-medium border transition-colors capitalize ${
                            active
                              ? "bg-amber-500/25 border-amber-400/70 text-amber-200"
                              : "bg-white/[0.04] border-white/10 text-white/50 hover:text-white hover:border-white/25"
                          }`}
                          data-testid={`button-delay-unit-${u}`}
                        >
                          {u}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-white/50 uppercase tracking-wide">Notes</Label>
                  <Textarea
                    value={(selectedNode.data as FunnelNodeData).notes || ""}
                    onChange={(e) => updateSelectedNodeData({ notes: e.target.value })}
                    className="mt-1 bg-white/[0.04] border-white/10 text-white text-sm resize-none h-20"
                    placeholder="Internal notes about this delay..."
                    data-testid="input-delay-notes"
                  />
                </div>
              </div>
            )}
            {/* ── Email node fields ── */}
            {(selectedNode.data as FunnelNodeData).nodeType === "emailNode" && (
              <>
                <div>
                  <Label className="text-xs text-white/50 uppercase tracking-wide">Day / Send Delay</Label>
                  <Input
                    type="number"
                    min={1}
                    value={(selectedNode.data as FunnelNodeData).emailDay ?? ""}
                    onChange={(e) => updateSelectedNodeData({ emailDay: e.target.value ? Number(e.target.value) : undefined })}
                    className="mt-1 bg-white/[0.04] border-white/10 text-white text-sm"
                    placeholder="e.g. 1"
                    data-testid="input-email-day"
                  />
                  <p className="text-[10px] text-white/25 mt-1 leading-snug">Which day in the sequence this sends.</p>
                </div>

                {/* AI Draft button — generates subject + body together */}
                <Button
                  size="sm"
                  onClick={handleDraftEmail}
                  disabled={isGeneratingEmail}
                  className="w-full gap-1.5 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 hover:text-cyan-200 border border-cyan-500/20 hover:border-cyan-400/30 transition-colors"
                  data-testid="button-ai-draft-email"
                >
                  {isGeneratingEmail
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                    : <><Sparkles className="w-3.5 h-3.5" /> AI Draft Subject + Body</>}
                </Button>

                <div>
                  <Label className="text-xs text-white/50 uppercase tracking-wide">Subject Line</Label>
                  <Input
                    value={((selectedNode.data as FunnelNodeData).emailSubject as string) || ""}
                    onChange={(e) => updateSelectedNodeData({ emailSubject: e.target.value })}
                    className="mt-1 bg-white/[0.04] border-white/10 text-white text-sm"
                    placeholder="Your subject line…"
                    data-testid="input-email-subject"
                  />
                </div>
                <div>
                  <Label className="text-xs text-white/50 uppercase tracking-wide">Email Body</Label>
                  <Textarea
                    value={((selectedNode.data as FunnelNodeData).emailBody as string) || ""}
                    onChange={(e) => updateSelectedNodeData({ emailBody: e.target.value })}
                    className="mt-1 bg-white/[0.04] border-white/10 text-white text-sm resize-none"
                    style={{ minHeight: 200 }}
                    placeholder="Click AI Draft above to generate, or write your email here…"
                    data-testid="input-email-body"
                  />
                </div>
              </>
            )}
            {(selectedNode.data as FunnelNodeData).nodeType !== "trafficSource" &&
             (selectedNode.data as FunnelNodeData).nodeType !== "note" &&
             (selectedNode.data as FunnelNodeData).nodeType !== "emailNode" &&
             (selectedNode.data as FunnelNodeData).nodeType !== "delay" && (
              <div>
                <Label className="text-xs text-white/50 uppercase tracking-wide">Page Preview</Label>
                <div className="mt-2 space-y-2">
                  {(selectedNode.data as FunnelNodeData).pagePreviewUrl && (
                    <div className="relative rounded-md overflow-hidden border border-white/10">
                      <img
                        src={(selectedNode.data as FunnelNodeData).pagePreviewUrl}
                        alt="Page preview"
                        className="w-full object-cover object-top"
                        style={{ height: 112 }}
                      />
                      <button
                        onClick={() => updateSelectedNodeData({ pagePreviewUrl: undefined, pageUrl: undefined })}
                        className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-red-500/80 text-white/70 hover:text-white rounded-full w-5 h-5 flex items-center justify-center transition-colors"
                        title="Remove preview"
                        data-testid="button-remove-preview"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <Input
                      type="url"
                      value={(selectedNode.data as FunnelNodeData).pageUrl || ""}
                      onChange={(e) => updateSelectedNodeData({ pageUrl: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") generatePreview(); }}
                      placeholder="https://yourpage.com"
                      className="flex-1 bg-white/[0.04] border-white/10 text-white text-xs h-8 min-w-0"
                      data-testid="input-node-page-url"
                    />
                    <Button
                      size="sm"
                      onClick={generatePreview}
                      disabled={isGeneratingPreview || !(selectedNode.data as FunnelNodeData).pageUrl}
                      className="h-8 px-2.5 shrink-0"
                      title="Capture page screenshot"
                      data-testid="button-generate-preview"
                    >
                      {isGeneratingPreview
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Camera className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                  <p className="text-[10px] text-white/25 leading-snug">
                    Paste your page URL and click <Camera className="inline w-2.5 h-2.5 mx-0.5 mb-0.5" /> to snapshot it onto the node.
                  </p>
                  <div className="flex items-center gap-2 pt-0.5">
                    <div className="flex-1 h-px bg-white/[0.07]" />
                    <span className="text-[10px] text-white/25 shrink-0">or</span>
                    <div className="flex-1 h-px bg-white/[0.07]" />
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                    data-testid="input-node-image-upload"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-8 bg-white/[0.03] border-white/10 hover:bg-white/[0.07] text-white/60 hover:text-white text-xs gap-1.5"
                    data-testid="button-upload-image"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    Upload your own image
                  </Button>
                </div>
              </div>
            )}
            {(selectedNode.data as FunnelNodeData).nodeType !== "delay" && (
              <>
                <div>
                  <Label className="text-xs text-white/50 uppercase tracking-wide">Label</Label>
                  <Input
                    value={(selectedNode.data as FunnelNodeData).label || ""}
                    onChange={(e) => updateSelectedNodeData({ label: e.target.value })}
                    className="mt-1 bg-white/[0.04] border-white/10 text-white text-sm"
                    data-testid="input-node-label"
                  />
                </div>
                <div>
                  <Label className="text-xs text-white/50 uppercase tracking-wide">Description</Label>
                  <Textarea
                    value={(selectedNode.data as FunnelNodeData).description || ""}
                    onChange={(e) => updateSelectedNodeData({ description: e.target.value })}
                    className="mt-1 bg-white/[0.04] border-white/10 text-white text-sm resize-none h-20"
                    placeholder="Brief description..."
                    data-testid="input-node-description"
                  />
                </div>
                <div>
                  <Label className="text-xs text-white/50 uppercase tracking-wide">Notes</Label>
                  <Textarea
                    value={(selectedNode.data as FunnelNodeData).notes || ""}
                    onChange={(e) => updateSelectedNodeData({ notes: e.target.value })}
                    className="mt-1 bg-white/[0.04] border-white/10 text-white text-sm resize-none h-24"
                    placeholder="Internal notes..."
                    data-testid="input-node-notes"
                  />
                </div>
              </>
            )}
            {/* Traffic source: estimated visitors + cost per click */}
            {(selectedNode.data as FunnelNodeData).nodeType === "trafficSource" && (
              <>
                <div>
                  <Label className="text-xs text-white/50 uppercase tracking-wide">Est. Visitors / Day</Label>
                  <Input
                    type="number"
                    min={0}
                    value={(selectedNode.data as FunnelNodeData).estimatedTraffic ?? ""}
                    onChange={(e) => updateSelectedNodeData({ estimatedTraffic: e.target.value ? Number(e.target.value) : undefined })}
                    className="mt-1 bg-white/[0.04] border-white/10 text-white text-sm"
                    placeholder="e.g. 500"
                    data-testid="input-node-traffic"
                  />
                </div>
                <div>
                  <Label className="text-xs text-white/50 uppercase tracking-wide">Cost Per Click ($)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={(selectedNode.data as FunnelNodeData).costPerClick ?? ""}
                    onChange={(e) => updateSelectedNodeData({ costPerClick: e.target.value ? Number(e.target.value) : undefined })}
                    className="mt-1 bg-white/[0.04] border-white/10 text-white text-sm"
                    placeholder="e.g. 1.25"
                    data-testid="input-node-cpc"
                  />
                  <p className="text-[10px] text-white/25 mt-1 leading-snug">Average cost per visitor from this source.</p>
                </div>
              </>
            )}
            {/* Page nodes: conversion rate (how many visitors take the next step) */}
            {(selectedNode.data as FunnelNodeData).nodeType !== "trafficSource" &&
             (selectedNode.data as FunnelNodeData).nodeType !== "emailNode" &&
             (selectedNode.data as FunnelNodeData).nodeType !== "note" &&
             (selectedNode.data as FunnelNodeData).nodeType !== "delay" && (
              <div>
                <Label className="text-xs text-white/50 uppercase tracking-wide">Conversion Rate (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={(selectedNode.data as FunnelNodeData).conversionRate ?? ""}
                  onChange={(e) => updateSelectedNodeData({ conversionRate: e.target.value ? Number(e.target.value) : undefined })}
                  className="mt-1 bg-white/[0.04] border-white/10 text-white text-sm"
                  placeholder="e.g. 35"
                  data-testid="input-node-conversion"
                />
                <p className="text-[10px] text-white/25 mt-1 leading-snug">% of visitors who take the next step from this page.</p>
              </div>
            )}
            <div className="pt-2 border-t border-white/10">
              <p className="text-xs text-white/30">
                <strong className="text-white/50">Tip:</strong> Click a connection arrow to toggle Yes / No path labels.
              </p>
            </div>
          </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FunnelPlannerEditor() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const { data: funnel, isLoading, isError } = useQuery<Funnel>({
    queryKey: ["/api/funnels", params.id],
    queryFn: async () => {
      const res = await fetch(`/api/funnels/${params.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height: "calc(100vh - 48px)" }}>
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
      </div>
    );
  }

  if (isError || !funnel) {
    return (
      <div className="flex flex-col items-center justify-center gap-4" style={{ height: "calc(100vh - 48px)" }}>
        <p className="text-white/50">Funnel not found.</p>
        <Button variant="outline" onClick={() => setLocation("/funnel-grid")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Funnel Grid
        </Button>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <EditorInner funnel={funnel} />
    </ReactFlowProvider>
  );
}
