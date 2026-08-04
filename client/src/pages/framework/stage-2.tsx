import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Tag, Users, Plus, Edit2, Trash2, ChevronRight, FileText, User } from "lucide-react";
import type { FrameworkAvatar, InsertFrameworkAvatar } from "@shared/schema";

const GENDER_OPTIONS = ["Men", "Women", "Both", "Other / Unspecified"];
const AGE_OPTIONS = ["18–24", "25–34", "35–44", "45–54", "55–64", "65+", "Multiple ranges"];
const INCOME_OPTIONS = ["Under $30k", "$30k–$60k", "$60k–$100k", "$100k–$200k", "$200k+", "Varied"];
const MARITAL_OPTIONS = ["Single", "Married", "Divorced", "Widowed", "Varied"];

type AvatarFormData = Omit<InsertFrameworkAvatar, "name"> & { name: string };

function emptyForm(): AvatarFormData {
  return {
    name: "",
    genderTarget: "", ageRange: "", locationFocus: "", incomeLevel: "", maritalStatus: "",
    socialGroups: "", publications: "", associations: "", brandsFollow: "", gurusFollow: "",
    toolsSoftware: "", religion: "", eventsAttend: "",
    painPoints: "", goalsDesires: "", keepsAwakeAtNight: "",
  };
}

export default function Stage2Page() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AvatarFormData>(emptyForm());
  const [activeTab, setActiveTab] = useState<"demographics" | "psychographics" | "pain">("demographics");

  const { data: avatars = [], isLoading } = useQuery<FrameworkAvatar[]>({
    queryKey: ["/api/framework/avatars"],
  });

  const createMutation = useMutation({
    mutationFn: (data: AvatarFormData) => apiRequest("POST", "/api/framework/avatars", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/framework/avatars"] });
      setDialogOpen(false);
      toast({ title: "Avatar saved" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AvatarFormData }) =>
      apiRequest("PATCH", `/api/framework/avatars/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/framework/avatars"] });
      setDialogOpen(false);
      toast({ title: "Avatar updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/framework/avatars/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/framework/avatars"] });
      toast({ title: "Avatar deleted" });
    },
  });

  function openCreate() {
    setForm(emptyForm());
    setEditingId(null);
    setActiveTab("demographics");
    setDialogOpen(true);
  }

  function openEdit(avatar: FrameworkAvatar) {
    setForm({
      name: avatar.name,
      genderTarget: avatar.genderTarget ?? "",
      ageRange: avatar.ageRange ?? "",
      locationFocus: avatar.locationFocus ?? "",
      incomeLevel: avatar.incomeLevel ?? "",
      maritalStatus: avatar.maritalStatus ?? "",
      socialGroups: avatar.socialGroups ?? "",
      publications: avatar.publications ?? "",
      associations: avatar.associations ?? "",
      brandsFollow: avatar.brandsFollow ?? "",
      gurusFollow: avatar.gurusFollow ?? "",
      toolsSoftware: avatar.toolsSoftware ?? "",
      religion: avatar.religion ?? "",
      eventsAttend: avatar.eventsAttend ?? "",
      painPoints: avatar.painPoints ?? "",
      goalsDesires: avatar.goalsDesires ?? "",
      keepsAwakeAtNight: avatar.keepsAwakeAtNight ?? "",
    });
    setEditingId(avatar.id);
    setActiveTab("demographics");
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast({ title: "Give your avatar a name", variant: "destructive" });
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const tabs = [
    { id: "demographics" as const, label: "Who They Are" },
    { id: "psychographics" as const, label: "Their World" },
    { id: "pain" as const, label: "Struggles & Dreams" },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs font-semibold">
            Level 1 · Genesis
          </Badge>
          <Badge variant="outline" className="text-xs text-white/40 border-white/10">
            Stage 2 of 3
          </Badge>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Irresistible Offer</h1>
        <p className="text-white/60 text-base leading-relaxed max-w-2xl">
          Identify your value proposition. Know exactly who you're serving, what pain you solve, and what makes your offer the one they can't say no to.
        </p>
      </div>

      {/* Avatar Builder */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-400" />
              Avatar Builder
            </h2>
            <p className="text-xs text-white/40 mt-0.5">
              Get crystal clear on who you're speaking to before you build anything else.
            </p>
          </div>
          <Button size="sm" onClick={openCreate} className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white">
            <Plus className="h-3.5 w-3.5" />
            New Avatar
          </Button>
        </div>

        {isLoading ? (
          <div className="text-sm text-white/30 py-4">Loading…</div>
        ) : avatars.length === 0 ? (
          <Card className="border-dashed border-white/10 bg-white/[0.02]">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                <User className="h-6 w-6 text-emerald-400/60" />
              </div>
              <div>
                <div className="text-sm font-medium text-white/60">No avatars yet</div>
                <div className="text-xs text-white/30 mt-1 max-w-xs">
                  Create your first customer avatar snapshot to get clear on exactly who you're serving.
                </div>
              </div>
              <Button size="sm" onClick={openCreate} variant="outline" className="gap-1.5 border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/30">
                <Plus className="h-3.5 w-3.5" />
                Create Avatar
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {avatars.map(avatar => (
              <div key={avatar.id} className="group p-4 rounded-2xl border border-white/10 bg-white/[0.03] hover:border-emerald-500/20 transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-white truncate">{avatar.name}</div>
                      <div className="text-xs text-white/40 mt-0.5 line-clamp-1">
                        {[avatar.genderTarget, avatar.ageRange, avatar.locationFocus].filter(Boolean).join(" · ") || "Demographics not set"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(avatar)}
                      className="h-7 w-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(avatar.id)}
                      className="h-7 w-7 flex items-center justify-center rounded-lg text-white/40 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {avatar.keepsAwakeAtNight && (
                  <p className="text-xs text-white/30 mt-2 pt-2 border-t border-white/5 line-clamp-2">
                    "{avatar.keepsAwakeAtNight}"
                  </p>
                )}
              </div>
            ))}
            <button
              onClick={openCreate}
              className="p-4 rounded-2xl border border-dashed border-white/10 hover:border-emerald-500/20 transition-all flex items-center justify-center gap-2 text-white/30 hover:text-white/60"
            >
              <Plus className="h-4 w-4" />
              <span className="text-sm">Add another avatar</span>
            </button>
          </div>
        )}
      </div>

      {/* Coming Soon Tools */}
      <div>
        <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">More Tools</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl border border-white/5 bg-white/[0.02] opacity-60">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Tag className="h-5 w-5 text-emerald-400/60" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-white/60">Offer Clarity Workbook</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-white/30 border-white/10">Coming Soon</Badge>
                </div>
                <div className="text-xs text-white/30 mt-0.5">
                  Define your A-to-Z customer journey, signature solution, and lead magnet concept.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stage context */}
      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-white/40 leading-relaxed italic">
            "What keeps my prospect awake at night when they're laying in their bed about to go to sleep? If you can tap into that and speak directly to it, you can literally print money. You'll have a winning product with a winning message."
          </p>
          <p className="text-xs text-white/25 mt-2">— Keystone Framework, Stage 2</p>
        </CardContent>
      </Card>

      {/* Avatar Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-[hsl(230,45%,12%)] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">{editingId ? "Edit Avatar" : "Create Avatar"}</DialogTitle>
          </DialogHeader>

          {/* Avatar name */}
          <div className="space-y-1.5">
            <Label className="text-white/70 text-xs">Avatar Name *</Label>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder='e.g. "Aspiring Online Marketer — Sarah"'
              className="bg-white/5 border-white/10 text-white"
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-white/5 rounded-lg p-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 text-xs px-3 py-1.5 rounded-md transition-colors font-medium ${
                  activeTab === tab.id ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "demographics" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-white/70 text-xs">Gender Target</Label>
                  <Select value={form.genderTarget ?? ""} onValueChange={v => setForm(f => ({ ...f, genderTarget: v }))}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white text-sm">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/70 text-xs">Age Range</Label>
                  <Select value={form.ageRange ?? ""} onValueChange={v => setForm(f => ({ ...f, ageRange: v }))}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white text-sm">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {AGE_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/70 text-xs">Income Level</Label>
                  <Select value={form.incomeLevel ?? ""} onValueChange={v => setForm(f => ({ ...f, incomeLevel: v }))}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white text-sm">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {INCOME_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/70 text-xs">Marital Status</Label>
                  <Select value={form.maritalStatus ?? ""} onValueChange={v => setForm(f => ({ ...f, maritalStatus: v }))}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white text-sm">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {MARITAL_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-white/70 text-xs">Location Focus</Label>
                <Input value={form.locationFocus ?? ""} onChange={e => setForm(f => ({ ...f, locationFocus: e.target.value }))} placeholder="e.g. USA, Canada, UK, Australia" className="bg-white/5 border-white/10 text-white" />
              </div>
            </div>
          )}

          {activeTab === "psychographics" && (
            <div className="space-y-3">
              {[
                { key: "socialGroups" as const, label: "Social Media Groups", placeholder: "e.g. Facebook groups about online business, affiliate marketing…" },
                { key: "publications" as const, label: "Publications / Websites They Read", placeholder: "e.g. Entrepreneur.com, Forbes, niche blogs…" },
                { key: "brandsFollow" as const, label: "Brands They Follow", placeholder: "e.g. Apple, certain clothing brands…" },
                { key: "gurusFollow" as const, label: "Gurus / Experts They Follow", placeholder: "e.g. industry influencers, coaches, celebrities…" },
                { key: "toolsSoftware" as const, label: "Tools / Software They Use", placeholder: "e.g. Canva, ClickFunnels, Zoom…" },
                { key: "eventsAttend" as const, label: "Events They Attend", placeholder: "e.g. online marketing conferences, local meetups…" },
              ].map(field => (
                <div key={field.key} className="space-y-1.5">
                  <Label className="text-white/70 text-xs">{field.label}</Label>
                  <Textarea value={form[field.key] ?? ""} onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))} placeholder={field.placeholder} className="bg-white/5 border-white/10 text-white resize-none text-sm" rows={2} />
                </div>
              ))}
            </div>
          )}

          {activeTab === "pain" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-white/70 text-xs">What keeps them awake at night?</Label>
                <Textarea value={form.keepsAwakeAtNight ?? ""} onChange={e => setForm(f => ({ ...f, keepsAwakeAtNight: e.target.value }))} placeholder="Their biggest worry, fear, or frustration at bedtime…" className="bg-white/5 border-white/10 text-white resize-none text-sm" rows={3} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-white/70 text-xs">Their Pain Points & Frustrations</Label>
                <Textarea value={form.painPoints ?? ""} onChange={e => setForm(f => ({ ...f, painPoints: e.target.value }))} placeholder="What problems are they struggling with? What have they tried that hasn't worked?" className="bg-white/5 border-white/10 text-white resize-none text-sm" rows={3} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-white/70 text-xs">Their Goals, Dreams & Desires</Label>
                <Textarea value={form.goalsDesires ?? ""} onChange={e => setForm(f => ({ ...f, goalsDesires: e.target.value }))} placeholder="What do they want to achieve? What does success look like for them?" className="bg-white/5 border-white/10 text-white resize-none text-sm" rows={3} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} className="text-white/60">Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-500 text-white">
              {isSaving ? "Saving…" : editingId ? "Save Changes" : "Create Avatar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
