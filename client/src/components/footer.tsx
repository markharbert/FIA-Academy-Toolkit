import logoUrl from "@assets/academy_toolkit_logo_1776551500119.png";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer
      className="bg-[hsl(230,45%,14%)] text-white"
      data-testid="site-footer"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img
            src={logoUrl}
            alt="Academy Toolkit"
            className="h-8 w-auto"
            data-testid="img-footer-logo"
          />
          <span className="text-xs text-white tabular-nums">
            © {year} Academy Toolkit
          </span>
        </div>
        <nav className="flex items-center gap-5 text-sm">
          <a
            href="https://markharbert.com/terms-and-conditions"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white hover:text-white/80 transition-colors"
            data-testid="link-footer-terms"
          >
            Terms &amp; Conditions
          </a>
          <a
            href="https://markharbert.com/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white hover:text-white/80 transition-colors"
            data-testid="link-footer-privacy"
          >
            Privacy Policy
          </a>
        </nav>
      </div>
    </footer>
  );
}
