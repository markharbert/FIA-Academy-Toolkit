import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { LogOut, User, Settings, Menu, X, LayoutDashboard } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import logoImage from "@assets/Mark_Harbert_Logo_(2)_1766503621615.png";

export function Navbar() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-brand-dark shadow-md">
      <div className="container mx-auto flex h-16 items-center justify-between gap-4 px-4 md:px-6">
        <a href="https://markharbert.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2" data-testid="link-logo">
          <img src={logoImage} alt="Mark Harbert" className="h-8" />
        </a>

        <div className="hidden md:flex items-center gap-4">
          {user ? (
            <>
              <Link href="/dashboard">
                <Button
                  variant="ghost"
                  className="text-white font-medium hover:bg-white/10"
                  data-testid="link-dashboard-nav"
                >
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
              {user.isAdmin && (
                <Link href="/admin">
                  <Button
                    variant="ghost"
                    className="text-white font-medium hover:bg-white/10"
                    data-testid="link-admin-nav"
                  >
                    Admin
                  </Button>
                </Link>
              )}
              <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-white hover:bg-white/10 p-0 rounded-full"
                  data-testid="button-user-menu"
                >
                  <Avatar className="h-8 w-8">
                    {user.gravatarUrl && (
                      <AvatarImage 
                        src={user.gravatarUrl} 
                        alt={user.displayName || user.email || "User"} 
                      />
                    )}
                    <AvatarFallback className="bg-primary/20">
                      <User className="h-4 w-4 text-white" />
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-muted-foreground text-sm" disabled>
                  {user.email || user.displayName || "Account"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setLocation("/account")} data-testid="link-account">
                  <User className="mr-2 h-4 w-4" />
                  Account
                </DropdownMenuItem>
                {user.isAdmin && (
                  <DropdownMenuItem onClick={() => setLocation("/admin")} data-testid="link-admin">
                    <Settings className="mr-2 h-4 w-4" />
                    Admin Settings
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} data-testid="button-logout">
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <Link href="/login">
                <Button 
                  variant="ghost" 
                  className="text-white font-bold hover:bg-white/10"
                  data-testid="button-login"
                >
                  Log in
                </Button>
              </Link>
              <Link href="/signup">
                <Button 
                  className="font-bold"
                  data-testid="button-signup"
                >
                  Sign up
                </Button>
              </Link>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="md:hidden text-white hover:bg-white/10"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          data-testid="button-mobile-menu"
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden bg-brand-dark border-t border-white/10 px-4 py-4">
          {user ? (
            <div className="space-y-3">
              <p className="text-white/70 text-sm px-2">{user.email || user.displayName || "Account"}</p>
              <Button
                variant="ghost"
                className="w-full justify-start text-white font-medium hover:bg-white/10"
                onClick={() => {
                  setLocation("/dashboard");
                  setMobileMenuOpen(false);
                }}
                data-testid="mobile-link-dashboard"
              >
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Dashboard
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start text-white font-medium hover:bg-white/10"
                onClick={() => {
                  setLocation("/account");
                  setMobileMenuOpen(false);
                }}
                data-testid="mobile-link-account"
              >
                <User className="mr-2 h-4 w-4" />
                Account
              </Button>
              {user.isAdmin && (
                <Button
                  variant="ghost"
                  className="w-full justify-start text-white font-medium hover:bg-white/10"
                  onClick={() => {
                    setLocation("/admin");
                    setMobileMenuOpen(false);
                  }}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Admin Settings
                </Button>
              )}
              <Button
                variant="ghost"
                className="w-full justify-start text-white font-medium hover:bg-white/10"
                onClick={() => {
                  handleLogout();
                  setMobileMenuOpen(false);
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                <Button 
                  variant="ghost" 
                  className="w-full text-white font-bold hover:bg-white/10"
                >
                  Log in
                </Button>
              </Link>
              <Link href="/signup" onClick={() => setMobileMenuOpen(false)}>
                <Button 
                  className="w-full font-bold"
                >
                  Sign up
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
