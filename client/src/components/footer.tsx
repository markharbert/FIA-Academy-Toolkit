import { Shield } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-[#06092a] py-8">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col items-center justify-center gap-3 text-center text-sm">
          <div className="flex items-center gap-2 text-white/90">
            <Shield className="h-4 w-4" />
            <span>Your recordings are private and only visible to your account.</span>
          </div>
          <p className="text-white/70 font-medium">&copy; {new Date().getFullYear()} Fearless Video Coach. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
