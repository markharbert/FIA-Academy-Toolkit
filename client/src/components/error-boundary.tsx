import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(err: unknown): State {
    const message = err instanceof Error ? err.message : String(err);
    return { hasError: true, message };
  }

  componentDidCatch(err: unknown, info: { componentStack: string }) {
    console.error("[ErrorBoundary] Caught render error:", err, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center px-4"
          style={{ background: "hsl(230,75%,10%)" }}>
          <div className="max-w-md w-full rounded-xl p-8 text-center"
            style={{ background: "hsl(230,45%,14%)", border: "1px solid hsl(230,45%,22%)" }}>
            <p className="text-2xl mb-2">⚠️</p>
            <h1 className="text-white font-semibold text-lg mb-2">Something went wrong</h1>
            <p className="text-white/50 text-sm mb-6">
              An unexpected error occurred. Please refresh the page to try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: "hsl(230,75%,40%)" }}
            >
              Refresh page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
