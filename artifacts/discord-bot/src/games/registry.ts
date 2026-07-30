// Central registry for stopping active games by channel

const stopFns = new Map<string, () => void>();
const gameNames = new Map<string, string>();

export function registerGame(channelId: string, name: string, stopFn: () => void) {
  stopFns.set(channelId, stopFn);
  gameNames.set(channelId, name);
}

export function unregisterGame(channelId: string) {
  stopFns.delete(channelId);
  gameNames.delete(channelId);
}

export function stopGame(channelId: string): string | null {
  const fn = stopFns.get(channelId);
  const name = gameNames.get(channelId) ?? "игра";
  if (!fn) return null;
  fn();
  stopFns.delete(channelId);
  gameNames.delete(channelId);
  return name;
}

export function getActiveGame(channelId: string): string | null {
  return gameNames.get(channelId) ?? null;
}
