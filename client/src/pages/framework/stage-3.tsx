import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  GitFork, Mail, ShieldCheck, InboxIcon, BarChart3,
  ChevronRight, CheckCircle2, Circle
} from "lucide-react";
import type { FrameworkEmailSetup } from "@shared/schema";

const AUTORESPONDERS = ["GetResponse", "AWeber", "ActiveCampaign", "Keap", "Other"];

const EMAIL_CHECKLIST = [
  {
    section: "Autoresponder",
    items: [
      { id: "ar_chosen", label: "Chose an autoresponder", hint: "GetResponse (beginner), AWeber, or ActiveCampaign (advanced)" },
      { id: "ar_setup", label: "Created account and logged in" },
    ],
  },
  {
    section: "Domain & Email",
    items: [
      { id: "domain_purchased", label: "Purchased a .com domain", hint: "GoDaddy or Namecheap — own your identity" },
      { id: "google_workspace", label: "Set up Google Workspace", hint: "$6/month — connects your domain to Gmail professionally" },
      { id: "sender_email", label: "Created a personal sender email", hint: "firstname@yourdomain.com — never info@, no-reply@, or Gmail" },
    ],
  },
  {
    section: "Email Authentication (Required)",
    items: [
      { id: "dkim", label: "DKIM configured", hint: "Your digital signature — proves emails come from you" },
      { id: "spf", label: "SPF record set up", hint: "Your approved senders list — tells inbox providers you're legit" },
      { id: "dmarc", label: "DMARC record configured", hint: "Ties DKIM + SPF together and blocks spoofing" },
    ],
  },
  {
    section: "List Health Best Practices",
    items: [
      { id: "single_optin", label: "Using single opt-in" },
      { id: "no_unengaged", label: "Not emailing unengaged leads past 12 months" },
      { id: "no_bitly", label: "Avoiding link shorteners like Bitly" },
      { id: "limit_links", label: "Keeping emails to 3 links max" },
      { id: "minimal_images", label: "Using minimal images in emails" },
      { id: "has_address", label: "Have a PO Box or address for email footer" },
      { id: "merge_codes", label: "Using merge codes to personalize (first name, etc.)" },
      { id: "encouraging_replies", label: "Encouraging subscribers to reply to emails" },
    ],
  },
];

export default function Stage3Page() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: emailSetup } = useQuery<FrameworkEmailSetup>({
    queryKey: ["/api/framework/email-setup"],
  });

  const updateMutation = useMutation({
    mutationFn: (data: { checklist: Record<string, boolean>; autoresponder?: string }) =>
      apiRequest("POST", "/api/framework/email-setup", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/framework/email-setup"] });
    },
  });

  const checklist = emailSetup?.checklist ?? {};
  const autoresponder = emailSetup?.autoresponder ?? "";

  const allItems = EMAIL_CHECKLIST.flatMap(s => s.items);
  const completedCount = allItems.filter(i => checklist[i.id]).length;
  const totalCount = allItems.length;
  const pct = Math.round((completedCount / totalCount) * 100);

  function toggleItem(id: string) {
    const next = { ...checklist, [id]: !checklist[id] };
    updateMutation.mutate({ checklist: next, autoresponder: autoresponder || undefined });
  }

  function setAutoresponder(value: string) {
    updateMutation.mutate({ checklist, autoresponder: value });
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs font-semibold">
            Level 1 · Genesis
          </Badge>
          <Badge variant="outline" className="text-xs text-white/40 border-white/10">
            Stage 3 of 3
          </Badge>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Sales Funnels & Email</h1>
        <p className="text-white/60 text-base leading-relaxed max-w-2xl">
          Craft the customer journey. A sales funnel turns strangers into empowered buyers on autopilot — and your email list is the single most profitable asset you'll ever own.
        </p>
      </div>

      {/* Funnel Tools */}
      <div>
        <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">Funnel Tools</h2>
        <button
          onClick={() => setLocation("/funnel-grid")}
          className="group w-full text-left p-4 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-violet-500/30 transition-all"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
                <GitFork className="h-5 w-5 text-violet-400" />
              </div>
              <div>
                <div className="font-semibold text-sm text-white">Funnel Planner</div>
                <div className="text-xs text-white/50 mt-0.5 leading-relaxed">
                  Build and visualise your sales funnel on a drag-and-drop canvas. Map every stage from lead magnet to conversion event.
                </div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-white/50 shrink-0 mt-0.5 transition-colors" />
          </div>
        </button>
      </div>

      {/* Email Tools */}
      <div>
        <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">Email Tools</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { url: "/email-tools/inbox-analyzer", icon: InboxIcon, color: "teal", label: "Inbox Analyzer", desc: "See where your emails land — inbox, spam, or promotions." },
            { url: "/email-tools/sender-reputation", icon: ShieldCheck, color: "teal", label: "Sender Reputation", desc: "Monitor your domain's deliverability score via Google Postmaster." },
            { url: "/email-tools/inbox-intel", icon: BarChart3, color: "teal", label: "Inbox Intel", desc: "Track competitors' emails and subject lines to study what works." },
          ].map(tool => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.url}
                onClick={() => setLocation(tool.url)}
                className="group text-left p-4 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-teal-500/30 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-teal-500/15 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-teal-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-white">{tool.label}</div>
                      <div className="text-xs text-white/40 mt-0.5 leading-relaxed">{tool.desc}</div>
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-white/20 group-hover:text-white/50 shrink-0 mt-0.5 transition-colors" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Email Setup Checklist */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider flex items-center gap-2">
            <Mail className="h-3.5 w-3.5" />
            Email Setup Checklist
          </h2>
          <span className={`text-xs font-semibold ${pct === 100 ? "text-emerald-400" : "text-white/40"}`}>
            {completedCount}/{totalCount} complete
          </span>
        </div>

        <Card className="border-white/10 bg-white/[0.03]">
          <CardContent className="pt-4 pb-4 space-y-4">
            {/* Progress bar */}
            <div className="space-y-1.5">
              <Progress value={pct} className="h-1.5 bg-white/10" />
              {pct === 100 && (
                <p className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Email fully configured — your list is ready to grow.
                </p>
              )}
            </div>

            {/* Autoresponder selector */}
            <div className="flex items-center gap-3 pb-2 border-b border-white/5">
              <span className="text-xs text-white/50 shrink-0">Autoresponder:</span>
              <Select value={autoresponder} onValueChange={setAutoresponder}>
                <SelectTrigger className="h-7 text-xs bg-white/5 border-white/10 text-white w-44">
                  <SelectValue placeholder="Select one…" />
                </SelectTrigger>
                <SelectContent>
                  {AUTORESPONDERS.map(ar => <SelectItem key={ar} value={ar} className="text-xs">{ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Checklist sections */}
            {EMAIL_CHECKLIST.map(section => (
              <div key={section.section} className="space-y-2">
                <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">{section.section}</div>
                {section.items.map(item => {
                  const done = !!checklist[item.id];
                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleItem(item.id)}
                      className={`flex items-start gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${
                        done ? "bg-emerald-950/20" : "hover:bg-white/[0.03]"
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {done
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          : <Circle className="h-4 w-4 text-white/20" />
                        }
                      </div>
                      <div className="min-w-0">
                        <span className={`text-sm ${done ? "text-white/50 line-through" : "text-white"}`}>
                          {item.label}
                        </span>
                        {item.hint && (
                          <p className="text-xs text-white/30 mt-0.5">{item.hint}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Stage context */}
      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-white/40 leading-relaxed italic">
            "Your email list is your most important business asset. I don't care what they say — email is not dead. I have literally made millions of dollars in sales online because of my email list. You own it. Nobody can take it away."
          </p>
          <p className="text-xs text-white/25 mt-2">— Keystone Framework, Stage 3</p>
        </CardContent>
      </Card>
    </div>
  );
}
