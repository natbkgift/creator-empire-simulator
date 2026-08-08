export interface NavigationItem {
  route: string;
  label: string;
  shortLabel: string;
  icon: string;
}

// v1.4 frozen IA: Strategy → execution flow is represented by exactly five
// persistent destinations. Advanced tools remain contextual routes.
export const navigation: NavigationItem[] = [
  { route: 'hq', label: 'Today', shortLabel: 'Today', icon: 'home' },
  { route: 'blueprint', label: 'Channels', shortLabel: 'Channels', icon: 'blueprint' },
  { route: 'production', label: 'Production', shortLabel: 'Production', icon: 'board' },
  { route: 'calendar', label: 'Calendar', shortLabel: 'Calendar', icon: 'calendar' },
  { route: 'analytics', label: 'Insights', shortLabel: 'Insights', icon: 'chart' },
];

export const primaryMobileNavigation = navigation.map((item) => item.route);

const contextualRouteTitles: Record<string, string> = {
  mission: 'Video Mission',
  map: 'Portfolio',
  ideas: 'Niche Ideas',
  prompts: 'Prompt Studio',
  capcut: 'CapCut Lab',
  simulator: 'YouTube Simulator',
  monetization: 'Monetization',
  policy: 'Policy Shield',
  'import-export': 'Backup & Recovery',
  settings: 'Settings',
  onboarding: 'Setup',
};

export const routeTitle = (route: string): string =>
  navigation.find((item) => item.route === route)?.label ?? contextualRouteTitles[route] ?? 'Creator Empire Simulator';
