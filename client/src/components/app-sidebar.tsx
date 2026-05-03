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
  Wrench,
  Mail,
  User,
  LogOut,
  Shield,
  ExternalLink,
  Target,
  BookOpen,
} from "lucide-react";
import logoImage from "@assets/academy_toolkit_logo_1776551500119.png";

const VIDEO_TOOL_PATHS = ["/video-score", "/video-trends", "/video-trends/scripts", "/video-trends/explore", "/video-trends/saved", "/video-trends/settings", "/teleprompter"];
const EMAIL_TOOL_PATHS = ["/email-tools/inbox-analyzer", "/email-tools/sender-reputation", "/email-tools/inbox-intel"];

const navItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
    testId: "nav-dashboard",
  },
  {
    title: "DMO Tracker",
    url: "/dmo-tracker",
    icon: Target,
    testId: "nav-dmo-tracker",
  },
  {
    title: "Video Tools",
    url: "/video-tools",
    icon: Wrench,
    testId: "nav-video-tools",
    matchPaths: VIDEO_TOOL_PATHS,
  },
  {
    title: "Email Tools",
    url: "/email-tools",
    icon: Mail,
    testId: "nav-email-tools",
    matchPaths: EMAIL_TOOL_PATHS,
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
                className={state === "collapsed" ? "h-10 w-auto" : "h-12 w-auto"} 
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
              {navItems.map((item) => {
                const isActive = location === item.url
                  || (item.url !== "/dashboard" && !item.matchPaths && location.startsWith(item.url))
                  || (item.matchPaths?.some(p => location === p || location.startsWith(p + "/")) ?? false);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.title}
                      onClick={() => setLocation(item.url)}
                      data-testid={item.testId}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
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

        <SidebarSeparator />
        <SidebarGroup>
          <SidebarGroupLabel>Help &amp; Support</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location.startsWith("/help")}
                  tooltip="Help Docs"
                  onClick={() => setLocation("/help")}
                  data-testid="nav-help"
                >
                  <BookOpen />
                  <span>Help Docs</span>
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
