import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, Search, FileText, Settings } from "lucide-react";

interface FeatureCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  testId: string;
}

function FeatureCard({ title, description, icon, href, testId }: FeatureCardProps) {
  return (
    <Link href={href}>
      <Card className="hover-elevate cursor-pointer h-full" data-testid={testId}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {icon}
            </div>
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <CardDescription className="text-sm">{description}</CardDescription>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  const features = [
    {
      title: "Video Score",
      description: "Record practice videos and get AI-powered feedback on your delivery using the 5-part video formula.",
      icon: <Video className="h-6 w-6" />,
      href: "/video-score",
      testId: "card-video-score",
    },
    {
      title: "Video Trends",
      description: "Research trending topics and keywords for your video content with YouTube autocomplete and metrics.",
      icon: <Search className="h-6 w-6" />,
      href: "/video-trends",
      testId: "card-video-trends",
    },
    {
      title: "Scripts",
      description: "View and manage your AI-generated video scripts based on researched topics.",
      icon: <FileText className="h-6 w-6" />,
      href: "/video-trends/scripts",
      testId: "card-scripts",
    },
    {
      title: "Account Settings",
      description: "Manage your account, preferences, and API keys for third-party integrations.",
      icon: <Settings className="h-6 w-6" />,
      href: "/account",
      testId: "card-settings",
    },
  ];

  return (
    <div className="flex-1 overflow-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold" data-testid="text-dashboard-title">Dashboard</h1>
          <p className="text-muted-foreground">Welcome to Video Creators Toolkit</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2">
          {features.map((feature) => (
            <FeatureCard
              key={feature.href}
              title={feature.title}
              description={feature.description}
              icon={feature.icon}
              href={feature.href}
              testId={feature.testId}
            />
          ))}
        </div>

        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <Link href="/video-score-upload">
                <Button data-testid="button-new-session">
                  <Video className="mr-2 h-4 w-4" />
                  Score New Video
                </Button>
              </Link>
              <Link href="/video-trends">
                <Button variant="outline" data-testid="button-research-topics">
                  <Search className="mr-2 h-4 w-4" />
                  Research Topics
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
