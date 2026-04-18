import logoImage from "@assets/academy_toolkit_logo_1776551500119.png";
import { Lock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-white"
      style={{ background: "hsl(230, 75%, 10%)" }}
      data-testid="container-landing"
    >
      <div className="flex flex-col items-center text-center max-w-lg w-full gap-8">

        <img
          src={logoImage}
          alt="Academy Toolkit"
          className="w-72 max-w-full"
          data-testid="img-landing-logo"
        />

        <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-sm font-medium tracking-wide uppercase text-white/80">
          <Lock className="h-3.5 w-3.5" />
          Members Only Access
        </div>

        <div className="space-y-4">
          <h1 className="text-3xl md:text-4xl font-bold leading-tight" data-testid="text-landing-headline">
            For Fearless Influencer Academy Members Only
          </h1>
          <p className="text-white/70 text-lg leading-relaxed" data-testid="text-landing-subtext">
            This toolkit is exclusively available to active members of the Fearless Influencer Academy. If you're a member, access your toolkit through the link in your members area.
          </p>
        </div>

        <div className="space-y-3 w-full max-w-xs">
          <p className="text-white/50 text-sm">Not a member yet?</p>
          <a
            href="https://www.fearlessinfluencer.com/join"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-join-academy"
          >
            <Button
              size="lg"
              className="w-full h-12 text-base font-bold bg-brand-red hover:bg-brand-red/90 text-white"
            >
              Join the Academy
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </a>
        </div>

      </div>
    </div>
  );
}
