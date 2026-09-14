import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart2, CircleHelp, Loader2, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PeriodKey = "thisMonth" | "lastMonth" | "last3Months" | "last12Months" | "allTime";
type RegularPeriod = {
  label: string;
  dateLabel: string;
  totalRevenue: number;
  orders: number;
  averageOrderValue: number;
  refunded: number;
  offers: Array<{ name: string; orders: number; revenue: number; cashCollected?: number; averageOrderValue: number }>;
};
type RegularRevenueSnapshot = {
  syncedAt: string;
  currency: string;
  collectedToDate: number;
  month: { label: string; collected: number };
  history: Array<{ month: string; label: string; revenue: number }>;
  periods: Record<PeriodKey, RegularPeriod>;
  methodology: string;
};

const periodOptions: Array<{ key: PeriodKey; label: string }> = [
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "last3Months", label: "Last 3 months" },
  { key: "last12Months", label: "Last 12 months" },
  { key: "allTime", label: "All time" },
];

export default function AdminRegularRevenuePage() {
  const [periodKey, setPeriodKey] = useState<PeriodKey>("thisMonth");
  const { data, isLoading, isFetching, error, refetch } = useQuery<RegularRevenueSnapshot>({
    queryKey: ["/api/admin/cf/regular-revenue"],
    queryFn: async () => {
      const response = await fetch("/api/admin/cf/regular-revenue", { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || "Regular revenue could not be loaded");
      return response.json();
    },
    refetchInterval: 15 * 60 * 1000,
    staleTime: 15 * 60 * 1000,
  });
  const period = data?.periods[periodKey];
  const money = (value: number, decimals = 0) => new Intl.NumberFormat(undefined, {
    style: "currency", currency: data?.currency || "USD", currencyDisplay: "code",
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(value);
  const info = (label: string) => <CircleHelp className="h-3 w-3 text-muted-foreground" aria-label={label} title={label} />;
  const chartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return <div className="rounded-lg border bg-card px-3 py-2.5 text-sm text-card-foreground shadow-xl">
      <p className="mb-1.5 font-semibold">{label}</p>
      <p className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-teal-500/70" />Revenue collected: <strong className="tabular-nums">{money(Number(payload[0].value), 2)}</strong></p>
    </div>;
  };

  if (isLoading) return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error || !data || !period) return <div className="container mx-auto max-w-6xl px-4 py-8"><Card className="border-destructive/40"><CardContent className="py-8 text-center"><p className="font-semibold">Regular revenue could not be loaded</p><p className="mt-1 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Try again."}</p><Button className="mt-4" onClick={() => refetch()}>Try again</Button></CardContent></Card></div>;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-500"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Revenue operations</div>
          <h1 className="text-2xl font-bold tracking-tight">Regular Revenue</h1>
          <p className="mt-1 text-sm text-muted-foreground">Offer-level one-time revenue and order counts calculated from paid orders.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">Updated {new Date(data.syncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</Badge>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`mr-2 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />Refresh</Button>
        </div>
      </div>

      <section>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">This month · cash · {data.month.label}</p>
        <Card className="overflow-hidden"><div className="h-1 bg-gradient-to-r from-amber-500 to-orange-400" /><CardContent className="py-5"><p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Collected so far {info("Paid one-time invoices collected this month, excluding subscription orders.")}</p><p className="mt-1 text-3xl font-bold tabular-nums">{money(data.month.collected)}</p><p className="mt-1 text-xs text-muted-foreground">actual paid orders</p></CardContent></Card>
      </section>

      <Card><CardHeader className="border-b pb-4"><CardTitle className="flex items-center gap-2 text-base"><BarChart2 className="h-4 w-4 text-teal-500" />Revenue collected · last 12 months</CardTitle><CardDescription>Paid one-time invoices by collection month.</CardDescription></CardHeader><CardContent className="h-80 pt-6"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.history} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(value) => `${data.currency} ${Number(value) / 1000}k`} /><Tooltip content={chartTooltip} cursor={{ fill: "hsl(var(--muted) / .4)" }} /><Bar dataKey="revenue" fill="hsl(174 60% 42% / .5)" stroke="hsl(174 60% 42%)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Performance over</p><select value={periodKey} onChange={(event) => setPeriodKey(event.target.value as PeriodKey)} className="rounded-md border bg-background px-3 py-2 text-sm font-medium">{periodOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select><span className="text-xs text-muted-foreground">{period.dateLabel}</span></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Total revenue", money(period.totalRevenue), "Paid one-time invoice revenue for this period."],
            ["Orders", period.orders.toLocaleString(), "One-time orders with at least one paid invoice."],
            ["Average order value", money(period.averageOrderValue, 2), "Total revenue divided by paid orders."],
            ["Refunded", money(period.refunded, 2), "Refund value reported on invoices tied to paid orders."],
          ].map(([label, value, help]) => <Card key={label}><CardContent className="py-4"><p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label} {info(help)}</p><p className="mt-2 text-2xl font-bold tabular-nums">{value}</p></CardContent></Card>)}
        </div>
      </section>

      <Card>
        <CardHeader className="border-b"><CardTitle className="text-base">Offers · {period.dateLabel}</CardTitle><CardDescription>Gross one-time revenue and the cash remaining after refunds, allocated to each offer.</CardDescription></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/40 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3 text-left">Offer {info("The ClickFunnels product or variant name.")}</th><th className="px-4 py-3 text-right">Orders {info("Paid orders containing this offer.")}</th><th className="px-4 py-3 text-right">Revenue {info("Original gross paid-invoice value allocated to this offer, before refunds.")}</th><th className="px-4 py-3 text-right">Cash collected {info("Gross offer revenue minus ClickFunnels-reported refunds.")}</th><th className="px-4 py-3 text-right">Avg order value {info("Gross offer revenue divided by orders.")}</th></tr></thead><tbody className="divide-y">{period.offers.length ? period.offers.map((offer) => <tr key={offer.name} className="hover:bg-muted/30"><td className="px-4 py-3 font-medium">{offer.name}</td><td className="px-4 py-3 text-right tabular-nums">{offer.orders}</td><td className="px-4 py-3 text-right tabular-nums">{money(offer.revenue)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{offer.cashCollected == null ? <span className="text-xs font-normal text-muted-foreground">Updating…</span> : money(offer.cashCollected)}</td><td className="px-4 py-3 text-right tabular-nums">{money(offer.averageOrderValue, 2)}</td></tr>) : <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No paid one-time orders in this period.</td></tr>}</tbody></table></div>
          <p className="border-t px-4 py-3 text-xs leading-relaxed text-muted-foreground">{data.methodology}</p>
        </CardContent>
      </Card>
    </div>
  );
}