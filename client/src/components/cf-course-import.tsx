/**
 * CourseImportCard — 4-step UI for importing ClickFunnels course content
 * into the academy: Browse → Fetch & Select → Destination → Preview & Import.
 */

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FileText,
  BookOpen,
  Download,
  CheckSquare,
  Square,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Upload,
  ExternalLink,
} from "lucide-react";

// ─── Local types (mirrors server CfTreeNode) ──────────────────────────────────

interface CfCourse {
  id: string;
  name: string;
}

interface CfTreeNode {
  type: "module" | "lesson";
  cfId: string;
  title: string;
  published: boolean;
  sortOrder: number;
  videoUrl?: string;
  content?: string | null;
  thumbnailUrl?: string | null;
  resources?: Array<{ name: string; url: string; kind: "link" | "pdf" }>;
  recoveryStatus?: "recovered" | "partial" | "unavailable";
  sourceUrl?: string | null;
  children: CfTreeNode[];
}

interface CfCourseStructure {
  cfCourseId: string;
  cfCourseTitle: string;
  roots: CfTreeNode[];
  totalSections: number;
  totalLessons: number;
  videosFound: number;
  videosUnavailable: number;
  contentRecovered: number;
  contentPartial: number;
  contentUnavailable: number;
}

interface FinalTreeNode extends CfTreeNode {
  isBonus?: boolean;
  children: FinalTreeNode[];
}

interface ImportResult {
  destination: "course" | "training-library";
  created: number;
  updated: number;
  wrappedLessons: number;
  courseId?: string;
  courseName?: string;
  replayCount?: number;
  videosImported: number;
  videosSkipped: number;
  videosUnavailable: number;
  contentImported?: number;
  contentSkipped?: number;
  resourcesImported?: number;
}

interface ImportError {
  row: number;
  message: string;
}

type ImportDestination = {
  type: "new" | "existing" | "training-library";
  title: string;
  existingCourseId: string;
  promote: boolean;
};

// ─── Tree helpers ─────────────────────────────────────────────────────────────

function getAllNodeIds(nodes: CfTreeNode[]): string[] {
  const ids: string[] = [];
  const walk = (n: CfTreeNode) => {
    ids.push(n.cfId);
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return ids;
}

function getAllModuleIds(nodes: CfTreeNode[]): string[] {
  const ids: string[] = [];
  const walk = (n: CfTreeNode) => {
    if (n.type === "module") {
      ids.push(n.cfId);
      n.children.forEach(walk);
    }
  };
  nodes.forEach(walk);
  return ids;
}

function getDescendantIds(node: CfTreeNode): string[] {
  const ids: string[] = [];
  const walk = (n: CfTreeNode) =>
    n.children.forEach((c) => {
      ids.push(c.cfId);
      walk(c);
    });
  walk(node);
  return ids;
}

type CheckState = "checked" | "indeterminate" | "forced" | "unchecked";

function getCheckState(node: CfTreeNode, sel: Set<string>): CheckState {
  if (node.type === "lesson") return sel.has(node.cfId) ? "checked" : "unchecked";
  const selfSel = sel.has(node.cfId);
  const descIds = getDescendantIds(node);
  if (descIds.length === 0) return selfSel ? "checked" : "unchecked";
  const selCount = descIds.filter((id) => sel.has(id)).length;
  if (selfSel && selCount === descIds.length) return "checked";
  if (selfSel) return "indeterminate";
  if (selCount > 0) return "forced";
  return "unchecked";
}

function toggleNode(node: CfTreeNode, sel: Set<string>): Set<string> {
  const next = new Set(sel);
  if (node.type === "lesson") {
    if (next.has(node.cfId)) next.delete(node.cfId);
    else next.add(node.cfId);
    return next;
  }
  const allIds = [node.cfId, ...getDescendantIds(node)];
  const allSelected = allIds.every((id) => next.has(id));
  if (allSelected) allIds.forEach((id) => next.delete(id));
  else allIds.forEach((id) => next.add(id));
  return next;
}

/** Keep only selected nodes and necessary ancestor containers. */
function filterTree(nodes: CfTreeNode[], sel: Set<string>): CfTreeNode[] {
  const out: CfTreeNode[] = [];
  for (const node of nodes) {
    if (node.type === "lesson") {
      if (sel.has(node.cfId)) out.push({ ...node });
    } else if (sel.has(node.cfId)) {
      // Selected module: include with its full subtree
      out.push({ ...node });
    } else {
      // Structural ancestor: include only if it has selected descendants
      const filteredChildren = filterTree(node.children, sel);
      if (filteredChildren.length > 0) out.push({ ...node, children: filteredChildren });
    }
  }
  return out;
}

/** Wrap consecutive loose root-level lessons in a "Bonus" module. */
function applyBonusWrapping(nodes: CfTreeNode[]): FinalTreeNode[] {
  const out: FinalTreeNode[] = [];
  let bonusBuf: CfTreeNode[] = [];

  const flushBonus = () => {
    if (!bonusBuf.length) return;
    out.push({
      type: "module",
      cfId: "__bonus__",
      title: "Bonus",
      published: true,
      sortOrder: -1,
      isBonus: true,
      children: bonusBuf.map((l) => ({
        ...l,
        isBonus: false,
        children: [] as FinalTreeNode[],
      })) as FinalTreeNode[],
    });
    bonusBuf = [];
  };

  for (const node of nodes) {
    if (node.type === "lesson") {
      bonusBuf.push(node);
    } else {
      flushBonus();
      out.push({
        ...node,
        isBonus: false,
        children: node.children as FinalTreeNode[],
      });
    }
  }
  flushBonus();
  return out;
}

function countFinalNodes(nodes: FinalTreeNode[]): {
  modules: number;
  lessons: number;
} {
  let modules = 0,
    lessons = 0;
  const walk = (n: FinalTreeNode) => {
    if (n.type === "lesson") lessons++;
    else {
      modules++;
      n.children.forEach(walk);
    }
  };
  nodes.forEach(walk);
  return { modules, lessons };
}

function countLessonVideos(nodes: CfTreeNode[]): {
  found: number;
  unavailable: number;
} {
  let found = 0;
  let unavailable = 0;
  const walk = (node: CfTreeNode) => {
    if (node.type === "lesson") {
      if (node.videoUrl) found++;
      else unavailable++;
      return;
    }
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return { found, unavailable };
}

function countRecoveredContent(nodes: CfTreeNode[]) {
  const counts = { recovered: 0, partial: 0, unavailable: 0, resources: 0 };
  const walk = (node: CfTreeNode) => {
    if (node.type === "lesson") {
      counts[node.recoveryStatus ?? "unavailable"]++;
      counts.resources += node.resources?.length ?? 0;
      return;
    }
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return counts;
}

function countSelectedNodes(
  sel: Set<string>,
  roots: CfTreeNode[],
): { modules: number; lessons: number } {
  let modules = 0,
    lessons = 0;
  const walk = (n: CfTreeNode) => {
    if (sel.has(n.cfId)) {
      if (n.type === "lesson") lessons++;
      else modules++;
    }
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return { modules, lessons };
}

// ─── Tree node renderers ──────────────────────────────────────────────────────

function CfCheckboxNode({
  node,
  sel,
  expanded,
  depth,
  onToggle,
  onExpand,
}: {
  node: CfTreeNode;
  sel: Set<string>;
  expanded: Set<string>;
  depth: number;
  onToggle: (n: CfTreeNode) => void;
  onExpand: (id: string) => void;
}) {
  const indent = depth * 18 + 4;

  if (node.type === "lesson") {
    return (
      <div
        className="flex items-center gap-2 py-[3px] px-1 rounded-sm hover:bg-muted/40 select-none"
        style={{ paddingLeft: `${indent + 20}px` }}
      >
        <Checkbox
          checked={sel.has(node.cfId)}
          onCheckedChange={() => onToggle(node)}
          className="flex-shrink-0 h-3.5 w-3.5"
        />
        <FileText className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <span className="text-xs truncate flex-1 min-w-0">{node.title}</span>
        {!node.published && (
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-1 flex-shrink-0 border-amber-300 text-amber-600 dark:text-amber-400"
          >
            Draft
          </Badge>
        )}
      </div>
    );
  }

  const state = getCheckState(node, sel);
  const isOpen = expanded.has(node.cfId);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-[3px] px-1 rounded-sm hover:bg-muted/40 select-none"
        style={{ paddingLeft: `${indent}px` }}
      >
        <button
          className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground flex-shrink-0"
          onClick={() => onExpand(node.cfId)}
        >
          {hasChildren ? (
            isOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )
          ) : (
            <span className="w-3.5 inline-block" />
          )}
        </button>
        <Checkbox
          checked={
            state === "checked" || state === "forced"
              ? true
              : state === "indeterminate"
                ? "indeterminate"
                : false
          }
          className={`flex-shrink-0 h-3.5 w-3.5 ${state === "forced" ? "opacity-40" : ""}`}
          onCheckedChange={() => onToggle(node)}
        />
        <FolderOpen className="h-3 w-3 text-muted-foreground/60 flex-shrink-0" />
        <span className="text-xs font-semibold truncate flex-1 min-w-0">
          {node.title}
        </span>
        {!node.published && (
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-1 flex-shrink-0 border-amber-300 text-amber-600 dark:text-amber-400"
          >
            Draft
          </Badge>
        )}
      </div>
      {isOpen &&
        node.children.map((child) => (
          <CfCheckboxNode
            key={child.cfId}
            node={child}
            sel={sel}
            expanded={expanded}
            depth={depth + 1}
            onToggle={onToggle}
            onExpand={onExpand}
          />
        ))}
    </div>
  );
}

function PreviewNode({
  node,
  depth,
}: {
  node: FinalTreeNode;
  depth: number;
}) {
  const [open, setOpen] = useState(true);
  const indent = depth * 18 + 4;

  if (node.type === "lesson") {
    return (
      <div
        className="flex items-center gap-1.5 py-[3px] text-xs text-muted-foreground"
        style={{ paddingLeft: `${indent + 20}px` }}
      >
        <FileText className="h-3 w-3 flex-shrink-0" />
        <span className="truncate flex-1 min-w-0">{node.title}</span>
        {!node.published && (
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-1 flex-shrink-0 border-amber-300 text-amber-600 dark:text-amber-400"
          >
            Draft
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-[3px] cursor-pointer select-none"
        style={{ paddingLeft: `${indent}px` }}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        )}
        {node.isBonus ? (
          <Sparkles className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
        ) : (
          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
        )}
        <span
          className={`text-xs font-semibold truncate flex-1 min-w-0 ${node.isBonus ? "text-amber-700 dark:text-amber-400" : ""}`}
        >
          {node.title}
          {node.isBonus && (
            <span className="ml-1 font-normal text-muted-foreground">
              (auto-wrapped)
            </span>
          )}
        </span>
        {!node.published && !node.isBonus && (
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-1 flex-shrink-0 border-amber-300 text-amber-600 dark:text-amber-400"
          >
            Draft
          </Badge>
        )}
        <span className="text-[10px] text-muted-foreground ml-1.5 flex-shrink-0">
          {node.children.length}
        </span>
      </div>
      {open &&
        node.children.map((child, i) => (
          <PreviewNode key={i} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Step =
  | "idle"
  | "loading-courses"
  | "browsing"
  | "loading-structure"
  | "selecting"
  | "destination"
  | "preview"
  | "importing"
  | "done";

export function CourseImportCard() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("idle");
  const [cfCourses, setCfCourses] = useState<CfCourse[]>([]);
  const [progressMsg, setProgressMsg] = useState("");
  const [structure, setStructure] = useState<CfCourseStructure | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [destination, setDestination] = useState<ImportDestination>({
    type: "training-library",
    title: "",
    existingCourseId: "",
    promote: false,
  });
  const [confirmedDestination, setConfirmedDestination] =
    useState<ImportDestination | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [customCourseId, setCustomCourseId] = useState("");

  // Fetch existing courses for the "add to existing" picker
  const { data: existingCourses } = useQuery<
    Array<{ id: string; title: string }>
  >({
    queryKey: ["/api/admin/courses"],
    enabled: step === "destination",
  });

  // ── Load CF course list ───────────────────────────────────────────────────

  const loadCourses = useCallback(async () => {
    setStep("loading-courses");
    try {
      const res = await fetch("/api/admin/cf/import/courses", {
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCfCourses(data.courses ?? []);
      setStep("browsing");
    } catch (err: any) {
      toast({
        title: "Failed to load courses",
        description: err.message,
        variant: "destructive",
      });
      setStep("idle");
    }
  }, [toast]);

  // ── Fetch structure via SSE ───────────────────────────────────────────────

  const fetchStructure = useCallback(
    async (course: CfCourse) => {
      setStep("loading-structure");
      setProgressMsg("Connecting...");

      try {
        const res = await fetch(
          `/api/admin/cf/import/courses/${course.id}/structure`,
          { credentials: "include" },
        );
        if (!res.ok || !res.body)
          throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          // SSE events are delimited by double newline
          const events = buf.split("\n\n");
          buf = events.pop() ?? "";

          for (const event of events) {
            const dataLine = event
              .split("\n")
              .find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            try {
              const d = JSON.parse(dataLine.slice(6));
              if (d.type === "progress") {
                setProgressMsg(d.message);
              } else if (d.type === "done") {
                const s: CfCourseStructure = {
                  ...d.structure,
                  cfCourseTitle: course.name,
                };
                setStructure(s);
                setSelectedIds(new Set(getAllNodeIds(s.roots)));
                setExpanded(new Set(s.roots.map((n) => n.cfId)));
                setDestination((prev) => ({ ...prev, title: course.name }));
                setStep("selecting");
              } else if (d.type === "error") {
                throw new Error(d.message);
              }
            } catch {
              // ignore parse errors on incomplete chunks
            }
          }
        }
      } catch (err: any) {
        toast({
          title: "Failed to load course structure",
          description: err.message,
          variant: "destructive",
        });
        setStep("browsing");
      }
    },
    [toast],
  );

  // ── Selection helpers ─────────────────────────────────────────────────────

  const handleToggle = useCallback(
    (node: CfTreeNode) => setSelectedIds((prev) => toggleNode(node, prev)),
    [],
  );

  const handleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (!structure) return;
    setSelectedIds(new Set(getAllNodeIds(structure.roots)));
  }, [structure]);

  const deselectAll = useCallback(() => setSelectedIds(new Set()), []);

  const expandAll = useCallback(() => {
    if (!structure) return;
    setExpanded(new Set(getAllModuleIds(structure.roots)));
  }, [structure]);

  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  // ── Execute import ────────────────────────────────────────────────────────

  const runImport = useCallback(
    async (tree: CfTreeNode[]) => {
      const target = confirmedDestination;
      if (!target) {
        toast({
          title: "Choose an import destination",
          description: "Review and confirm where this content should go before importing.",
          variant: "destructive",
        });
        setStep("destination");
        return;
      }
      if (target.type === "existing" && !target.existingCourseId) {
        toast({
          title: "Choose an existing course",
          description: "Select the course that should receive this content.",
          variant: "destructive",
        });
        setStep("destination");
        return;
      }
      setStep("importing");
      setImportErrors([]);
      try {
        const res = await fetch("/api/admin/cf/import/execute", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cfCourseTitle: structure?.cfCourseTitle ?? "",
            cfCourseId: structure?.cfCourseId ?? "",
            filteredTree: tree,
            destination: {
              type: target.type,
              title: target.title,
              existingCourseId:
                target.existingCourseId || undefined,
            },
            promote: target.promote,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          const details = Array.isArray(data.errors)
            ? data.errors
              .map((error: ImportError) => `${error.row > 0 ? `Row ${error.row}: ` : ""}${error.message}`)
              .join(" ")
            : "";
          setImportErrors(Array.isArray(data.errors) ? data.errors : []);
          throw new Error([data.message ?? "Import failed", details].filter(Boolean).join(" "));
        }
        setImportResult(data);
        setStep("done");
      } catch (err: any) {
        toast({
          title: "Import failed",
          description: err.message,
          variant: "destructive",
        });
        setStep("preview");
      }
    },
    [structure, confirmedDestination, toast],
  );

  // ── Reset ─────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setStep("idle");
    setCfCourses([]);
    setStructure(null);
    setSelectedIds(new Set());
    setExpanded(new Set());
    setImportResult(null);
    setImportErrors([]);
    setConfirmedDestination(null);
    setDestination({
      type: "training-library",
      title: "",
      existingCourseId: "",
      promote: false,
    });
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────

  const filteredTree = structure
    ? filterTree(structure.roots, selectedIds)
    : [];
  const canPromote =
    filteredTree.length === 1 && filteredTree[0]?.type === "module";

  const finalTree: FinalTreeNode[] = (() => {
    if (!filteredTree.length) return [];
    let roots = filteredTree;
    if (destination.promote && canPromote) {
      roots = filteredTree[0].children;
    }
    return applyBonusWrapping(roots);
  })();
  const finalCounts = countFinalNodes(finalTree);
  const selectedVideoCounts = countLessonVideos(filteredTree);
  const selectedContentCounts = countRecoveredContent(filteredTree);
  const selCounts = structure
    ? countSelectedNodes(selectedIds, structure.roots)
    : { modules: 0, lessons: 0 };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Card className="overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-violet-500 to-fuchsia-500" />
      <CardHeader className="pt-4 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-violet-500" />
          ClickFunnels Import
        </CardTitle>
        <CardDescription>
          Browse your ClickFunnels course and selectively import sections and
          lessons into either a course or the standalone training library.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* idle */}
        {step === "idle" && (
          <Button onClick={loadCourses} className="gap-2">
            <Download className="h-4 w-4" />
            Load Courses from ClickFunnels
          </Button>
        )}

        {/* loading-courses */}
        {step === "loading-courses" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading courses...
          </div>
        )}

        {/* browsing */}
        {step === "browsing" && (
          <div className="space-y-4">
            {/* Configured courses */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Your configured course
              </p>
              <div className="divide-y rounded-md border bg-card">
                {cfCourses.map((course) => (
                  <div
                    key={course.id}
                    className="flex items-center justify-between px-3 py-2.5 gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{course.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{course.id}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => fetchStructure(course)}
                      className="flex-shrink-0 gap-1.5"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      Select
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Manual lookup */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Import a different course by ID
              </p>
              <p className="text-xs text-muted-foreground">
                Find the public ID in your CF course URL, e.g.{" "}
                <span className="font-mono bg-muted px-1 rounded">
                  /courses/<strong>elXgXp</strong>
                </span>
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. elXgXp"
                  value={customCourseId}
                  onChange={(e) => setCustomCourseId(e.target.value.trim())}
                  className="font-mono text-sm h-8"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customCourseId) {
                      fetchStructure({ id: customCourseId, name: customCourseId });
                    }
                  }}
                />
                <Button
                  size="sm"
                  disabled={!customCourseId}
                  onClick={() => fetchStructure({ id: customCourseId, name: customCourseId })}
                  className="gap-1.5 flex-shrink-0"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  Fetch
                </Button>
              </div>
            </div>

            <Button
              size="sm"
              variant="ghost"
              onClick={reset}
              className="gap-1.5 text-muted-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Start over
            </Button>
          </div>
        )}

        {/* loading-structure */}
        {step === "loading-structure" && (
          <div className="flex items-center gap-2.5 text-sm py-2">
            <Loader2 className="h-4 w-4 animate-spin text-violet-500 flex-shrink-0" />
            <span className="text-muted-foreground">{progressMsg}</span>
          </div>
        )}

        {/* selecting */}
        {step === "selecting" && structure && (
          <div className="space-y-3">
            {/* Header row */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-semibold">{structure.cfCourseTitle}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {structure.totalSections} sections ·{" "}
                  {structure.totalLessons} lessons
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {structure.videosFound} Vimeo video{structure.videosFound !== 1 ? "s" : ""} found ·{" "}
                  {structure.videosUnavailable} unavailable
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={selectAll}
                  className="h-7 text-xs gap-1"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  All
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={deselectAll}
                  className="h-7 text-xs gap-1"
                >
                  <Square className="h-3.5 w-3.5" />
                  None
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={expandAll}
                  className="h-7 text-xs"
                >
                  Expand
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={collapseAll}
                  className="h-7 text-xs"
                >
                  Collapse
                </Button>
              </div>
            </div>

            {/* Selection summary */}
            <p className="text-xs bg-muted/40 rounded-md px-2.5 py-1.5">
              <span className="font-semibold text-foreground">
                {selCounts.modules}
              </span>{" "}
              module{selCounts.modules !== 1 ? "s" : ""} ·{" "}
              <span className="font-semibold text-foreground">
                {selCounts.lessons}
              </span>{" "}
                lesson{selCounts.lessons !== 1 ? "s" : ""} selected ·{" "}
                <span className="font-semibold text-foreground">
                  {selectedVideoCounts.found}
                </span>{" "}
                video{selectedVideoCounts.found !== 1 ? "s" : ""} ready ·{" "}
                <span className="font-semibold text-foreground">{selectedContentCounts.recovered}</span>{" "}
                full and <span className="font-semibold text-foreground">{selectedContentCounts.partial}</span>{" "}
                partial content recoveries
            </p>

            {/* Tree */}
            <ScrollArea className="h-80 border rounded-md p-1 bg-card">
              {structure.roots.map((node) => (
                <CfCheckboxNode
                  key={node.cfId}
                  node={node}
                  sel={selectedIds}
                  expanded={expanded}
                  depth={0}
                  onToggle={handleToggle}
                  onExpand={handleExpand}
                />
              ))}
            </ScrollArea>

            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setStep("browsing")}
                className="gap-1.5 text-muted-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </Button>
              <Button
                size="sm"
                onClick={() => setStep("destination")}
                disabled={selectedIds.size === 0}
                className="gap-1.5"
              >
                Choose Destination
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* destination */}
        {step === "destination" && (
          <div className="space-y-4">
            <p className="text-sm font-semibold">Where should the content go?</p>

            {/* Training library or course destination */}
            <div className="space-y-2.5">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="destType"
                  value="training-library"
                  checked={destination.type === "training-library"}
                  onChange={() =>
                    setDestination((p) => ({ ...p, type: "training-library", promote: false }))
                  }
                  className="mt-0.5 accent-violet-600"
                />
                <div className="flex-1 space-y-1">
                  <span className="text-sm font-medium">Import into training library</span>
                  <p className="text-xs text-muted-foreground">
                    Each selected lesson becomes a standalone draft replay, in the
                    same order as the ClickFunnels course.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="destType"
                  value="new"
                  checked={destination.type === "new"}
                  onChange={() =>
                    setDestination((p) => ({ ...p, type: "new" }))
                  }
                  className="mt-0.5 accent-violet-600"
                />
                <div className="flex-1 space-y-1.5">
                  <span className="text-sm font-medium">Create new course</span>
                  {destination.type === "new" && (
                    <input
                      type="text"
                      placeholder="Course title"
                      value={destination.title}
                      onChange={(e) =>
                        setDestination((p) => ({ ...p, title: e.target.value }))
                      }
                      className="w-full text-sm px-2.5 py-1.5 rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                      autoFocus
                    />
                  )}
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="destType"
                  value="existing"
                  checked={destination.type === "existing"}
                  onChange={() =>
                    setDestination((p) => ({ ...p, type: "existing" }))
                  }
                  className="mt-0.5 accent-violet-600"
                />
                <div className="flex-1 space-y-1.5">
                  <span className="text-sm font-medium">
                    Add to existing course
                  </span>
                  {destination.type === "existing" && (
                    <Select
                      value={destination.existingCourseId}
                      onValueChange={(v) =>
                        setDestination((p) => ({ ...p, existingCourseId: v }))
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select a course..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(existingCourses ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </label>
            </div>

            {/* Promote toggle (only when selection is a single root module) */}
            {canPromote && destination.type !== "training-library" && (
              <div className="flex items-start gap-2.5 p-2.5 rounded-md border bg-muted/30">
                <Checkbox
                  id="promote-toggle"
                  checked={destination.promote}
                  onCheckedChange={(v) =>
                    setDestination((p) => ({ ...p, promote: !!v }))
                  }
                  className="mt-0.5 flex-shrink-0"
                />
                <label htmlFor="promote-toggle" className="cursor-pointer">
                  <p className="text-sm font-medium">
                    Promote &ldquo;{filteredTree[0]?.title}&rdquo;
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Lift its sub-sections up one level so they become the
                    top-level modules of the course.
                  </p>
                </label>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setStep("selecting")}
                className="gap-1.5 text-muted-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setConfirmedDestination({ ...destination });
                  setStep("preview");
                }}
                disabled={
                  (destination.type === "new" &&
                    !destination.title.trim()) ||
                  (destination.type === "existing" &&
                    !destination.existingCourseId)
                }
                className="gap-1.5"
              >
                Preview Import
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* preview */}
        {step === "preview" && (
          <div className="space-y-3">
            {importErrors.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                <p className="font-semibold">Import was not applied</p>
                <p className="mt-1">
                  Fix these source rows and try again. No replay records were changed.
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {importErrors.map((error, index) => (
                    <li key={`${error.row}-${index}`}>
                      {error.row > 0 ? `Row ${error.row}: ` : ""}{error.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="text-sm font-semibold">Ready to import</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                 {destination.type === "training-library" ? (
                   <>
                     <span className="font-medium text-foreground">
                       {finalCounts.lessons}
                     </span>{" "}
                     replay{finalCounts.lessons !== 1 ? "s" : ""} ·{" "}
                   </>
                 ) : (
                   <>
                     <span className="font-medium text-foreground">
                       {finalCounts.modules}
                     </span>{" "}
                     module{finalCounts.modules !== 1 ? "s" : ""} ·{" "}
                     <span className="font-medium text-foreground">
                       {finalCounts.lessons}
                     </span>{" "}
                     lesson{finalCounts.lessons !== 1 ? "s" : ""} ·{" "}
                   </>
                 )}
                <span className="font-medium text-foreground">
                  {selectedVideoCounts.found}
                </span>{" "}
                video{selectedVideoCounts.found !== 1 ? "s" : ""} ready ·{" "}
                {selectedContentCounts.recovered} full / {selectedContentCounts.partial} partial content recoveries
                 {destination.type === "training-library"
                   ? " → training library (drafts)"
                   : destination.type === "new"
                  ? ` → new course "${destination.title}"`
                  : " → existing course"}
              </p>
            </div>

            <ScrollArea className="h-72 border rounded-md p-2 bg-card">
              {finalTree.map((node, i) => (
                <PreviewNode key={i} node={node} depth={0} />
              ))}
            </ScrollArea>

            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setConfirmedDestination(null);
                  setStep("destination");
                }}
                className="gap-1.5 text-muted-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </Button>
              <Button
                size="sm"
                onClick={() => runImport(filteredTree)}
                className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
              >
                <Upload className="h-3.5 w-3.5" />
                Start Import
              </Button>
            </div>
          </div>
        )}

        {/* importing */}
        {step === "importing" && (
          <div className="flex items-center gap-2.5 text-sm py-2">
            <Loader2 className="h-4 w-4 animate-spin text-violet-500 flex-shrink-0" />
            <span className="text-muted-foreground">
              Importing {finalCounts.modules} module
              {finalCounts.modules !== 1 ? "s" : ""} and{" "}
              {finalCounts.lessons} lesson
              {finalCounts.lessons !== 1 ? "s" : ""}...
            </span>
          </div>
        )}

        {/* done */}
        {step === "done" && importResult && (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1 min-w-0">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                  Import complete
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  Created{" "}
                  <span className="font-semibold">{importResult.created}</span>{" "}
                  item{importResult.created !== 1 ? "s" : ""}
                  {importResult.updated > 0 && (
                    <>
                      {" "}
                      · Updated{" "}
                      <span className="font-semibold">
                        {importResult.updated}
                      </span>
                    </>
                  )}
                  {importResult.wrappedLessons > 0 && (
                    <>
                      {" "}
                      ·{" "}
                      <span className="font-semibold">
                        {importResult.wrappedLessons}
                      </span>{" "}
                      loose lesson
                      {importResult.wrappedLessons !== 1 ? "s" : ""} wrapped in
                      &ldquo;Bonus&rdquo;
                    </>
                  )}
                </p>
                 <p className="text-xs text-muted-foreground">
                   {importResult.destination === "training-library" ? (
                     <>
                       Destination:{" "}
                       <span className="font-medium">Training library</span>
                       {" · Imported as drafts for review"}
                     </>
                   ) : (
                     <>
                       Course:{" "}
                       <span className="font-medium">{importResult.courseName}</span>
                     </>
                   )}
                 </p>
                <p className="text-xs text-muted-foreground">
                  Videos:{" "}
                  <span className="font-medium">{importResult.videosImported}</span> imported
                  {importResult.videosSkipped > 0 && (
                    <>
                      {" "}
                      · <span className="font-medium">{importResult.videosSkipped}</span> kept existing
                    </>
                  )}
                  {importResult.videosUnavailable > 0 && (
                    <>
                      {" "}
                      · <span className="font-medium">{importResult.videosUnavailable}</span> unavailable
                    </>
                  )}
                </p>
                {importResult.destination === "training-library" && (
                  <p className="text-xs text-muted-foreground">
                    Page content: <span className="font-medium">{importResult.contentImported ?? 0}</span> imported
                    {(importResult.contentSkipped ?? 0) > 0 && <> · <span className="font-medium">{importResult.contentSkipped}</span> kept existing</>}
                    {" · "}<span className="font-medium">{importResult.resourcesImported ?? 0}</span> resources added
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={reset}
                className="gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Import Another
              </Button>
               <Button size="sm" variant="secondary" asChild>
                 <a
                   href={importResult.destination === "training-library"
                     ? "/admin/training-library"
                     : "/admin/courses"}
                   className="gap-1.5 flex items-center"
                 >
                  <ExternalLink className="h-3.5 w-3.5" />
                   {importResult.destination === "training-library"
                     ? "Open Training Library"
                     : "Open in Courses"}
                </a>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
