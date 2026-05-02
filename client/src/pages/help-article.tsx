import { useLocation, useParams } from "wouter";
import { ChevronRight, Clock, BookOpen, Lightbulb, AlertTriangle, Info, ArrowLeft, CheckCircle2 } from "lucide-react";
import { findArticle } from "@/lib/help-content";
import { ILLUSTRATIONS } from "@/components/help-illustrations";
import { Separator } from "@/components/ui/separator";

export default function HelpArticlePage() {
  const params = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const article = findArticle(params.slug);

  if (!article) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-muted-foreground">Article not found.</p>
        <button onClick={() => setLocation("/help")} className="mt-4 text-sm text-primary hover:underline">← Back to Help Docs</button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
        <button onClick={() => setLocation("/help")} className="hover:text-foreground transition-colors flex items-center gap-1">
          <BookOpen className="h-3.5 w-3.5" />
          Help Docs
        </button>
        <ChevronRight className="h-3.5 w-3.5" />
        <button
          onClick={() => setLocation(`/help/category/${article.categorySlug}`)}
          className="hover:text-foreground transition-colors"
          data-testid="link-category"
        >
          {article.category}
        </button>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{article.title}</span>
      </div>

      {/* Article header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs font-medium bg-primary/10 text-primary px-2.5 py-1 rounded-full">
            {article.category}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {article.readMinutes} min read
          </span>
        </div>
        <h1 className="text-3xl font-bold text-foreground leading-tight">{article.title}</h1>
        <p className="text-lg text-muted-foreground leading-relaxed">{article.subtitle}</p>
      </div>

      {/* Overview box */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 flex gap-3">
        <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">What you'll learn</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{article.overview}</p>
        </div>
      </div>

      {/* Table of contents */}
      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">In this article</p>
        <ol className="space-y-1.5">
          {article.steps.map(step => (
            <li key={step.number}>
              <a
                href={`#step-${step.number}`}
                className="flex items-center gap-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
              >
                <span className="h-5 w-5 rounded-full bg-muted text-[10px] font-bold flex items-center justify-center flex-shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  {step.number}
                </span>
                {step.title}
              </a>
            </li>
          ))}
        </ol>
      </div>

      <Separator />

      {/* Steps */}
      <div className="space-y-12">
        {article.steps.map(step => {
          const Illustration = ILLUSTRATIONS[step.illustrationKey];
          return (
            <div key={step.number} id={`step-${step.number}`} className="scroll-mt-8">

              {/* Step header */}
              <div className="flex items-start gap-4 mb-5">
                <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
                  {step.number}
                </div>
                <h2 className="text-xl font-bold text-foreground leading-snug pt-1">{step.title}</h2>
              </div>

              {/* Content + illustration */}
              <div className="ml-[52px] space-y-4">
                <div className="space-y-5">

                  {/* Text content */}
                  <div className="space-y-3">
                    {step.body.map((para, i) => (
                      <p key={i} className="text-base text-foreground leading-relaxed">{para}</p>
                    ))}

                    {step.bullets && step.bullets.length > 0 && (
                      <ul className="space-y-2">
                        {step.bullets.map((b, i) => (
                          <li key={i} className="flex items-start gap-2.5">
                            <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                            <span className="text-sm text-foreground leading-relaxed">{b}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {step.tip && (
                      <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                        <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-0.5">Tip</p>
                          <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">{step.tip}</p>
                        </div>
                      </div>
                    )}

                    {step.note && (
                      <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-0.5">Note</p>
                          <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed">{step.note}</p>
                        </div>
                      </div>
                    )}

                    {step.warning && (
                      <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                        <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide mb-0.5">Important</p>
                          <p className="text-sm text-red-800 dark:text-red-300 leading-relaxed">{step.warning}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Illustration — full width below text */}
                  {Illustration && (
                    <div>
                      <Illustration />
                    </div>
                  )}
                </div>
              </div>

              {step.number < article.steps.length && (
                <div className="mt-10 ml-[52px]">
                  <Separator />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer nav */}
      <div className="pt-4 border-t border-border flex items-center justify-between">
        <button
          onClick={() => setLocation("/help")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          data-testid="help-back-button"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Help Docs
        </button>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          {article.steps.length} steps covered
        </div>
      </div>

    </div>
  );
}
