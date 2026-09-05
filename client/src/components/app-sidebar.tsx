import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Collapsible, CollapsibleContent } from "@radix-ui/react-collapsible";
import { cn } from "@/lib/utils";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  LayoutDashboard,
  PlayCircle,
  Mail,
  User,
  LogOut,
  Shield,
  BookOpen,
  MessageSquarePlus,
  Users,
  BarChart2,
  ChevronDown,
  ChevronRight,
  CalendarDays,
  BookMarked,
  LayoutList,
} from "lucide-react";
import logoImage from "@assets/image_1788559097620.png";
import cfLogo from "@/assets/cf-logo.png";

type NavChild = {
  title: string;
  url: string;
  testId: string;
  matchPaths?: string[];
  activeClass: string;
  /** Hide from workspace collaborators (default: visible) */
  collaboratorVisible?: boolean;
  /** Hide from non-admin members (default: visible) */
  adminOnly?: boolean;
};

type NavItem = {
  title: string;
  url: string;
  icon: React.ElementType;
  iconColor: string;
  testId: string;
  collaboratorVisible: boolean;
  adminOnly?: boolean;
  matchPaths?: string[];
  activeClass?: string;
  subMenuBorderClass?: string;
  children?: NavChild[];
};

const allNavItems: NavItem[] = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
    iconColor: "text-sky-400",
    testId: "nav-dashboard",
    collaboratorVisible: false,
  },
  {
    title: "Planning",
    url: "/dmo-tracker",
    icon: CalendarDays,
    iconColor: "text-orange-400",
    testId: "nav-planning",
    collaboratorVisible: true,
    activeClass: "!bg-orange-500/15",
    subMenuBorderClass: "!border-orange-500/40",
    children: [
      {
        title: "DMO Tracker",
        url: "/dmo-tracker",
        testId: "nav-dmo-tracker",
        activeClass: "!bg-orange-500/10 !text-orange-200 font-medium",
        collaboratorVisible: false,
      },
      {
        title: "Projects",
        url: "/projects",
        testId: "nav-projects",
        matchPaths: ["/projects"],
        activeClass: "!bg-orange-500/10 !text-orange-200 font-medium",
        collaboratorVisible: true,
      },
      {
        title: "Funnel Grid",
        url: "/funnel-grid",
        testId: "nav-funnel-grid",
        matchPaths: ["/funnel-grid"],
        activeClass: "!bg-orange-500/10 !text-orange-200 font-medium",
        collaboratorVisible: false,
      },
    ],
  },
  {
    title: "Video Studio",
    url: "/video-studio",
    icon: PlayCircle,
    iconColor: "text-rose-400",
    testId: "nav-video-studio",
    collaboratorVisible: false,
    activeClass: "!bg-rose-500/15",
    subMenuBorderClass: "!border-rose-500/40",
    children: [
      {
        title: "Research",
        url: "/video-studio/research",
        testId: "nav-topic-pulse",
        matchPaths: ["/video-studio/research", "/video-studio/research/explore", "/video-studio/research/saved"],
        activeClass: "!bg-rose-500/10 !text-rose-200 font-medium",
      },
      {
        title: "Scripts",
        url: "/video-studio/scripts",
        testId: "nav-video-scripts",
        activeClass: "!bg-rose-500/10 !text-rose-200 font-medium",
      },
      {
        title: "Teleprompter",
        url: "/video-studio/record",
        testId: "nav-teleprompter",
        activeClass: "!bg-rose-500/10 !text-rose-200 font-medium",
      },
      {
        title: "Video Score",
        url: "/video-score",
        testId: "nav-video-score",
        matchPaths: ["/video-score", "/video-score-upload"],
        activeClass: "!bg-rose-500/10 !text-rose-200 font-medium",
      },
    ],
  },
  {
    title: "Email Tools",
    url: "/email-tools",
    icon: Mail,
    iconColor: "text-teal-400",
    testId: "nav-email-tools",
    collaboratorVisible: false,
    activeClass: "!bg-teal-500/15",
    subMenuBorderClass: "!border-teal-500/40",
    children: [
      {
        title: "Inbox Analyzer",
        url: "/email-tools/inbox-analyzer",
        testId: "nav-inbox-analyzer",
        activeClass: "!bg-teal-500/10 !text-teal-200 font-medium",
      },
      {
        title: "Sender Reputation",
        url: "/email-tools/sender-reputation",
        testId: "nav-sender-rep",
        activeClass: "!bg-teal-500/10 !text-teal-200 font-medium",
      },
      {
        title: "Inbox Intel",
        url: "/email-tools/inbox-intel",
        testId: "nav-inbox-intel",
        activeClass: "!bg-teal-500/10 !text-teal-200 font-medium",
      },
    ],
  },
  {
    title: "Analytics",
    url: "/analytics",
    icon: BarChart2,
    iconColor: "text-emerald-400",
    testId: "nav-analytics",
    collaboratorVisible: false,
    activeClass: "!bg-emerald-500/15",
    subMenuBorderClass: "!border-emerald-500/40",
    children: [
      {
        title: "YouTube",
        url: "/analytics/youtube",
        testId: "nav-youtube",
        activeClass: "!bg-emerald-500/10 !text-emerald-200 font-medium",
      },
      {
        title: "Search Console",
        url: "/analytics/search-console",
        testId: "nav-search-console",
        activeClass: "!bg-emerald-500/10 !text-emerald-200 font-medium",
      },
    ],
  },
  {
    title: "Library",
    url: "/links",
    icon: BookMarked,
    iconColor: "text-purple-400",
    testId: "nav-library",
    collaboratorVisible: false,
    activeClass: "!bg-purple-500/15",
    subMenuBorderClass: "!border-purple-500/40",
    children: [
      {
        title: "Link Vault",
        url: "/links",
        testId: "nav-links",
        activeClass: "!bg-purple-500/10 !text-purple-200 font-medium",
      },
      {
        title: "Swipe File",
        url: "/swipe-file",
        testId: "nav-swipe-file",
        activeClass: "!bg-purple-500/10 !text-purple-200 font-medium",
        adminOnly: true,
      },
    ],
  },
];

function isChildActive(child: NavChild, location: string) {
  if (child.matchPaths) {
    return child.matchPaths.some(
      (p) => location === p || location.startsWith(p + "/") || location.startsWith(p + "-")
    );
  }
  return location === child.url || location.startsWith(child.url + "/");
}

function isGroupActive(item: NavItem, location: string): boolean {
  if (location === item.url) return true;
  if (item.children) {
    return item.children.some((child) => isChildActive(child, location));
  }
  if (item.matchPaths) {
    return item.matchPaths.some(
      (p) => location === p || location.startsWith(p + "/")
    );
  }
  if (item.url !== "/dashboard") {
    return location.startsWith(item.url);
  }
  return false;
}

export function AppSidebar() {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state } = useSidebar();
  const isCollaborator = !!user?.isCollaborator;
  const navItems = isCollaborator
    ? allNavItems.filter((item) => item.collaboratorVisible)
    : allNavItems.filter((item) => !item.adminOnly || user?.isAdmin);

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  if (!user) return null;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader
        className="flex items-center justify-start border-b"
        style={{ borderColor: "hsl(230 60% 16%)", background: "linear-gradient(180deg, hsl(230 75% 14%) 0%, hsl(230 75% 10%) 100%)" }}
      >
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
                  src="/lion-logo.png"
                  alt="Fearless Influencer Academy"
                  className="h-10 w-10 object-contain"
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
                const groupActive = isGroupActive(item, location);

                if (item.children) {
                  // Filter children based on the viewer's role
                  const visibleChildren = isCollaborator
                    ? item.children.filter((c) => c.collaboratorVisible !== false)
                    : item.children.filter((c) => !c.adminOnly || user?.isAdmin);

                  if (visibleChildren.length === 0) return null;

                  return (
                    <Collapsible key={item.url} open={groupActive}>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          isActive={groupActive}
                          tooltip={item.title}
                          onClick={() => setLocation(item.url)}
                          data-testid={item.testId}
                          className={groupActive && item.activeClass ? item.activeClass : ""}
                        >
                          <item.icon className={groupActive ? undefined : item.iconColor} />
                          <span>{item.title}</span>
                          <ChevronDown
                            className={cn(
                              "ml-auto h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform duration-200",
                              groupActive && "rotate-180 text-current"
                            )}
                          />
                        </SidebarMenuButton>
                        <CollapsibleContent>
                          <SidebarMenuSub className={item.subMenuBorderClass}>
                            {visibleChildren.map((child) => {
                              const childIsActive = isChildActive(child, location);
                              return (
                                <SidebarMenuSubItem key={child.url}>
                                  <SidebarMenuSubButton
                                    isActive={childIsActive}
                                    onClick={() => setLocation(child.url)}
                                    data-testid={child.testId}
                                    style={{ cursor: "pointer" }}
                                    className={
                                      childIsActive
                                        ? child.activeClass
                                        : "text-white/55 hover:!text-white"
                                    }
                                  >
                                    <span>{child.title}</span>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }

                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      isActive={groupActive}
                      tooltip={item.title}
                      onClick={() => setLocation(item.url)}
                      data-testid={item.testId}
                    >
                      <item.icon className={groupActive ? undefined : item.iconColor} />
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
                  <BookOpen className={location.startsWith("/help") ? undefined : "text-slate-400"} />
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
                  <MessageSquarePlus className={location.startsWith("/feedback") ? undefined : "text-slate-400"} />
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
                      isActive={location.startsWith("/admin/training-library")}
                      tooltip="Vault Manager"
                      onClick={() => setLocation("/admin/training-library")}
                      data-testid="nav-admin-training-library"
                    >
                      <BookMarked className={location.startsWith("/admin/training-library") ? undefined : "text-violet-400"} />
                      <span>Vault Manager</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={location === "/admin"}
                      tooltip="Admin Panel"
                      onClick={() => setLocation("/admin")}
                      data-testid="nav-admin"
                    >
                      <Shield className={location === "/admin" ? undefined : "text-violet-400"} />
                      <span>Admin Panel</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={location.startsWith("/admin/courses")}
                      tooltip="Courses"
                      onClick={() => setLocation("/admin/courses")}
                      data-testid="nav-courses"
                    >
                      <LayoutList className={location.startsWith("/admin/courses") ? undefined : "text-violet-400"} />
                      <span>Courses</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={location.startsWith("/admin/clickfunnels")}
                      tooltip="ClickFunnels"
                      onClick={() => setLocation("/admin/clickfunnels")}
                      data-testid="nav-clickfunnels"
                    >
                      <img src={cfLogo} alt="ClickFunnels" className="h-4 w-4 object-contain" />
                      <span>ClickFunnels</span>
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
              <LogOut className="text-slate-400" />
              <span>Log out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
