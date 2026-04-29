import { Mail } from "lucide-react";

export default function EmailToolsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero header */}
      <div className="bg-sidebar text-sidebar-foreground px-6 py-10">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Mail className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Email Tools</h1>
          </div>
          <p className="text-white/50 text-sm mt-1.5 max-w-xl">
            Everything you need to write, optimize, and grow through email marketing — all in one place.
          </p>
        </div>
      </div>

      {/* Tool grid — tools will appear here */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {/* Tool cards will be added here */}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-10 opacity-60">
          More tools coming soon
        </p>
      </div>
    </div>
  );
}
