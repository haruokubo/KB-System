import { describe, it, expect, vi } from 'vitest'

const { mockUpload, mockGetContainerClient } = vi.hoisted(() => {
  const mockUpload = vi.fn().mockResolvedValue({})
  const mockGetBlockBlobClient = vi.fn().mockReturnValue({ upload: mockUpload, url: 'https://acct.blob.core.windows.net/attachments/abc-file.pdf' })
  const mockGetContainerClient = vi.fn().mockReturnValue({ getBlockBlobClient: mockGetBlockBlobClient })
  return { mockUpload, mockGetBlockBlobClient, mockGetContainerClient }
})

vi.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: vi.fn().mockReturnValue({ getContainerClient: mockGetContainerClient }),
  },
}))

import { uploadAttachment } from '@/lib/blob'

describe('uploadAttachment', () => {
  it('uploads the buffer and returns the blob url', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'test-connection-string'
    const result = await uploadAttachment({
      buffer: Buffer.from('test'),
      filename: 'file.pdf',
      contentType: 'application/pdf',
    })
    expect(mockUpload).toHaveBeenCalled()
    expect(result.blobUrl).toContain('file.pdf')
  })
})
