'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Search,
  FileText,
  Settings,
  LayoutDashboard,
  Moon,
  Sun,
  Brain,
  Database,
  ShieldCheck,
  Target,
  BookOpen,
  Warehouse,
  Tags,
  Bot,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';

const navItems = [
  {
    title: 'Dashboard',
    href: '/',
    icon: LayoutDashboard,
  },
  {
    title: 'Alerts',
    href: '/alerts',
    icon: AlertTriangle,
  },
  {
    title: 'Investigations',
    href: '/investigations',
    icon: Search,
  },
  {
    title: 'Threat Hunts',
    href: '/threat-hunts',
    icon: Target,
  },
  {
    title: 'Query Library',
    href: '/queries',
    icon: BookOpen,
  },
  {
    title: 'Reports',
    href: '/reports',
    icon: FileText,
  },
];

const settingsItems = [
  {
    title: 'AI Providers',
    href: '/settings/ai-providers',
    icon: Brain,
  },
  {
    title: 'Splunk',
    href: '/settings/splunk',
    icon: Warehouse,
  },
  {
    title: 'Database',
    href: '/settings/database',
    icon: Database,
  },
  {
    title: 'IOC Whitelist',
    href: '/settings/ioc-whitelist',
    icon: ShieldCheck,
  },
  {
    title: 'Tags',
    href: '/settings/tags',
    icon: Tags,
  },
  {
	title: 'Agents',
	href:'/settings/agent_s',
	icon: Bot,
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch by only rendering theme toggle after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="flex items-center gap-2 px-2 py-2 mb-2">
          <SidebarTrigger />
        </div>
        <SidebarGroup className="mt-2">
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.title}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Configuration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.title}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            {mounted && (
              <SidebarMenuButton
                size="lg"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  {theme === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    Switch theme
                  </span>
                </div>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
