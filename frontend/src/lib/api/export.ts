import { apiClient } from './client'

export const exportApi = {
  /**
   * Download an Excel summary report of sources (optionally scoped to one
   * notebook). Fetched via the API client so the auth header is attached,
   * then handed to the browser as a file download.
   */
  downloadSummaryReport: async (notebookId?: string): Promise<void> => {
    const response = await apiClient.get<Blob>('/export/summary-report', {
      params: notebookId ? { notebook_id: notebookId } : undefined,
      responseType: 'blob',
    })

    const disposition = response.headers['content-disposition'] as string | undefined
    const filename =
      disposition?.match(/filename="?([^";]+)"?/)?.[1] ?? 'summary-report.xlsx'

    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  },
}
