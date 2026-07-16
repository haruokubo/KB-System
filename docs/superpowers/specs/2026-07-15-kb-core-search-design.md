# KB Core + Search — Design Spec

Date: 2026-07-15
Status: Approved for planning
Repo target: `fornida/KB-System` (GitHub org, to be created/transferred at implementation time)

## Context

This is sub-project 1 of a larger Technical Support Knowledge Management Platform for
L2/L3 support engineers. The full vision spans 12+ subsystems (ticket resolution DB,
script repository, troubleshooting workflow-tree engine, dashboards/analytics, Neo4j
knowledge graph, full Microsoft 365 ingestion connectors, OCR, full 6-role RBAC, etc.).
Building all of it at once was flagged as unmanageable; this spec scopes only the
foundational piece: KB article storage + AI-assisted search. Later subsystems get their
own spec → plan → implementation cycle once this proves out with a small pilot team.

## Goals

- Engineers can author KB articles (KB articles, SOPs, runbooks, known issues, FAQs,
  troubleshooting guides) through a structured web form.
- A single search box returns an AI-synthesized troubleshooting answer (probable
  causes, steps, known fixes, PowerShell commands, escalation recommendation) plus a
  ranked, cited list of source KB articles.
- Small pilot team (a handful of engineers) can use this day one; auth/RBAC and infra
  are sized for that, not full L2/L3 org rollout.

## Non-goals (deferred to future sub-projects)

- Ticket resolution database
- Script repository
- Guided troubleshooting workflow trees
- Dashboards/analytics
- Neo4j knowledge graph / document relationships
- Full Microsoft 365 ingestion connectors (SharePoint/OneDrive/Teams)
- OCR on screenshots/scanned documents
- Full 6-role RBAC (Administrator/Knowledge Manager/L3/L2/Analyst/Read Only) —
  pilot ships a 3-tier subset instead (see Auth section)

## 1. Architecture

- **Frontend + backend:** Next.js 14 (App Router, TypeScript), Tailwind CSS, ShadCN.
  Single deployable — API routes serve as the backend, no separate service.
- **Metadata store:** Azure Postgres Flexible Server — users, articles, tags,
  attachments.
- **Search:** Azure AI Search — one index, hybrid retrieval (BM25 keyword + semantic
  ranker + vector similarity).
- **Embeddings:** Azure OpenAI, embeddings-only deployment (e.g. text-embedding-3-large).
  Used solely to generate vectors for indexing and query-time similarity — no chat/
  generation use. Stays inside Azure tenant/billing/compliance boundary.
- **File storage:** Azure Blob Storage — article attachments.
- **AI reasoning/synthesis:** Claude API (Anthropic SDK) — RAG answer synthesis,
  auto-tagging, summarization, keyword/category extraction. All chat-shaped work.
- **Auth:** NextAuth, credentials provider, bcrypt password hashing, JWT sessions.
- **Hosting:** Azure App Service (Linux, Node), southcentralUS.

Why split embeddings (Azure OpenAI) from chat (Claude): Claude has no embeddings
endpoint. Rather than adopting a new third-party vendor (e.g. Voyage AI) for this one
function, an embeddings-only Azure OpenAI deployment keeps that piece inside the
existing Azure tenant and compliance boundary while Claude still does 100% of the
actual reasoning/answer-writing.

## 2. Data Model

```
users
  id, email, name, role (admin | editor | read_only),
  password_hash, created_at

kb_articles
  id, title,
  doc_type (kb_article | sop | work_instruction | known_issue | runbook | faq |
            troubleshooting_guide),
  environment, affected_services[], symptoms, error_messages[],
  root_cause, resolution, alternative_fixes, verification_steps, prevention,
  related_kb_ids[], related_ticket_refs[],
  status (draft | published),
  author_id, last_reviewed, created_at, updated_at

attachments
  id, article_id, blob_url, filename, content_type, size

tags
  id, name

article_tags
  article_id, tag_id
```

On save/publish, an auto-extraction step (Claude call) populates: keywords, tags,
summary, category, detected error codes/product names — written back onto the
article row.

## 3. Search & RAG Flow

**Indexing (on article save/publish):**
1. Chunk article content by section (symptoms, root cause, resolution, etc.).
2. Each chunk → Azure OpenAI embeddings → vector.
3. Push chunk text + vector + metadata (article id, doc_type, services, tags) into
   the Azure AI Search index.
4. Article row saved in Postgres in parallel.

**Query (single search box, every query):**
1. Query hits Azure AI Search hybrid retrieval (keyword + semantic ranker + vector)
   → top-K chunks.
2. Chunks + query → Claude → generates: probable causes, troubleshooting steps,
   known fixes, PowerShell commands, escalation recommendation.
3. UI renders the AI answer at the top, with inline citations, and a ranked list of
   source KB articles (title, snippet, doc_type, service) below — each citation
   deep-links to its article.

Cost/latency note: every search triggers a Claude call (no plain-list-only mode in
this pilot). Acceptable at pilot volume; revisit if usage scales up materially.

## 4. Ingestion

- Manual article creation via a web form matching the KB article template fields.
- File upload → Azure Blob Storage, attached to the owning article.
- Text extraction from PDF/DOCX attachments for indexing (plain parsing).
- No OCR this round (no legacy scanned-document backlog exists yet — starting empty).
- No SharePoint/OneDrive/Teams/Confluence connectors this round.

## 5. Auth / RBAC

- NextAuth credentials provider, bcrypt hashing, JWT sessions.
- No self-signup — Admin creates users (invite by email + temp password, forced
  reset on first login).
- Pilot RBAC — 3 tiers:
  - **Admin** — full control, user management.
  - **Editor** — create/edit/publish articles (covers L2, L3, Knowledge Manager,
    Support Analyst for pilot purposes).
  - **Read Only** — search and view only.
- Full 6-role granularity deferred to a future sub-project if/when the pilot expands
  to the full L2/L3 org.

## 6. Deployment / CI-CD

- Repo: `fornida/KB-System` (GitHub org — currently exists as a personal repo at
  `haruokubo/KB-System`; transfer/recreate under the Fornida org before real data
  goes in, confirm with user before executing that move).
- Resource group: `rg-kbplatform-pilot`, southcentralUS, tagged (owner, project,
  env=pilot) per Fornida naming/tagging standard.
- Azure App Service (Linux, Node), staging + prod deployment slots.
- Secrets in Azure Key Vault, referenced via App Service application settings —
  never committed, never requested from the user as plaintext.
- GitHub Actions: lint → typecheck → build → test → deploy to staging slot → manual
  slot-swap to prod.
- Application Insights wired in from day one.
- Runtime versions pinned to current stable (Node LTS); checked against EOL status
  before scaffold.

## Open Items for Implementation Planning

- Exact Node LTS version and package versions to pin (check EOL status at
  implementation time, not spec time, since this spec may sit before build starts).
- Azure OpenAI embeddings model choice and dimension size.
- Chunking strategy specifics (max tokens per chunk, overlap).
