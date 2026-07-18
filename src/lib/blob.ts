import { BlobServiceClient } from '@azure/storage-blob'
import crypto from 'node:crypto'

const CONTAINER_NAME = 'attachments'

function getContainerClient() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!connectionString) throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set')
  const serviceClient = BlobServiceClient.fromConnectionString(connectionString)
  return serviceClient.getContainerClient(CONTAINER_NAME)
}

export async function uploadAttachment(file: {
  buffer: Buffer
  filename: string
  contentType: string
}): Promise<{ blobUrl: string }> {
  const containerClient = getContainerClient()
  const blobName = `${crypto.randomUUID()}-${file.filename}`
  const blockBlobClient = containerClient.getBlockBlobClient(blobName)
  await blockBlobClient.upload(file.buffer, file.buffer.length, {
    blobHTTPHeaders: { blobContentType: file.contentType },
  })
  return { blobUrl: blockBlobClient.url }
}
