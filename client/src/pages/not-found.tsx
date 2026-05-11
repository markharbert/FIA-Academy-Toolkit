import { useLocation } from "wouter";
import { Home, SearchX } from "lucide-react";
import logoImage from "@assets/academy_toolkit_logo_1776551500119.png";

export default function NotFound() {
  const [, navigate] = useLocation();

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12"
      style={{ background: "hsl(230 75% 10%)" }}
    >
      {/* Logo */}
      <div className="mb-10">
        <img
          src={logoImage}
          alt="Academy Toolkit"
          className="h-14 w-auto object-contain"
          data-testid="img-not-found-logo"
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
          <SearchX className="h-8 w-8" style={{ color: "hsl(203 54% 53%)" }} />
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Page Not Found
          </h1>
          <p className="text-sm font-medium" style={{ color: "hsl(203 54% 70%)" }}>
            Error 404
          </p>
        </div>

        {/* Body */}
        <p className="text-white/70 text-sm leading-relaxed">
          The page you're looking for doesn't exist or may have moved. 
          Let's get you back to somewhere useful.
        </p>

        {/* Back to dashboard */}
        <button
          onClick={() => navigate("/dashboard")}
          className="w-full flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: "hsl(203 54% 53%)" }}
          data-testid="button-go-to-dashboard"
        >
          <Home className="h-4 w-4" />
          Go to Dashboard
        </button>
      </div>

      {/* Footer */}
      <p className="mt-8 text-white/25 text-xs text-center">
        Fearless Influencer Academy Toolkit
      </p>
    </div>
  );
}
