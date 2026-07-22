import { z } from 'zod'

export const articleInputSchema = z.object({
  title: z.string().min(3),
  docType: z.enum([
    'kb_article', 'sop', 'work_instruction', 'known_issue', 'runbook', 'faq', 'troubleshooting_guide',
  ]),
  environment: z.string().optional(),
  affectedServices: z.array(z.string()).default([]),
  symptoms: z.string().optional(),
  errorMessages: z.array(z.string()).default([]),
  rootCause: z.string().optional(),
  resolution: z.string().optional(),
  alternativeFixes: z.string().optional(),
  verificationSteps: z.string().optional(),
  prevention: z.string().optional(),
  relatedKbIds: z.array(z.string()).default([]),
  relatedTicketRefs: z.array(z.string()).default([]),
  client: z.string().optional(),
  tools: z.array(z.string()).default([]),
})

export type ArticleInput = z.infer<typeof articleInputSchema>
