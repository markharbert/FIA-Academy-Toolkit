import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Inbox, ChevronRight, Star } from "lucide-react";
import {
  Tile,
  TileTitle,
  reputationTone,
  filterPostmasterLast90,
  domainRep90,
  domainSpam90,
  timeAgo,
} from "../widget-registry";
import type { PostmasterDomain } from "@shared/schema";

type ReputationStatus = {
  connected: boolean;
  connectedEmail?: string;
  lastSyncedAt?: string | null;
  domains: PostmasterDomain[];
};

type AddressResponse = {
  token: string;
  email: string;
  lastPlacementResults: Record<string, string> | null;
  lastPlacementCheckedAt: string | null;
};

export function EmailHealthWidget() {
  const { data: reputation } = useQuery<ReputationStatus>({
    queryKey: ["/api/sender-reputation/status"],
  });
  const { data: address } = useQuery<AddressResponse>({
    queryKey: ["/api/inbox-analyzer/address"],
  });

  const primaryDomain = useMemo(() => {
    const saved =
      typeof window !== "undefined"
        ? localStorage.getItem("postmaster_default_domain")
        : null;
    const domains = reputation?.domains ?? [];
    return (saved && domains.find((d) => d.domainName === saved)) || domains[0] || null;
  }, [reputation]);

  const repTone = reputationTone(primaryDomain ? domainRep90(primaryDomain) : null);

  const placement = useMemo(() => {
    const r = address?.lastPlacementResults;
    if (!r || typeof r !== "object") return null;
    const entries = Object.entries(r);
    if (entries.length === 0) return null;
    const primary = entries.filter(([, status]) => status === "primary").length;
    return {
      primary,
      total: entries.length,
      checkedAt: address?.lastPlacementCheckedAt ?? null,
    };
  }, [address]);

  return (
    <Tile accent="bg-emerald-500" testId="card-email-health">
      <TileTitle
        icon={ShieldCheck}
        title="Email Health"
        accent="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      />

      {/* Sender Reputation */}
      <div className="mt-4 rounded-lg border border-border bg-background/40 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${repTone.dot} ${
                reputation?.connected ? "animate-pulse" : ""
              }`}
            />
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
              Sender Reputation
            </p>
          </div>
          <Link
            href="/email-tools/sender-reputation"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
          >
            Open <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        {reputation?.connected ? (
          <div className="mt-2">
            <p className="text-[11px] text-muted-foreground mb-2">
              {reputation.lastSyncedAt
                ? `Synced ${timeAgo(new Date(reputation.lastSyncedAt))}`
                : "Awaiting sync"}
            </p>
            <p className="text-[10px] text-muted-foreground/60 mb-1.5">Last 90 days</p>
            <div className="space-y-2">
              {[...(reputation.domains ?? [])]
                .sort((a, b) => {
                  const def =
                    typeof window !== "undefined"
                      ? localStorage.getItem("postmaster_default_domain")
                      : null;
                  if (a.domainName === def) return -1;
                  if (b.domainName === def) return 1;
                  return 0;
                })
                .slice(0, 10)
                .map((d) => {
                  const rep90 = domainRep90(d);
                  const spam90 = domainSpam90(d);
                  const tone = reputationTone(rep90);
                  const isDefault =
                    typeof window !== "undefined"
                      ? d.domainName === localStorage.getItem("postmaster_default_domain")
                      : false;
                  const spamColor =
                    spam90 == null
                      ? "text-muted-foreground"
                      : spam90 < 0.001
                      ? "text-emerald-500"
                      : spam90 < 0.003
                      ? "text-amber-500"
                      : "text-rose-500";
                  return (
                    <div key={d.domainName}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${tone.dot}`} />
                          <span className="text-xs text-foreground truncate">{d.domainName}</span>
                          {isDefault && (
                            <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400 flex-shrink-0" />
                          )}
                        </div>
                        <span className={`text-xs font-semibold flex-shrink-0 ${tone.color}`}>
                          {tone.label}
                        </span>
                      </div>
                      {spam90 != null && (
                        <p className={`text-[10px] ml-3.5 mt-0.5 tabular-nums ${spamColor}`}>
                          Spam rate {(spam90 * 100).toFixed(4)}%
                        </p>
                      )}
                    </div>
                  );
                })}
            </div>
            {(reputation.domains?.length ?? 0) > 10 && (
              <Link
                href="/email-tools/sender-reputation"
                className="text-[11px] text-muted-foreground hover:text-foreground mt-2 block"
                data-testid="link-more-domains"
              >
                +{reputation.domains.length - 10} more domain
                {reputation.domains.length - 10 !== 1 ? "s" : ""} →
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Not connected. Link Google Postmaster.
            </p>
            <Link href="/email-tools/sender-reputation">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                data-testid="button-connect-postmaster"
              >
                Connect
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Placement */}
      <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
              Inbox Placement
            </p>
          </div>
          <Link
            href="/email-tools/inbox-analyzer"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
          >
            Open <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        {placement ? (
          <div className="mt-2">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {placement.primary}
                  </span>
                  <span className="text-muted-foreground text-base font-medium">
                    {" "}/ {placement.total}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">landed in primary</p>
              </div>
              <div className="text-right text-[11px] text-muted-foreground">
                {placement.checkedAt
                  ? `Tested ${timeAgo(new Date(placement.checkedAt))}`
                  : "Never tested"}
              </div>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{
                  width: `${
                    placement.total > 0
                      ? (placement.primary / placement.total) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground mt-2">
            No placement test yet — run one from the Inbox Analyzer.
          </p>
        )}
      </div>
    </Tile>
  );
}
