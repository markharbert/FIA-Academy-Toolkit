import { useLocation, useParams } from "wouter";
import { Video, Mail, Target, Settings, ChevronRight, BookOpen, Clock, ArrowLeft, Briefcase } from "lucide-react";
import { findCategory } from "@/lib/help-content";

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Video, Mail, Target, Settings, Briefcase,
};

export default function HelpCategoryPage() {
  const params = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const category = findCategory(params.slug);

  if (!category) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-muted-foreground">Category not found.</p>
        <button
          onClick={() => setLocation("/help")}
          className="mt-4 text-sm text-primary hover:underline"
          data-testid="link-back-to-help"
        >
          ← Back to Help Docs
        </button>
      </div>
    );
  }

  const Icon = CATEGORY_ICONS[category.icon] || BookOpen;
  const articles = category.articles;

  return (
    <div className="min-h-full flex flex-col">
      {/* Hero header */}
      <div className="relative overflow-hidden border-b border-border shrink-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220_70%_8%)] to-[hsl(200_60%_15%)]" />
        <div className="absolute -bottom-24 -right-12 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute -top-16 -left-8 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center gap-1.5 text-sm text-white/50 flex-wrap mb-4">
            <button onClick={() => setLocation("/help")} className="hover:text-white/80 transition-colors flex items-center gap-1" data-testid="link-help-docs">
              <BookOpen className="h-3.5 w-3.5" />
              Help Docs
            </button>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-white/80 font-medium">{category.title}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/15 ring-1 ring-white/20 flex items-center justify-center">
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white leading-tight" data-testid="text-category-title">{category.title}</h1>
              <p className="text-sm text-white/60 mt-0.5">{category.description}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6 w-full">

      {/* Articles */}
      {articles.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No articles in this category yet. Check back soon.</p>
        </div>
      ) : (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {articles.length} article{articles.length !== 1 ? "s" : ""}
          </h2>
          <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {articles.map(article => (
              <button
                key={article.slug}
                onClick={() => setLocation(`/help/${article.slug}`)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/30 transition-colors"
                data-testid={`link-article-${article.slug}`}
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
    </div>
  );
}
