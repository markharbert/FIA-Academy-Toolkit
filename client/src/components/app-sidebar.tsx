import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  LayoutDashboard,
  Video,
  TrendingUp,
  FileText,
  User,
  LogOut,
  Shield,
  ExternalLink,
} from "lucide-react";
import logoImage from "@assets/academy_toolkit_logo_1776551500119.png";

const navItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
    testId: "nav-dashboard",
  },
  {
    title: "Video Score",
    url: "/video-score",
    icon: Video,
    testId: "nav-video-score",
  },
  {
    title: "Video Trends",
    url: "/video-trends",
    icon: TrendingUp,
    testId: "nav-video-trends",
  },
  {
    title: "Scripts",
    url: "/video-trends/scripts",
    icon: FileText,
    testId: "nav-scripts",
  },
];

export function AppSidebar() {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state } = useSidebar();

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  const handleGoToClickFunnels = async () => {
    try {
      const res = await fetch("/api/clickfunnels/sso-url", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch {
      // If CF not configured just open the workspace domain directly
      const domain = window.location.hostname;
      window.open(`https://${domain}`, "_blank", "noopener,noreferrer");
    }
  };

  if (!user) return null;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex items-center justify-start">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              onClick={() => setLocation("/dashboard")}
              data-testid="link-logo"
              className="flex items-center justify-start overflow-visible"
            >
              <img 
                src={logoImage} 
                alt="Academy Toolkit" 
                className={state === "collapsed" ? "h-8 w-auto" : "h-10 w-auto"} 
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    isActive={location === item.url || (item.url !== "/dashboard" && location.startsWith(item.url))}
                    tooltip={item.title}
                    onClick={() => setLocation(item.url)}
                    data-testid={item.testId}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />
        <SidebarGroup>
          <SidebarGroupLabel>My Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Back to Dashboard"
                  onClick={() => window.open("https://www.fearlessmarketinglab.com/courses/fearless-influencer-academy", "_blank", "noopener,noreferrer")}
                  data-testid="nav-clickfunnels"
                >
                  <ExternalLink />
                  <span>Back to Dashboard</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {user.isAdmin && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Admin</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={location === "/admin"}
                      tooltip="Admin"
                      onClick={() => setLocation("/admin")}
                      data-testid="nav-admin"
                    >
                      <Shield />
                      <span>Admin Panel</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setLocation("/account")}
              tooltip="Account Settings"
              data-testid="link-account"
            >
              <Avatar className="h-5 w-5">
                {user.gravatarUrl && (
                  <AvatarImage
                    src={user.gravatarUrl}
                    alt={user.displayName || user.email || "User"}
                  />
                )}
                <AvatarFallback>
                  <User className="h-3 w-3" />
                </AvatarFallback>
              </Avatar>
              <span className="truncate">
                {user.displayName || user.email?.split("@")[0] || "Account"}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              tooltip="Log out"
              data-testid="button-logout"
            >
              <LogOut />
              <span>Log out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
