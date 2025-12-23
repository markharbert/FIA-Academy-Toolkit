import { Shield } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t bg-muted/30 py-6">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span>Your recordings are private and only visible to your account.</span>
          </div>
          <p>&copy; {new Date().getFullYear()} Video Confidence Coach. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
