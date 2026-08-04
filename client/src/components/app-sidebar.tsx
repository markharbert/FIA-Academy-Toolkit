import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@radix-ui/react-collapsible";
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
  ChevronDown,
  GitFork,
  Lightbulb,
  Tag,
  Video,
  TrendingUp,
  Monitor,
  Package,
  Star,
  Leaf,
  Rocket,
  Trophy,
  Layers,
} from "lucide-react";
import logoImage from "@assets/academy_toolkit_logo_1776551500119.png";
import lionLogo from "@assets/FI_Lion_Logo_(2)_1777779197459.png";

// ─── Framework structure ──────────────────────────────────────────────────────

const LEVELS = [
  {
    id: "level1",
    label: "Level 1 · Genesis",
    icon: Leaf,
    iconColor: "text-emerald-400",
    activeClass: "!bg-emerald-500/15",
    subBorderClass: "!border-emerald-500/30",
    testId: "nav-level1",
    stages: [
      { label: "Personal Philosophy", url: "/framework/stage-1", testId: "nav-stage-1", num: 1 },
      { label: "Irresistible Offer", url: "/framework/stage-2", testId: "nav-stage-2", num: 2 },
      { label: "Sales Funnels & Email", url: "/framework/stage-3", testId: "nav-stage-3", num: 3 },
    ],
  },
  {
    id: "level2",
    label: "Level 2 · Momentum",
    icon: Rocket,
    iconColor: "text-amber-400",
    activeClass: "!bg-amber-500/15",
    subBorderClass: "!border-amber-500/30",
    testId: "nav-level2",
    stages: [
      { label: "Social Networking", url: "/framework/stage-4", testId: "nav-stage-4", num: 4 },
      { label: "Organic Content", url: "/framework/stage-5", testId: "nav-stage-5", num: 5 },
      { label: "Paid Marketing", url: "/framework/stage-6", testId: "nav-stage-6", num: 6 },
    ],
  },
  {
    id: "level3",
    label: "Level 3 · Apex",
    icon: Trophy,
    iconColor: "text-violet-400",
    activeClass: "!bg-violet-500/15",
    subBorderClass: "!border-violet-500/30",
    testId: "nav-level3",
    stages: [
      { label: "Presentations", url: "/framework/stage-7", testId: "nav-stage-7", num: 7 },
      { label: "Digital Products", url: "/framework/stage-8", testId: "nav-stage-8", num: 8 },
      { label: "High Ticket Coaching", url: "/framework/stage-9", testId: "nav-stage-9", num: 9 },
    ],
  },
];

export function AppSidebar() {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state } = useSidebar();
  const isCollaborator = !!user?.isCollaborator;

  // Per-level manual expand/collapse state
  const [level1Expanded, setLevel1Expanded] = useState(false);
  const [level2Expanded, setLevel2Expanded] = useState(false);
  const [level3Expanded, setLevel3Expanded] = useState(false);

  const levelExpandedStates = [level1Expanded, level2Expanded, level3Expanded];
  const levelSetters = [setLevel1Expanded, setLevel2Expanded, setLevel3Expanded];

  // Derive active state for each level
  const levelActive = LEVELS.map(level =>
    level.stages.some(s => location === s.url || location.startsWith(s.url + "/"))
  );

  const analyticsActive = location.startsWith("/analytics");
  const analyticsChildren = [
    { label: "YouTube", url: "/analytics/youtube", testId: "nav-youtube" },
    { label: "Search Console", url: "/analytics/search-console", testId: "nav-search-console" },
  ];

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
        {/* ── Dashboard ─────────────────────────────────────────────────────── */}
        {!isCollaborator && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={location === "/dashboard"}
                    tooltip="Dashboard"
                    onClick={() => setLocation("/dashboard")}
                    data-testid="nav-dashboard"
                  >
                    <LayoutDashboard className={location === "/dashboard" ? undefined : "text-sky-400"} />
                    <span>Dashboard</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarSeparator />

        {/* ── Keystone Framework ────────────────────────────────────────────── */}
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-1.5">
            <Layers className="h-3 w-3" />
            Keystone Framework
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {LEVELS.map((level, idx) => {
                const isActive = levelActive[idx];
                const isOpen = isActive || levelExpandedStates[idx];
                const LevelIcon = level.icon;

                return (
                  <Collapsible
                    key={level.id}
                    open={isOpen}
                    onOpenChange={(open) => levelSetters[idx](open)}
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          isActive={isActive}
                          tooltip={level.label}
                          data-testid={level.testId}
                          className={isActive ? level.activeClass : ""}
                        >
                          <LevelIcon className={isActive ? undefined : level.iconColor} />
                          <span>{level.label}</span>
                          <ChevronDown
                            className={cn(
                              "ml-auto h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform duration-200",
                              isOpen && "rotate-180 text-current"
                            )}
                          />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub className={level.subBorderClass}>
                          {level.stages.map((stage) => {
                            const stageActive = location === stage.url || location.startsWith(stage.url + "/");
                            const activeColorClass =
                              idx === 0
                                ? "!bg-emerald-500/10 !text-emerald-200 font-medium"
                                : idx === 1
                                ? "!bg-amber-500/10 !text-amber-200 font-medium"
                                : "!bg-violet-500/10 !text-violet-200 font-medium";
                            return (
                              <SidebarMenuSubItem key={stage.url}>
                                <SidebarMenuSubButton
                                  isActive={stageActive}
                                  onClick={() => setLocation(stage.url)}
                                  data-testid={stage.testId}
                                  style={{ cursor: "pointer" }}
                                  className={stageActive ? activeColorClass : "text-white/55 hover:!text-white"}
                                >
                                  <span className={`text-xs font-mono shrink-0 w-4 ${stageActive ? "" : "text-white/25"}`}>
                                    {stage.num}
                                  </span>
                                  <span>{stage.label}</span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* ── Workspace ─────────────────────────────────────────────────────── */}
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Projects */}
              {!isCollaborator && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={location.startsWith("/projects")}
                    tooltip="Projects"
                    onClick={() => setLocation("/projects")}
                    data-testid="nav-projects"
                  >
                    <Briefcase className={location.startsWith("/projects") ? undefined : "text-indigo-400"} />
                    <span>Projects</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* Analytics */}
              <Collapsible open={analyticsActive}>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={analyticsActive}
                    tooltip="Analytics"
                    onClick={() => setLocation("/analytics")}
                    data-testid="nav-analytics"
                    className={analyticsActive ? "!bg-emerald-500/15" : ""}
                  >
                    <BarChart2 className={analyticsActive ? undefined : "text-emerald-400"} />
                    <span>Analytics</span>
                    <ChevronDown
                      className={cn(
                        "ml-auto h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform duration-200",
                        analyticsActive && "rotate-180 text-current"
                      )}
                    />
                  </SidebarMenuButton>
                  <CollapsibleContent>
                    <SidebarMenuSub className="!border-emerald-500/40">
                      {analyticsChildren.map(child => {
                        const childActive = location === child.url;
                        return (
                          <SidebarMenuSubItem key={child.url}>
                            <SidebarMenuSubButton
                              isActive={childActive}
                              onClick={() => setLocation(child.url)}
                              data-testid={child.testId}
                              style={{ cursor: "pointer" }}
                              className={childActive ? "!bg-emerald-500/10 !text-emerald-200 font-medium" : "text-white/55 hover:!text-white"}
                            >
                              <span>{child.label}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* ── Help & Support ────────────────────────────────────────────────── */}
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

        {/* ── Admin ─────────────────────────────────────────────────────────── */}
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
                      <Shield className={location === "/admin" ? undefined : "text-violet-400"} />
                      <span>Admin Panel</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={location === "/links"}
                      tooltip="Link Library"
                      onClick={() => setLocation("/links")}
                      data-testid="nav-links"
                    >
                      <Star className={location === "/links" ? undefined : "text-purple-400"} />
                      <span>Link Library</span>
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
