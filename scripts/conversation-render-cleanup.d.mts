type RemoveOptions = { recursive?: boolean; force?: boolean };

type RendererProfileCleanupOptions = {
  remove?: (path: string, options: RemoveOptions) => void;
  wait?: (milliseconds: number) => Promise<void>;
  maxRetries?: number;
  retryDelayMs?: number;
};

export function removeRendererProfile(
  profile: string,
  options?: RendererProfileCleanupOptions,
): Promise<void>;
