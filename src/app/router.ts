export type RouteId =
  | 'onboarding' | 'hq' | 'mission' | 'map' | 'ideas' | 'blueprint' | 'production' | 'pipeline'
  | 'prompts' | 'capcut' | 'calendar' | 'simulator' | 'analytics' | 'monetization'
  | 'policy' | 'settings' | 'import-export';

export interface RouteState {
  name: string;
  params: URLSearchParams;
}

export const parseRoute = (): RouteState => {
  const raw = location.hash.replace(/^#\/?/, '') || 'hq';
  const [namePart, query = ''] = raw.split('?');
  return { name: namePart || 'hq', params: new URLSearchParams(query) };
};

export const getQuery = (): URLSearchParams => parseRoute().params;

export const routeHref = (name: string, params?: Record<string, string | number | undefined> | string): string => {
  if (typeof params === 'string') return `#/${name}${params ? `?${params}` : ''}`;
  const search = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  const suffix = search.toString() ? `?${search}` : '';
  return `#/${name}${suffix}`;
};

export const navigate = (name: string, params?: Record<string, string | number | undefined> | string): void => {
  location.hash = routeHref(name, params).slice(1);
};
