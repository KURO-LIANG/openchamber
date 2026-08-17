import { describe, expect, it, vi, afterEach } from 'vitest';

import type { RuntimeUrlQuery, RuntimeUrlResolver } from '@openchamber/ui/lib/runtime-url';

const runtimeFetchMock = vi.fn();

vi.mock('@openchamber/ui/lib/runtime-fetch', () => ({
  runtimeFetch: runtimeFetchMock,
}));

const toUrl = (path: string, query?: RuntimeUrlQuery): string => {
  const params = query instanceof URLSearchParams ? query : new URLSearchParams();
  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
};

const urls: RuntimeUrlResolver = {
  api: toUrl,
  authenticatedAsset: toUrl,
  auth: toUrl,
  health: (query?: RuntimeUrlQuery) => toUrl('/health', query),
  rawFile: (path: string) => toUrl('/api/fs/raw', new URLSearchParams({ path })),
  sse: toUrl,
  websocket: toUrl,
};

describe('createWebFilesAPI', () => {
  it('preserves the directory permission failure contract', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/workspace' });
    runtimeFetchMock.mockResolvedValueOnce(Response.json(
      { error: 'Access to directory denied', reason: 'os-permission' },
      { status: 403 },
    ));

    const error = await api.listDirectory('/protected').catch((caught) => caught);

    expect(error).toMatchObject({
      name: 'FilesystemError',
      reason: 'os-permission',
      status: 403,
      message: 'Access to directory denied',
    });
  });

  it('rejects malformed successful directory listings', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/workspace' });
    runtimeFetchMock.mockResolvedValueOnce(Response.json({ path: '/workspace' }));

    await expect(api.listDirectory('/workspace')).rejects.toMatchObject({
      reason: 'invalid-response',
    });
  });

  it('uses per-call workspace directory for stat and read requests', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/stale-workspace' });

    runtimeFetchMock.mockResolvedValueOnce(Response.json({ path: '/worktree-b/file.txt', isFile: true, size: 12 }));
    await api.statFile?.('/worktree-b/file.txt', { directory: '/worktree-a' });

    expect(runtimeFetchMock).toHaveBeenLastCalledWith('/api/fs/stat', {
      query: new URLSearchParams({ path: '/worktree-b/file.txt' }),
      headers: { 'x-opencode-directory': '/worktree-a' },
    });

    runtimeFetchMock.mockResolvedValueOnce(new Response('content'));
    await api.readFile?.('/worktree-b/file.txt', { directory: '/worktree-a' });

    expect(runtimeFetchMock).toHaveBeenLastCalledWith('/api/fs/read', {
      query: new URLSearchParams({ path: '/worktree-b/file.txt' }),
      cache: 'default',
      headers: { 'x-opencode-directory': '/worktree-a' },
    });
  });

  it('sends the workspace directory header for downloads', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/current-workspace' });

    runtimeFetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(api.downloadFile?.('/current-workspace/file.txt')).rejects.toThrow('Download failed');

    expect(runtimeFetchMock).toHaveBeenLastCalledWith('/api/fs/raw', {
      query: { path: '/current-workspace/file.txt', download: true },
      headers: { 'x-opencode-directory': '/current-workspace' },
    });
  });
});

describe('readFileBinary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubFileReader = (dataUrl: string) => {
    class MockFileReader {
      result: string | null = null;
      error: DOMException | null = null;
      onload: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null;
      onerror: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null;

      readAsDataURL() {
        this.result = dataUrl;
        this.onload?.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>);
      }
    }
    vi.stubGlobal('FileReader', MockFileReader);
  };

  const loadApi = async () => {
    const { createWebFilesAPI } = await import('./files');
    return createWebFilesAPI({ urls, getDirectory: () => '/workspace' });
  };

  it('reads a binary file as a data URL through /api/fs/raw', async () => {
    const api = await loadApi();
    stubFileReader('data:image/webp;base64,Zm9v');

    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });
    runtimeFetchMock.mockResolvedValueOnce(new Response(blob));

    const result = await api.readFileBinary?.('/Users/me/.opencode/pets/pikachu/spritesheet.webp');

    expect(result).toEqual({
      dataUrl: 'data:image/webp;base64,Zm9v',
      path: '/Users/me/.opencode/pets/pikachu/spritesheet.webp',
    });
    expect(runtimeFetchMock).toHaveBeenLastCalledWith('/api/fs/raw', {
      query: { path: '/Users/me/.opencode/pets/pikachu/spritesheet.webp' },
      headers: { 'x-opencode-directory': '/workspace' },
    });
  });

  it('propagates server read failures', async () => {
    const api = await loadApi();
    stubFileReader('data:image/webp;base64,Zm9v');

    runtimeFetchMock.mockResolvedValueOnce(Response.json({ error: 'File not found' }, { status: 404 }));

    await expect(api.readFileBinary?.('/missing.webp')).rejects.toThrow('File not found');
  });

  it('rejects binary reads larger than the size cap', async () => {
    const api = await loadApi();
    stubFileReader('data:image/webp;base64,Zm9v');

    const oversized = new Blob([new Uint8Array(4 * 1024 * 1024 + 1)]);
    runtimeFetchMock.mockResolvedValueOnce(new Response(oversized));

    await expect(api.readFileBinary?.('/huge.webp')).rejects.toThrow('too large');
  });
});
