import { useLocation } from "wouter";
import { Video, Mail, Target, Settings, ChevronRight, BookOpen, Search, Clock, Briefcase } from "lucide-react";
import { helpCategories, allArticles } from "@/lib/help-content";

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Video, Mail, Target, Settings, Briefcase,
};

export default function HelpPage() {
  const [, setLocation] = useLocation();
  const articles = allArticles();

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <BookOpen className="h-4 w-4" />
          <span>Help &amp; Documentation</span>
        </div>
        <h1 className="text-3xl font-bold text-foreground">How can we help?</h1>
        <p className="text-muted-foreground text-base">Step-by-step guides and documentation for every feature in Academy Toolkit.</p>
      </div>

      {/* Search (visual only — expandable later) */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <div className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground cursor-text">
          Search documentation…
        </div>
      </div>

      {/* Categories */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Browse by Category</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {helpCategories.map(cat => {
            const Icon = CATEGORY_ICONS[cat.icon] || BookOpen;
            const count = cat.articles.length;
            return (
              <button
                key={cat.slug}
                type="button"
                disabled={count === 0}
                className={`text-left rounded-xl border border-border bg-card p-4 space-y-2 transition-shadow ${count > 0 ? "hover-elevate active-elevate-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : "opacity-60 cursor-not-allowed"}`}
                onClick={() => count > 0 && setLocation(`/help/category/${cat.slug}`)}
                data-testid={`help-category-${cat.slug}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{cat.title}</p>
                      <p className="text-xs text-muted-foreground">{count === 0 ? "Coming soon" : `${count} article${count !== 1 ? "s" : ""}`}</p>
                    </div>
                  </div>
                  {count > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{cat.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* All Articles */}
      {articles.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">All Articles</h2>
          <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {articles.map(article => (
              <button
                key={article.slug}
                onClick={() => setLocation(`/help/${article.slug}`)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/30 transition-colors"
                data-testid={`help-article-${article.slug}`}
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{article.title}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{article.subtitle}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                  <Clock className="h-3 w-3" />
                  {article.readMinutes} min
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
