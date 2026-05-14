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
  Target,
  BookOpen,
  Briefcase,
  MessageSquarePlus,
  Users,
  BarChart2,
} from "lucide-react";
import logoImage from "@assets/academy_toolkit_logo_1776551500119.png";
import lionLogo from "@assets/FI_Lion_Logo_(2)_1777779197459.png";

const VIDEO_TOOL_PATHS = ["/video-score", "/video-trends", "/video-trends/scripts", "/video-trends/explore", "/video-trends/saved", "/video-trends/settings", "/teleprompter"];
const EMAIL_TOOL_PATHS = ["/email-tools/inbox-analyzer", "/email-tools/sender-reputation", "/email-tools/inbox-intel"];
const ANALYTICS_TOOL_PATHS = ["/analytics/youtube", "/analytics/search-console"];

const allNavItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
    testId: "nav-dashboard",
    collaboratorVisible: false,
  },
  {
    title: "DMO Tracker",
    url: "/dmo-tracker",
    icon: Target,
    testId: "nav-dmo-tracker",
    collaboratorVisible: false,
  },
  {
    title: "Projects",
    url: "/projects",
    icon: Briefcase,
    testId: "nav-projects",
    matchPaths: ["/projects"],
    collaboratorVisible: true,
  },
  {
    title: "Video Tools",
    url: "/video-tools",
    icon: Wrench,
    testId: "nav-video-tools",
    matchPaths: VIDEO_TOOL_PATHS,
    collaboratorVisible: false,
  },
  {
    title: "Email Tools",
    url: "/email-tools",
    icon: Mail,
    testId: "nav-email-tools",
    matchPaths: EMAIL_TOOL_PATHS,
    collaboratorVisible: false,
  },
  {
    title: "Analytics",
    url: "/analytics",
    icon: BarChart2,
    testId: "nav-analytics",
    matchPaths: ANALYTICS_TOOL_PATHS,
    collaboratorVisible: false,
  },
];

export function AppSidebar() {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state } = useSidebar();
  const isCollaborator = !!user?.isCollaborator;
  const navItems = isCollaborator
    ? allNavItems.filter((item) => item.collaboratorVisible)
    : allNavItems;

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
              className={
                state === "collapsed"
                  ? "flex items-center justify-center overflow-visible"
                  : "flex items-center justify-start overflow-visible"
              }
            >
              {state === "collapsed" ? (
                <img
                  src={lionLogo}
                  alt="Academy Toolkit"
                  className="h-10 w-auto object-contain"
                  data-testid="img-logo-collapsed"
                />
              ) : (
                <img
                  src={logoImage}
                  alt="Academy Toolkit"
                  className="h-12 w-auto"
                  data-testid="img-logo-expanded"
                />
              )}
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
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location.startsWith("/feedback")}
                  tooltip="Report a Bug / Request a Feature"
                  onClick={() => setLocation("/feedback")}
                  data-testid="nav-feedback"
                >
                  <MessageSquarePlus />
                  <span>Bug / Feature Requests</span>
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
          {isCollaborator && (
            <SidebarMenuItem>
              <div className="px-2 py-1.5 text-xs text-amber-400/80 flex items-center gap-1.5">
                <Users className="h-3 w-3 shrink-0" />
                <span className="truncate">Collaborator workspace</span>
              </div>
            </SidebarMenuItem>
          )}
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
