type LocationLike = Pick<Location, 'port' | 'hostname' | 'origin'>;

/** A Vite dev szerver (3000) mellett a backend a 5000-es porton fut; egyébként azonos origin. */
export function resolveSocketUrl(location: LocationLike = window.location): string {
  return location.port === '3000' ? `https://${location.hostname}:5000` : location.origin;
}

export const SOCKET_URL: string = resolveSocketUrl();
