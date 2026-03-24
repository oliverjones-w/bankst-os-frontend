🧠 BankSt OS — AI-Native Recruiting Intelligence System

Technical Specification v1.0

1. System Overview
1.1 Objective

Build a conversational, AI-assisted operating system for:

mapping the global hedge fund talent market
ingesting structured + unstructured data
inferring relationships and changes
proposing structured updates
enabling human-confirmed write-back to a canonical database
1.2 Core Principle

Canonical truth is stored in Postgres.
All changes flow through a proposal → confirmation → mutation pipeline.

1.3 System Identity

This is NOT:

a CRM
a data vendor
a chatbot

This IS:

A continuously updating graph of people, firms, and relationships, powered by evidence and inference, with a conversational control layer

2. High-Level Architecture
                ┌──────────────────────────┐
                │      User Interface       │
                │  (Profiles + Command UI) │
                └────────────┬─────────────┘
                             │
                             ▼
                ┌──────────────────────────┐
                │ Conversational AI Layer  │
                │ (Agent + Tool Router)    │
                └────────────┬─────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌──────────────┐   ┌──────────────────┐   ┌────────────────────┐
│ Postgres DB  │   │ Evidence Layer   │   │ Inference Engine   │
│ (Canonical)  │   │ (Docs + Notes)   │   │ (Proposals + Rank) │
└──────────────┘   └──────────────────┘   └────────────────────┘
                             │
                             ▼
                ┌──────────────────────────┐
                │ Mutation Engine          │
                │ (Approve + Apply + Log)  │
                └──────────────────────────┘
3. Core System Layers
3.1 Canonical Data Layer (Postgres)
Purpose

Single source of truth for all structured data.

Key Tables
people
id
name
current_title
current_firm_id
current_location
status
created_at / updated_at
firms
id
name
type (HF, bank, prop, etc.)
location
metadata
person_experiences
id
person_id
firm_id
title
start_date
end_date
is_current
person_education
id
person_id
institution
degree
location
relationships
id
person_id
related_person_id
type (reports_to, worked_with)
confidence
source
notes
id
entity_type
entity_id
content
created_at
files
id
entity_type
entity_id
file_path
parsed_text
metadata
3.2 Evidence Layer (Unstructured Data)
Purpose

Store all raw signal.

Objects
source_context
id
entity_type
entity_id
source_type (cv, email, article, note)
raw_text
created_at
trust_score
document_chunks
id
source_context_id
chunk_text
embedding_vector
3.3 Observation Layer
Purpose

Convert raw evidence into structured claims

observations
id
entity_id
type (promotion, move, location_change)
extracted_data (JSON)
confidence
source_context_id
created_at

Example:

"Jeff Daniels joined Capstone as Senior PM"
3.4 Proposal Layer (Critical)
Purpose

AI-generated structured changes BEFORE DB mutation

proposed_mutations
id
entity_type
entity_id
mutation_type
payload (JSON)
old_value
proposed_value
confidence
source_context_id
reasoning
status (pending, approved, rejected)
3.5 Mutation Engine
Purpose

Safely apply changes

approved_mutations
id
proposed_mutation_id
applied_at
applied_by
result_snapshot
3.6 Trust Policy Layer
Purpose

Control auto vs manual updates

source_policies
source_type
trust_level
auto_apply_allowed
requires_review
allowed_mutations
4. AI System Design
4.1 Core Capabilities

The AI must:

A. Read
query Postgres
retrieve relevant documents (vector search)
inspect entity state
B. Infer
detect likely relationships
rank candidates
extract structured info
C. Propose
generate structured mutations
explain reasoning
assign confidence
D. Assist
answer questions
generate tables
refine queries
E. Never directly mutate DB

All writes go through:

proposal → confirmation → mutation

5. User Interaction Model
5.1 Entry Points
1. Entity-scoped
on person/firm page
drag/drop context
2. Global command palette

Example:

"Parker Daniels resignation date is Dec 8"
5.2 Proposal UX

System displays:

Target Entity Card
name
firm
title
location
Proposed Changes
field diffs
new rows
notes

Example:

Title: PM → Senior PM
Add note: "Promoted to Senior PM"
5.3 Actions
Ctrl+Enter → Confirm
Chat → Modify
Reject → Cancel
5.4 Statefulness

Each interaction creates a:

proposal_id

Follow-ups edit the same proposal.

6. Inference Workflows
6.1 Query Example

User:

"Who is most likely analyst from Agam Kothari team who moved back to Italy?"
System Process
Identify entity (Agam Kothari)
Query team members
Filter roles
Score:
Italian name
education
location shift
Rank candidates
Output
Name	Confidence	Reason
6.2 Ranking Logic

Score based on:

entity match
career trajectory
geography
education
recency
profile richness
7. External Data Integration
7.1 Authoritative APIs

Example: FINRA

Behavior:
if identity confirmed → auto update
7.2 Articles
Pipeline:
ingest
entity match
attach to profiles
create observations
generate proposals
7.3 CV Parsing
Input:

PDF

Output:
experiences
education
titles
locations

→ stored as proposals

8. Core Workflows
8.1 Context Ingestion
Drag file → attach → parse → propose changes → confirm
8.2 Direct Mutation
User command → parse → propose → confirm → write
8.3 Suggestion Feed

UI showing:

proposed updates
grouped by confidence
approve/reject
9. Guardrails
9.1 Never Auto-Write Unless:
source is authoritative
identity is confirmed
mapping is deterministic
9.2 Always Log
source
reasoning
user action
before/after state
9.3 Separate:
extracted facts
inferred facts
10. v1 Scope (CRITICAL)
Must Have
Postgres CRUD
file/note ingestion
CV parsing → proposals
basic AI query → SQL
proposal + confirm flow
simple ranking
Not Required Yet
perfect entity resolution
full automation
complex graph algorithms
full UI polish
11. v2 Evolution
advanced inference
auto-suggestion feed
better ranking models
relationship graph expansion
proactive alerts
12. Core Philosophy
System Behavior

Evidence → Observation → Proposal → Confirmation → Truth

Human Role

Final allocator of truth

AI Role

High-speed inference + structured proposal generator

13. Final One-Liner

This system turns unstructured market signal into structured, queryable intelligence through AI-assisted, human-confirmed mutation of a canonical database.