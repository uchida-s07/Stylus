import { describe, expect, it } from 'vitest'
import { NetworkError } from './client'
import { callApi } from './responses'

// API の応答の見分け（AC ではない）
const respond = (status: number, body: unknown) => async () => Response.json(body, { status })

describe('callApi', () => {
  it('成功なら本文を返す', async () => {
    expect(await callApi(respond(200, { a: 1 }))).toEqual({ kind: 'ok', data: { a: 1 } })
  })

  it('204（本文なし）なら data は undefined', async () => {
    const res = async () => new Response(null, { status: 204 })
    expect(await callApi(res)).toEqual({ kind: 'ok', data: undefined })
  })

  it('403 not_a_member は未登録', async () => {
    const res = respond(403, { error: { code: 'not_a_member', message: 'x' } })
    expect(await callApi(res)).toEqual({ kind: 'unregistered' })
  })

  it('403 forbidden は未登録ではなく、ほかの失敗と同じ', async () => {
    const error = { code: 'forbidden', message: 'x' }
    expect(await callApi(respond(403, { error }))).toEqual({ kind: 'failed', status: 403, error })
  })

  it('エラーの形の本文なら code・message・fields を返す', async () => {
    const error = { code: 'invalid_input', message: 'x', fields: { title: '入力してください' } }
    expect(await callApi(respond(400, { error }))).toEqual({ kind: 'failed', status: 400, error })
  })

  it('本文がエラーの形でない・JSON でないなら error は無い', async () => {
    expect(await callApi(respond(500, 'oops'))).toEqual({ kind: 'failed', status: 500 })
    expect(await callApi(async () => new Response('x', { status: 502 }))).toEqual({
      kind: 'failed',
      status: 502,
    })
  })

  it('通信できなければ network', async () => {
    expect(
      await callApi(async () => {
        throw new NetworkError()
      }),
    ).toEqual({ kind: 'network' })
  })
})
