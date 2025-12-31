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
    description: "Find trending topics your audience is searching for. See real search data and untapped opportunities.",
  },
  {
    icon: PenTool,
    title: "Create",
    description: "Generate scroll-stopping scripts in seconds using our proven 5-part formula. Edit and refine until perfect.",
  },
  {
    icon: Video,
    title: "Practice",
    description: "Record your video, get instant AI feedback, and polish your delivery before going live.",
  },
];

const features = [
  {
    icon: Zap,
    title: "Topic Pulse Research",
    description: "Stop guessing what to post. Discover what your audience is actively searching for with real keyword data.",
  },
  {
    icon: Sparkles,
    title: "AI Script Generator",
    description: "Turn any topic into a complete video script with hooks, CTAs, and content that converts.",
  },
  {
    icon: Target,
    title: "Smart Video Scoring",
    description: "Get scored on all 5 parts of the formula with specific fixes to make every video stronger.",
  },
  {
    icon: TrendingUp,
    title: "YouTube Research",
    description: "Analyze top-performing videos, study winning comments, and learn what makes content go viral.",
  },
  {
    icon: CheckCircle,
    title: "Proven Formula",
    description: "Master the 5-part structure used by top creators: Hook, Set the Hook, First CTA, Content, Final CTA.",
  },
  {
    icon: FileText,
    title: "Complete Content System",
    description: "From topic research to final script, everything you need to create videos that get results.",
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
            Stop Struggling with Video Ideas.
            <br />
            <span className="text-brand-red">Start Creating Content That Converts.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl" data-testid="text-hero-subtitle">
            Find trending topics, generate scroll-stopping scripts, and practice your delivery with AI coaching. 
            Everything you need to create videos that actually get results.
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
            From Blank Page to Ready-to-Post in Minutes
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
            The Secret Formula Behind Viral Videos
          </h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-muted-foreground">
            Top creators don't wing it. They follow this proven 5-part structure. 
            Our AI writes scripts using this formula and scores your delivery on every element.
          </p>
          <div className="mx-auto max-w-3xl space-y-4">
            {[
              { num: 1, title: "Hook", desc: "Stop the scroll in 1-3 seconds. A sharp question, bold claim, or unexpected statement that demands attention." },
              { num: 2, title: "Set the Hook", desc: "Build irresistible curiosity. Tease what's coming so they can't look away." },
              { num: 3, title: "First Call to Action", desc: "Lock in engagement early: \"Comment if...\" or \"Follow for the rest...\" This boosts your algorithm ranking." },
              { num: 4, title: "Content", desc: "Deliver the goods. Clear, valuable, easy to follow. No fluff, just results." },
              { num: 5, title: "Final Call to Action", desc: "Tell them exactly what to do next. One clear action that moves them closer to working with you." },
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
            Your Complete Video Content System
          </h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-muted-foreground">
            No more staring at a blank screen. No more wondering if your video is good enough. 
            Get the tools and feedback you need to create with confidence.
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
            Your Next Viral Video Starts Here
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-white/80">
            Join creators who stopped guessing and started growing. Find your next topic, generate your script, and nail your delivery.
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
