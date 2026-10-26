import { api, ApiError, refreshSession, session } from '../src/api/client';
import { useOfflineQueue } from '../src/store/offlineQueue';

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe('offline answer queue', () => {
  const post = jest.spyOn(api, 'post');

  beforeEach(() => {
    useOfflineQueue.setState({ items: [], syncing: false, lastError: null });
    post.mockReset();
  });

  it('keeps one pending answer per question', () => {
    const { enqueue } = useOfflineQueue.getState();
    enqueue({ lessonId: 'l', attemptId: 'a', questionId: 'q1', answer: 0 });
    enqueue({ lessonId: 'l', attemptId: 'a', questionId: 'q1', answer: 2 });
    enqueue({ lessonId: 'l', attemptId: 'a', questionId: 'q2', answer: true });
    const items = useOfflineQueue.getState().items;
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.questionId === 'q1')!.answer).toBe(2);
  });

  it('syncs queued answers when back online and removes them', async () => {
    useOfflineQueue.getState().enqueue({ lessonId: 'l', attemptId: 'a', questionId: 'q1', answer: 1 });
    post.mockResolvedValue({ correct: true });
    const r = await useOfflineQueue.getState().flush();
    expect(r).toEqual({ synced: 1, remaining: 0 });
    expect(post).toHaveBeenCalledWith('/lessons/l/submit', expect.objectContaining({ attemptId: 'a', questionId: 'q1', answer: 1, clientEventId: expect.any(String) }));
  });

  it('keeps answers on the device while still offline', async () => {
    useOfflineQueue.getState().enqueue({ lessonId: 'l', attemptId: 'a', questionId: 'q1', answer: 1 });
    post.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'offline'));
    const r = await useOfflineQueue.getState().flush();
    expect(r).toEqual({ synced: 0, remaining: 1 });
  });

  it('drops answers the server rejects and reports why', async () => {
    useOfflineQueue.getState().enqueue({ lessonId: 'l', attemptId: 'a', questionId: 'q1', answer: 1 });
    post.mockRejectedValue(new ApiError(403, 'OUT_OF_HEARTS', 'You are out of hearts.'));
    const r = await useOfflineQueue.getState().flush();
    expect(r.remaining).toBe(0);
    expect(useOfflineQueue.getState().lastError).toBe('You are out of hearts.');
  });
});

describe('session refresh', () => {
  const fetchMock = jest.fn();
  beforeAll(() => {
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  beforeEach(async () => {
    fetchMock.mockReset();
    await session.clear();
  });

  it('shares one refresh request between concurrent callers and stores the rotated token', async () => {
    await session.save({ accessToken: 'old', refreshToken: 'refresh-1-xxxxxxxxxxxxxxxxxxxxxxxx' });
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { tokens: { accessToken: 'new', refreshToken: 'refresh-2-xxxxxxxxxxxxxxxxxxxxxxxx' } } }));
    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);
    expect(a && b).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await session.getRefreshToken()).toBe('refresh-2-xxxxxxxxxxxxxxxxxxxxxxxx');
  });

  it('clears the session when the refresh token is rejected', async () => {
    await session.save({ accessToken: 'old', refreshToken: 'refresh-1-xxxxxxxxxxxxxxxxxxxxxxxx' });
    fetchMock.mockResolvedValue(jsonResponse(401, { success: false, error: { code: 'INVALID_REFRESH_TOKEN', message: 'expired' } }));
    expect(await refreshSession()).toBe(false);
    expect(await session.getRefreshToken()).toBeNull();
  });

  it('retries a request once after refreshing an expired access token', async () => {
    await session.save({ accessToken: 'expired', refreshToken: 'refresh-1-xxxxxxxxxxxxxxxxxxxxxxxx' });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { success: false, error: { code: 'TOKEN_EXPIRED', message: 'expired' } }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { tokens: { accessToken: 'fresh', refreshToken: 'refresh-2-xxxxxxxxxxxxxxxxxxxxxxxx' } } }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { ok: 1 } }));
    await expect(api.get('/profile/me')).resolves.toEqual({ ok: 1 });
    const lastCall = fetchMock.mock.calls[2] as [string, RequestInit];
    expect((lastCall[1].headers as Record<string, string>).Authorization).toBe('Bearer fresh');
  });

  it('turns network failures into a typed offline error', async () => {
    await session.save({ accessToken: 'a', refreshToken: 'refresh-1-xxxxxxxxxxxxxxxxxxxxxxxx' });
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(api.get('/courses')).rejects.toMatchObject({ code: 'NETWORK_ERROR', isNetwork: true });
  });
});
