import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Search,
  Copy,
  ExternalLink,
  Pencil,
  Trash2,
  Check,
  Link2,
  MousePointerClick,
  FolderOpen,
  Globe,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AffiliateLink } from "@shared/schema";

const PRESET_CATEGORIES = [
  "Software",
  "Courses",
  "Coaching",
  "Equipment",
  "Email Marketing",
  "Funnels",
  "Video & Editing",
  "Social Media",
  "Templates",
  "Communities",
  "Books & Resources",
  "Hosting",
  "Payments",
  "Productivity",
  "Health & Wellness",
  "Business Tools",
];

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  url: z.string().url("Enter a valid URL (include https://)"),
  description: z.string().optional(),
  category: z.string().optional(),
  isActive: z.boolean(),
  sortOrder: z.number().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function LinkModal({
  open,
  link,
  onClose,
  onSaved,
  existingCategories,
}: {
  open: boolean;
  link: AffiliateLink | null;
  onClose: () => void;
  onSaved: () => void;
  existingCategories: string[];
}) {
  const { toast } = useToast();
  const isEdit = !!link;
  const [showCustom, setShowCustom] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      url: "",
      description: "",
      category: "",
      isActive: true,
    },
  });

  useEffect(() => {
    if (open) {
      if (link) {
        form.reset({
          title: link.title,
          url: link.url,
          description: link.description || "",
          category: link.category || "",
          isActive: link.isActive,
        });
        const cat = link.category || "";
        setShowCustom(!!cat && !PRESET_CATEGORIES.includes(cat));
      } else {
        form.reset({
          title: "",
          url: "",
          description: "",
          category: "",
          isActive: true,
        });
        setShowCustom(false);
      }
    }
  }, [open, link]);

  const mutation = useMutation({
    mutationFn: (data: FormValues) => {
      const payload = {
        ...data,
        emoji: "🔗",
        description: data.description || null,
        category: data.category || null,
      };
      if (isEdit) {
        return apiRequest("PATCH", `/api/affiliate-links/${link!.id}`, payload);
      }
      return apiRequest("POST", "/api/affiliate-links", payload);
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Link updated" : "Link added!" });
      onSaved();
    },
    onError: () => {
      toast({ title: "Something went wrong", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Link" : "Add Affiliate Link"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Kajabi 30-Day Trial"
                      {...field}
                      data-testid="input-link-title"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://..."
                      {...field}
                      data-testid="input-link-url"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Category{" "}
                    <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                  </FormLabel>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            field.onChange(field.value === cat ? "" : cat);
                            setShowCustom(false);
                          }}
                          className={cn(
                            "px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                            field.value === cat && !showCustom
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted/40 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                          )}
                          data-testid={`cat-preset-${cat}`}
                        >
                          {cat}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setShowCustom(true);
                          if (PRESET_CATEGORIES.includes(field.value || "")) {
                            field.onChange("");
                          }
                        }}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                          showCustom
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/40 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                        )}
                        data-testid="cat-custom"
                      >
                        + Custom
                      </button>
                    </div>
                    {showCustom && (
                      <FormControl>
                        <Input
                          placeholder="Enter a custom category…"
                          value={field.value || ""}
                          onChange={field.onChange}
                          autoFocus
                          data-testid="input-link-category"
                        />
                      </FormControl>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Note{" "}
                    <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add a note about this link..."
                      {...field}
                      rows={2}
                      className="resize-none"
                      data-testid="input-link-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isEdit && (
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-border p-3 gap-4">
                    <div className="min-w-0">
                      <FormLabel className="font-medium cursor-pointer">Active</FormLabel>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Inactive links are hidden from the mobile app
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="toggle-link-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                data-testid="button-cancel-link"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                data-testid="button-save-link"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving…
                  </>
                ) : isEdit ? (
                  "Save Changes"
                ) : (
                  "Add Link"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function LinkScreenshot({ url, title }: { url: string; title: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const src = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url`;

  return (
    <div className="relative w-[96px] h-[60px] rounded-lg overflow-hidden bg-muted/40 shrink-0 border border-border/50">
      {status !== "error" && (
        <img
          src={src}
          alt={`Preview of ${title}`}
          className={cn(
            "w-full h-full object-cover object-top transition-opacity duration-500",
            status === "loaded" ? "opacity-100" : "opacity-0"
          )}
          loading="lazy"
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
        />
      )}
      {status !== "loaded" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Globe className={cn("h-4 w-4 text-muted-foreground/30", status === "loading" && "animate-pulse")} />
        </div>
      )}
    </div>
  );
}

function LinkCard({
  link,
  copied,
  onCopy,
  onEdit,
  onDelete,
}: {
  link: AffiliateLink;
  copied: boolean;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="group flex items-center gap-4 bg-card border border-border rounded-xl px-4 py-3 hover:border-border/60 hover:shadow-md hover:shadow-black/8 transition-all duration-200"
      data-testid={`card-link-${link.id}`}
    >
      {/* Page snapshot (replaces emoji) */}
      <LinkScreenshot url={link.url} title={link.title} />

      {/* Title + description + badges */}
      <div className="min-w-0 flex-[2]">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <h3 className="font-semibold text-sm text-foreground truncate">
            {link.title}
          </h3>
          {link.category && (
            <Badge variant="secondary" className="text-xs h-5 px-1.5 font-normal shrink-0">
              {link.category}
            </Badge>
          )}
          {!link.isActive && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0 text-muted-foreground">
              Inactive
            </Badge>
          )}
        </div>
        {link.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
            {link.description}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {link.clickCount > 0 && (
          <div
            className="hidden md:flex items-center gap-1 text-xs text-muted-foreground mr-1"
            title={`Copied ${link.clickCount} time${link.clickCount !== 1 ? "s" : ""}`}
          >
            <MousePointerClick className="h-3 w-3" />
            <span>{link.clickCount}</span>
          </div>
        )}

        <Button
          onClick={onCopy}
          size="sm"
          className={cn(
            "h-8 px-3 text-xs font-medium transition-all duration-200",
            copied && "bg-emerald-600 hover:bg-emerald-600 text-white"
          )}
          data-testid={`button-copy-link-${link.id}`}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy
            </>
          )}
        </Button>

        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="h-8 w-8 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          data-testid={`link-preview-${link.id}`}
          title="Open link"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>

        <div className="w-px h-5 bg-border mx-0.5" />

        <button
          onClick={onEdit}
          className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          data-testid={`button-edit-link-${link.id}`}
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          data-testid={`button-delete-link-${link.id}`}
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function LinksPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<AffiliateLink | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: links = [], isLoading: linksLoading } = useQuery<AffiliateLink[]>({
    queryKey: ["/api/affiliate-links"],
    enabled: !!user,
  });

  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ["/api/affiliate-links/categories"],
    enabled: !!user,
  });

  const filtered = useMemo(() => {
    let result = links;
    if (activeCategory !== "all") {
      result = result.filter((l) => l.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          l.url.toLowerCase().includes(q) ||
          l.description?.toLowerCase().includes(q) ||
          l.category?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [links, activeCategory, search]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/affiliate-links/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/affiliate-links"] });
      queryClient.invalidateQueries({ queryKey: ["/api/affiliate-links/categories"] });
      setDeleteTarget(null);
      toast({ title: "Link deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete link", variant: "destructive" });
    },
  });

  const clickMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/affiliate-links/${id}/click`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/affiliate-links"] });
    },
  });

  const handleCopy = (link: AffiliateLink) => {
    navigator.clipboard.writeText(link.url);
    clickMutation.mutate(link.id);
    setCopiedId(link.id);
    toast({ title: "Copied to clipboard!" });
    setTimeout(() => setCopiedId((prev) => (prev === link.id ? null : prev)), 2000);
  };

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/affiliate-links"] });
    queryClient.invalidateQueries({ queryKey: ["/api/affiliate-links/categories"] });
    setModalOpen(false);
    setEditingLink(null);
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalClicks = links.reduce((sum, l) => sum + l.clickCount, 0);

  return (
    <div className="min-h-screen bg-background">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220_70%_8%)] to-[hsl(270_60%_18%)]" />
        <div className="absolute -bottom-24 -right-12 h-72 w-72 rounded-full bg-purple-500/20 blur-3xl" />
        <div className="absolute -top-16 -left-8 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-xl bg-purple-500/20 ring-1 ring-purple-400/30 flex items-center justify-center shrink-0">
                  <Link2 className="h-5 w-5 text-purple-300" />
                </div>
                <h1 className="text-3xl font-bold text-white tracking-tight">Link Vault</h1>
              </div>
              <p className="text-white/60 text-sm mt-1 max-w-xl">
                All your affiliate links in one place — copy and share in seconds.
              </p>
            </div>
            <Button
              onClick={() => { setEditingLink(null); setModalOpen(true); }}
              className="bg-white text-[hsl(270,60%,30%)] hover:bg-white/90 shadow-lg shrink-0"
              data-testid="button-add-link"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Link
            </Button>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 mt-6 flex-wrap">
            <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1.5">
              <span className="text-xs text-white/70">
                <span className="font-semibold text-white">{links.length}</span>{" "}
                {links.length === 1 ? "link" : "links"}
              </span>
            </div>
            {categories.length > 0 && (
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1.5">
                <span className="text-xs text-white/70">
                  <span className="font-semibold text-white">{categories.length}</span>{" "}
                  {categories.length === 1 ? "category" : "categories"}
                </span>
              </div>
            )}
            {totalClicks > 0 && (
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1.5">
                <MousePointerClick className="h-3.5 w-3.5 text-white/70" />
                <span className="text-xs text-white/70">
                  <span className="font-semibold text-white">{totalClicks}</span> copies
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* ─────────────────────────────────────────────────────────────────── */}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search links…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-links"
            />
          </div>
        </div>

        {categories.length > 0 && (
          <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setActiveCategory("all")}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                activeCategory === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
              data-testid="tab-all"
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                )}
                data-testid={`tab-cat-${cat}`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {linksLoading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        )}

        {!linksLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-16 w-16 rounded-2xl bg-muted/40 flex items-center justify-center mb-4">
              {search || activeCategory !== "all" ? (
                <Search className="h-7 w-7 text-muted-foreground/50" />
              ) : (
                <FolderOpen className="h-7 w-7 text-muted-foreground/50" />
              )}
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">
              {search || activeCategory !== "all" ? "No links found" : "No links yet"}
            </h3>
            <p className="text-sm text-muted-foreground mb-5 max-w-xs">
              {search || activeCategory !== "all"
                ? "Try adjusting your search or clearing the category filter"
                : "Add your affiliate links here and they'll be ready to copy and share instantly"}
            </p>
            {!search && activeCategory === "all" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingLink(null);
                  setModalOpen(true);
                }}
                data-testid="button-add-first-link"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add your first link
              </Button>
            )}
          </div>
        )}

        {!linksLoading && filtered.length > 0 && (
          <div className="flex flex-col gap-2">
            {filtered.map((link) => (
              <LinkCard
                key={link.id}
                link={link}
                copied={copiedId === link.id}
                onCopy={() => handleCopy(link)}
                onEdit={() => {
                  setEditingLink(link);
                  setModalOpen(true);
                }}
                onDelete={() => setDeleteTarget(link.id)}
              />
            ))}
          </div>
        )}
      </div>

      <LinkModal
        open={modalOpen}
        link={editingLink}
        onClose={() => {
          setModalOpen(false);
          setEditingLink(null);
        }}
        onSaved={handleSaved}
        existingCategories={categories}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this link?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The link will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
