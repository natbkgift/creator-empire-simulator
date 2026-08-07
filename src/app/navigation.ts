export interface NavigationItem {
  route: string;
  label: string;
  shortLabel: string;
  icon: string;
}

export const navigation: NavigationItem[] = [
  { route: 'hq', label: 'Studio HQ', shortLabel: 'HQ', icon: 'home' },
  { route: 'mission', label: 'Video Mission Control', shortLabel: 'Mission', icon: 'target' },
  { route: 'map', label: 'Portfolio Map', shortLabel: 'Map', icon: 'map' },
  { route: 'ideas', label: 'Niche Observatory', shortLabel: 'Ideas', icon: 'idea' },
  { route: 'blueprint', label: 'Channel Foundry', shortLabel: 'Plan', icon: 'blueprint' },
  { route: 'production', label: 'Production Pipeline', shortLabel: 'Board', icon: 'board' },
  { route: 'prompts', label: 'Prompt Studio', shortLabel: 'Prompt', icon: 'prompt' },
  { route: 'capcut', label: 'CapCut Lab', shortLabel: 'CapCut', icon: 'capcut' },
  { route: 'calendar', label: 'Publishing Tower', shortLabel: 'Calendar', icon: 'calendar' },
  { route: 'simulator', label: 'YouTube Simulator', shortLabel: 'Sim', icon: 'simulator' },
  { route: 'analytics', label: 'Analytics War Room', shortLabel: 'Data', icon: 'chart' },
  { route: 'monetization', label: 'Monetization Vault', shortLabel: 'Money', icon: 'money' },
  { route: 'policy', label: 'Policy Shield', shortLabel: 'Policy', icon: 'shield' },
  { route: 'import-export', label: 'Import & Export', shortLabel: 'Files', icon: 'import' },
  { route: 'settings', label: 'Settings', shortLabel: 'Settings', icon: 'gear' },
];

export const primaryMobileNavigation = ['hq', 'mission', 'production', 'prompts', 'analytics'];

export const routeTitle = (route: string): string =>
  navigation.find((item) => item.route === route)?.label ?? 'Creator Empire Simulator';
