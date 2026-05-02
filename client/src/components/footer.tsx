import logoUrl from "@assets/academy_toolkit_logo_1776551500119.png";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer
      className="border-t border-border bg-background mt-8"
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
          <span className="text-xs text-muted-foreground tabular-nums">
            © {year} Academy Toolkit
          </span>
        </div>
        <nav className="flex items-center gap-5 text-sm">
          <a
            href="https://markharbert.com/terms-and-conditions"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-footer-terms"
          >
            Terms &amp; Conditions
          </a>
          <a
            href="#"
            className="text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-footer-privacy"
          >
            Privacy Policy
          </a>
        </nav>
      </div>
    </footer>
  );
}
