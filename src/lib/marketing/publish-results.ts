export interface PublishResultSummaryInput {
  network: string
  status: 'ok' | 'error'
  error?: string
}

export interface PublishSummary {
  status: 'published' | 'partial' | 'failed'
  published: number
  failed: number
  requested: number
  error?: string
}

export function summarizePublishResults(results: PublishResultSummaryInput[]): PublishSummary {
  const published = results.filter((result) => result.status === 'ok').length
  const failed = results.filter((result) => result.status === 'error').length
  const status: PublishSummary['status'] = published === 0 ? 'failed' : failed > 0 ? 'partial' : 'published'
  const errors = results
    .filter((result) => result.status === 'error' && result.error)
    .map((result) => `${result.network}: ${result.error}`)

  return {
    status,
    published,
    failed,
    requested: results.length,
    ...(errors.length > 0 ? { error: errors.join('; ') } : {}),
  }
}
