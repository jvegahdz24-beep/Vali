import { describe, expect, it } from 'vitest'
import { summarizePublishResults } from './publish-results'

describe('summarizePublishResults', () => {
  it('reports a fully confirmed publication', () => {
    expect(summarizePublishResults([
      { network: 'facebook', status: 'ok' },
      { network: 'instagram', status: 'ok' },
    ])).toEqual({
      status: 'published',
      published: 2,
      failed: 0,
      requested: 2,
    })
  })

  it('reports partial publication and includes provider errors', () => {
    expect(summarizePublishResults([
      { network: 'facebook', status: 'ok' },
      { network: 'instagram', status: 'error', error: 'Instagram no está conectado' },
    ])).toEqual({
      status: 'partial',
      published: 1,
      failed: 1,
      requested: 2,
      error: 'instagram: Instagram no está conectado',
    })
  })

  it('reports failure when no provider confirms publication', () => {
    expect(summarizePublishResults([
      { network: 'facebook', status: 'error', error: 'Facebook no está conectado' },
    ])).toEqual({
      status: 'failed',
      published: 0,
      failed: 1,
      requested: 1,
      error: 'facebook: Facebook no está conectado',
    })
  })

  it('does not claim publication for an empty result set', () => {
    expect(summarizePublishResults([])).toEqual({
      status: 'failed',
      published: 0,
      failed: 0,
      requested: 0,
    })
  })
})
