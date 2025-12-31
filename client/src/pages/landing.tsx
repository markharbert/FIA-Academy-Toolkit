import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Video, FileText, TrendingUp, CheckCircle, Sparkles, Target, Loader2, Search, Zap, PenTool } from "lucide-react";
import { SiGoogle } from "react-icons/si";

const steps = [
  {
    icon: Search,
    title: "Discover",
    description: "Uncover trending topics your audience actively searches for with real keyword data.",
  },
  {
    icon: PenTool,
    title: "Create",
    description: "Generate scroll-stopping scripts using our proven formula, then edit until perfect.",
  },
  {
    icon: Video,
    title: "Practice",
    description: "Record your video, get instant AI feedback, and polish before you post.",
  },
];

const features = [
  {
    icon: Zap,
    title: "Topic Pulse Research",
    description: "Stop guessing what to post next. See exactly what your audience searches for.",
  },
  {
    icon: Sparkles,
    title: "AI Script Generator",
    description: "Turn any topic into a complete script with hooks, CTAs, and high-converting content.",
  },
  {
    icon: Target,
    title: "Smart Video Scoring",
    description: "Get scored on all 5 formula parts with specific fixes to strengthen every video.",
  },
  {
    icon: TrendingUp,
    title: "YouTube Research",
    description: "Study top-performing videos and winning comments to learn what drives views.",
  },
  {
    icon: CheckCircle,
    title: "Proven Formula",
    description: "Master the 5-part structure top creators use: Hook, Set Hook, CTA, Content, Final CTA.",
  },
  {
    icon: FileText,
    title: "Complete Content System",
    description: "From topic research to final script, everything you need to create winning videos.",
  },
];

export default function LandingPage() {
  const [oauthLoading, setOauthLoading] = useState<"google" | null>(null);

  return (
    <div className="flex flex-col">
      <section className="relative overflow-hidden bg-background py-20 md:py-32">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(45%_40%_at_50%_60%,hsl(var(--brand-light)/0.08),transparent)]" />
        <div className="container mx-auto px-4 text-center">
          <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight text-brand-dark md:text-5xl lg:text-6xl" data-testid="text-hero-title">
            Stop Guessing What to Post.
            <br />
            <span className="text-brand-red">Start Creating Videos That Convert.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl" data-testid="text-hero-subtitle">
            Discover trending topics, generate high-converting scripts, and practice your delivery with AI coaching before you hit record.
          </p>
          
          <div className="mx-auto mt-10 max-w-sm space-y-3">
            <p className="text-sm font-medium text-muted-foreground mb-4">Get started free</p>
            <Button
              variant="default"
              size="lg"
              className="w-full h-12"
              onClick={() => {
                setOauthLoading("google");
                window.location.href = "/api/auth/oauth/google";
              }}
              disabled={oauthLoading !== null}
              data-testid="button-hero-google"
            >
              {oauthLoading === "google" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <SiGoogle className="mr-2 h-4 w-4" />
              )}
              Continue with Google
            </Button>
            <p className="text-sm text-muted-foreground pt-2">
              Or{" "}
              <Link href="/signup" className="font-medium text-brand-light hover:underline" data-testid="link-signup-email">
                sign up with email
              </Link>
            </p>
          </div>

          <div className="mt-8 flex items-center justify-center gap-4">
            <Link href="/login">
              <Button size="lg" variant="ghost" className="h-12 px-8 text-base" data-testid="button-hero-login">
                Already have an account? Log In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <h2 className="mb-12 text-center text-3xl font-bold md:text-4xl" data-testid="text-steps-title">
            Go From Blank Page to Ready-to-Post
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((step, index) => (
              <Card key={step.title} className="relative overflow-visible border-0 bg-card shadow-none" data-testid={`card-step-${index + 1}`}>
                <CardContent className="flex flex-col items-center p-6 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                    <step.icon className="h-8 w-8 text-primary" />
                  </div>
                  <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {index + 1}
                  </div>
                  <h3 className="mb-2 text-xl font-semibold">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <h2 className="mb-4 text-center text-3xl font-bold md:text-4xl" data-testid="text-formula-title">
            The Formula Behind Every Viral Video
          </h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-muted-foreground">
            Top creators follow this proven 5-part structure. Our AI writes scripts using this formula and scores your delivery on each element.
          </p>
          <div className="mx-auto max-w-3xl space-y-4">
            {[
              { num: 1, title: "Hook", desc: "Stop the scroll in the first 3 seconds with a bold question or unexpected statement." },
              { num: 2, title: "Set the Hook", desc: "Build curiosity so strong they have to keep watching to find out more." },
              { num: 3, title: "First Call to Action", desc: "Lock in engagement early with a comment prompt or follow request." },
              { num: 4, title: "Content", desc: "Deliver clear value fast. No fluff, no filler, just actionable insights." },
              { num: 5, title: "Final Call to Action", desc: "Give them one clear next step that moves them closer to you." },
            ].map((item) => (
              <Card key={item.num} className="border bg-background" data-testid={`card-formula-${item.num}`}>
                <CardContent className="flex items-start gap-4 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                    {item.num}
                  </div>
                  <div>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <h2 className="mb-4 text-center text-3xl font-bold md:text-4xl" data-testid="text-features-title">
            Everything You Need to Create With Confidence
          </h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-muted-foreground">
            No more blank screen paralysis. No more second-guessing your content. Get the research tools and AI feedback that make every video stronger.
          </p>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <Card key={feature.title} className="border-0 bg-card shadow-none" data-testid={`card-feature-${index + 1}`}>
                <CardContent className="flex flex-col items-center p-6 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10">
                    <feature.icon className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-brand-dark py-16 md:py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="mb-4 text-3xl font-bold text-white md:text-4xl" data-testid="text-cta-title">
            Ready to Create Videos That Actually Work?
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-white/80">
            Join creators who stopped guessing and started growing. Research, script, practice, post.
          </p>
          <Link href="/signup">
            <Button size="lg" className="h-12 px-8 text-base font-bold" data-testid="button-cta-signup">
              Get Started Free
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
