import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Video, FileText, TrendingUp, CheckCircle, Sparkles, Target } from "lucide-react";

const steps = [
  {
    icon: Video,
    title: "Record",
    description: "Practice your video marketing message using your webcam. Record as many takes as you need.",
  },
  {
    icon: FileText,
    title: "Transcribe",
    description: "Get an automatic transcript of your recording. Edit it if needed for more accurate scoring.",
  },
  {
    icon: TrendingUp,
    title: "Get Scored",
    description: "Receive detailed feedback on all 5 parts of the video formula with specific improvement suggestions.",
  },
];

const features = [
  {
    icon: CheckCircle,
    title: "5-Part Video Formula",
    description: "Master the proven structure: Hook, Set the Hook, First CTA, Content, and Final CTA.",
  },
  {
    icon: Sparkles,
    title: "AI-Powered Feedback",
    description: "Get specific, actionable suggestions for each part of your video, not generic advice.",
  },
  {
    icon: Target,
    title: "Goal-Specific Coaching",
    description: "Tailor your feedback to your goal: Sales, Lead Capture, Education, or Recruitment.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      <section className="relative overflow-hidden bg-background py-20 md:py-32">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(45%_40%_at_50%_60%,hsl(var(--brand-light)/0.08),transparent)]" />
        <div className="container mx-auto px-4 text-center">
          <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight text-brand-dark md:text-5xl lg:text-6xl" data-testid="text-hero-title">
            Practice Video Marketing,
            <br />
            <span className="text-brand-red">Get Feedback, Build Confidence</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl" data-testid="text-hero-subtitle">
            Record practice videos, get AI-powered scoring on the 5-part video creation formula, 
            and receive specific suggestions to improve your delivery.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href="/signup">
              <Button size="lg" className="h-12 px-8 text-base" data-testid="button-hero-signup">
                Get Started Free
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="h-12 px-8 text-base" data-testid="button-hero-login">
                Log In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <h2 className="mb-12 text-center text-3xl font-bold md:text-4xl" data-testid="text-steps-title">
            How It Works
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
            The 5-Part Video Creation Formula
          </h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-muted-foreground">
            Every great marketing video follows this proven structure. Our AI analyzes each part 
            and gives you specific feedback.
          </p>
          <div className="mx-auto max-w-3xl space-y-4">
            {[
              { num: 1, title: "Hook", desc: "Grab attention in the first 1-3 seconds with a sharp question, bold promise, or audience callout." },
              { num: 2, title: "Set the Hook", desc: "Create curiosity that makes viewers want to keep watching. Tease what's coming or set up a story." },
              { num: 3, title: "First Call to Action", desc: "Ask for an early micro-action: \"Comment the word...\", \"Follow for more...\", or \"Stick with me...\"" },
              { num: 4, title: "Content", desc: "Deliver your value clearly with 1-3 key points, clear steps, or a simple explanation." },
              { num: 5, title: "Final Call to Action", desc: "End with a clear next step: \"Click the link...\", \"Download the guide...\", or \"Send me a message...\"" },
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
          <h2 className="mb-12 text-center text-3xl font-bold md:text-4xl" data-testid="text-features-title">
            Why Fearless Video Coach?
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
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
            Ready to Build Your Video Confidence?
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-white/80">
            Start practicing today. Record, get feedback, improve, and watch your confidence grow.
          </p>
          <Link href="/signup">
            <Button size="lg" className="h-12 px-8 text-base font-bold" data-testid="button-cta-signup">
              Start Practicing Now
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
