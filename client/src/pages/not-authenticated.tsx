import { ExternalLink, Lock, Users } from "lucide-react";
import { Link } from "wouter";
import logoImage from "@assets/image_1788559097620.png";

export default function NotAuthenticated() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12"
      style={{ background: "hsl(230 75% 10%)" }}
    >
      {/* Logo */}
      <div className="mb-10 flex flex-col items-center gap-4">
        <img
          src={logoImage}
          alt="Academy Toolkit"
          className="h-14 w-auto object-contain"
          data-testid="img-not-authenticated-logo"
        />
      </div>

      {/* Card */}
      <div
        className="w-full max-w-md rounded-2xl px-8 py-10 flex flex-col items-center text-center gap-6"
        style={{ background: "hsl(230 60% 15%)", border: "1px solid hsl(230 50% 22%)" }}
      >
        {/* Icon */}
        <div
          className="h-16 w-16 rounded-full flex items-center justify-center"
          style={{ background: "hsl(230 50% 20%)" }}
        >
          <Lock className="h-8 w-8" style={{ color: "hsl(203 54% 53%)" }} />
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Members Only
          </h1>
          <p className="text-sm font-medium" style={{ color: "hsl(203 54% 70%)" }}>
            Fearless Influencer Academy Toolkit
          </p>
        </div>

        {/* Body copy */}
        <div className="space-y-3">
          <p className="text-white/80 text-sm leading-relaxed">
            This platform is exclusively for active members of the Fearless Influencer Academy. 
            You are not currently logged in.
          </p>
          <p className="text-white/60 text-sm leading-relaxed">
            To access the Toolkit, log in to the Members Area first and then click the 
            <strong className="text-white/80"> Academy Toolkit</strong> button from inside your account. 
            That will bring you right in automatically.
          </p>
        </div>

        {/* Primary CTA */}
        <a
          href="https://fearlessmarketinglab.com/login"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: "hsl(203 54% 53%)" }}
          data-testid="link-members-area-login"
        >
          <ExternalLink className="h-4 w-4" />
          Go to Members Area Login
        </a>

        {/* Divider + help text */}
        <p className="text-white/30 text-xs leading-relaxed">
          Already inside the Members Area?{" "}
          <span className="text-white/50">
            Look for the Academy Toolkit button and click it to log in automatically.
          </span>
        </p>
      </div>

      {/* Footer */}
      <p className="mt-8 text-white/25 text-xs text-center">
        Need help? Contact support through the Members Area.
      </p>

      {/* Collaborator login path */}
      <div className="mt-5 flex items-center gap-2 text-xs text-white/30">
        <Users className="h-3.5 w-3.5 shrink-0" />
        <span>
          Workspace collaborator?{" "}
          <Link
            href="/login"
            className="text-white/50 underline underline-offset-2 hover:text-white/80 transition-colors"
            data-testid="link-collaborator-login"
          >
            Sign in here
          </Link>
        </span>
      </div>
    </div>
  );
}
