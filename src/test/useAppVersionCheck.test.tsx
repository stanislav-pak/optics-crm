import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAppVersionCheck } from '../hooks/useAppVersionCheck'

describe('useAppVersionCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('показывает баннер, если версия на сервере отличается от текущей', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 'new-hash' }),
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useAppVersionCheck())
    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current).toBe(true)
  })

  it('не показывает баннер, если версия совпадает с текущей', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 'test-version' }),
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useAppVersionCheck())
    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current).toBe(false)
  })

  it('сбрасывает флаг проверки по таймауту зависшего запроса и не блокирует следующие проверки', async () => {
    let call = 0
    global.fetch = vi.fn().mockImplementation((_url: string, opts?: { signal?: AbortSignal }) => {
      call++
      if (call === 1) {
        return new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          )
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ version: 'new-hash' }) })
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useAppVersionCheck())

    // первый запрос зависает — ждём срабатывания внутреннего таймаута (~10с)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(result.current).toBe(false)

    // следующий опрос (интервал 45с от старта) должен пройти успешно, а не остаться заблокированным
    await act(async () => {
      await vi.advanceTimersByTimeAsync(35_000)
    })
    expect(result.current).toBe(true)
  })

  it('реально сбрасывает внутренний флаг "идёт проверка" по таймауту — вручную триггернутая проверка не блокируется старым зависшим запросом', async () => {
    let calls = 0
    global.fetch = vi.fn().mockImplementation((_url: string, opts?: { signal?: AbortSignal }) => {
      calls++
      if (calls === 1) {
        return new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          )
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ version: 'test-version' }) })
    }) as unknown as typeof fetch

    renderHook(() => useAppVersionCheck())
    expect(calls).toBe(1)

    // ждём срабатывания внутреннего таймаута (~10с) — флаг checkingRef должен сброситься
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    // триггерим проверку вручную (событие online), не дожидаясь 45с интервала —
    // если бы флаг не сбросился, этот вызов был бы молча проигнорирован и calls остался бы 1
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
    })

    expect(calls).toBe(2)
  })

  it('не падает и не показывает баннер, если version.json недоступен (dev-режим)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch

    const { result } = renderHook(() => useAppVersionCheck())
    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current).toBe(false)
  })
})
