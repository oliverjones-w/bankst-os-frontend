**Aligned to current PostgreSQL schema**

## 1. Product intent

BankSt OS is a **workspace-native intelligence and workflow system** for managing:

- professional people records
    
- firm records
    
- employment history and current seats
    
- mandate execution
    
- candidate pipeline progression
    
- interactions and reminders
    
- documents and extracted intelligence
    
- tags, strategies, products, titles, functions, locations
    
- activity history and auditability
    

The product is not page-first and not CRM-first in the dumb traditional sense.

It is:

**a workspace OS for navigating, inspecting, editing, and operationalizing structured recruiting intelligence over time.**

The primary design goal is:

**make it fast and enjoyable to inspect, connect, update, and act on person/firm intelligence without losing workspace context.**

---

# 2. Product thesis

The schema makes clear that the system has **three major layers**:

## A. Core entity layer

The durable things that exist:

- `person`
    
- `firm`
    
- `fund`
    
- `mandate`
    
- `document`
    
- `app_user`
    

## B. Relationship / intelligence layer

The structured facts and inferred labels that describe those things:

- `work_history`
    
- `education`
    
- `emails`
    
- `phone_numbers`
    
- `person_strategy`
    
- `person_product`
    
- `entity_tag`
    
- `firm_tag_map`
    
- `firm_alias`
    
- `firm_location`
    
- `performance`
    

## C. Operational workflow layer

The things users do with those entities:

- `pipeline_item`
    
- `interaction`
    
- `reminder`
    
- `saved_search`
    
- `saved_search_member`
    
- `mandate_candidate`
    
- `mandate_candidate_section_event`
    
- `activity_feed`
    
- `audit_log`
    

So the app must support both:

- **intelligence browsing**
    
- **workflow execution**
    

That means the shell needs to feel like an IDE/workspace, not a simple profile viewer.

---

# 3. Revised shell model

Your shell idea is still correct, but now it can be stated more precisely.

## 3.1 Left rail

Purpose:

- navigation
    
- saved views
    
- work queues
    
- entity collections
    
- workflow entry points
    

Primary sections:

- People
    
- Firms
    
- Mandates
    
- Pipeline
    
- Saved Searches
    
- Reminders
    
- Documents
    
- Graph / Network
    
- Recent / Pinned
    

This is **not just navigation**. It is the user’s **control surface for choosing what kind of work they are doing**.

---

## 3.2 Center workspace

Purpose:

- primary working surface
    
- tables
    
- tabs
    
- entity profiles
    
- mandate views
    
- pipeline boards/lists
    
- graph views
    
- timelines
    
- document review
    
- search results
    

This is where the user performs real work.

Key rule:  
**the center workspace hosts full views and durable work sessions.**

---

## 3.3 Right rail

Purpose:

- contextual vertical metadata
    
- chronological activity
    
- reminders
    
- linked notes
    
- related entities
    
- recent interactions
    
- audit snippets
    
- extracted intelligence status
    

This should remain contextual and optional.

It should enhance the active view, not contain the only copy of critical data.

---

## 3.4 Global overlays

Purpose:

- command palette
    
- floating entity cards
    
- quick-create
    
- quick-link
    
- modals
    
- notifications
    
- inline action layers
    

This is the app’s **fast access layer**.

---

# 4. Revised primary objects

The earlier brief over-weighted person + firm as the only important objects. This schema shows the real primary object set is broader.

## 4.1 Core entities

### Person

Canonical individual record.

Base table:

- `person`
    

Primary supporting tables:

- `work_history`
    
- `education`
    
- `emails`
    
- `phone_numbers`
    
- `person_notes`
    
- `person_strategy`
    
- `person_product`
    
- `performance`
    
- `entity_tag`
    
- `interaction`
    
- `document`
    
- `mandate_candidate`
    
- `pipeline_item`
    
- `reminder`
    

### Firm

Canonical organization record.

Base table:

- `firm`
    

Primary supporting tables:

- `firm_alias`
    
- `firm_notes`
    
- `firm_tag_map`
    
- `firm_location`
    
- `fund`
    
- `entity_tag`
    
- `interaction`
    
- `news_tag`
    
- `document`
    
- `mandate`
    
- `pipeline_item`
    
- `saved_search_member`
    

### Mandate

A major first-class workflow object, not just an attribute.

Base table:

- `mandate`
    

Supporting tables:

- `mandate_candidate`
    
- `mandate_candidate_section_event`
    
- `interaction`
    

This means mandates deserve full views and likely their own center-workspace mode.

### Pipeline item

Also a first-class operational object.

Base table:

- `pipeline_item`
    

This is not just metadata. It represents an active piece of work tied to a person or firm, owned by a user, staged, prioritized, and date-driven.

### Document

Also first-class.

Base table:

- `document`
    

This matters because documents connect to:

- people
    
- firms
    
- funds
    
- extracted text
    
- extraction status
    
- downstream inference layers like strategy/product tagging
    

### Fund

Secondary but meaningful entity.  
Funds sit between firms and intelligence layers, and later may deserve richer treatment.

---

# 5. Revised design principle

The app is best understood as:

**an entity + workflow workspace with layered inspection**

not:

**a collection of static profile pages**

and not merely:

**an internal CRM**

The system has to support four distinct user modes:

## A. Browse intelligence

Look up people, firms, funds, tags, work history.

## B. Act on workflow

Move pipeline, run mandate processes, log interactions, set reminders.

## C. Curate data quality

Review extracted strategy/product labels, aliases, tags, canonicalization, audit trail.

## D. Explore relationships

See how people, firms, funds, titles, functions, strategies, and mandates connect.

That is a richer brief than before.

---

# 6. Revised view taxonomy

## 6.1 Core table/list views

These are essential.

- `people.table`
    
- `firms.table`
    
- `mandates.table`
    
- `pipeline.table`
    
- `documents.table`
    
- `saved_searches.table`
    
- `reminders.table`
    

Potential later:

- `funds.table`
    
- `strategies.table`
    
- `products.table`
    
- `titles.table`
    
- `functions.table`
    

---

## 6.2 Core detail/profile views

These deserve full-tab support.

- `person.detail`
    
- `firm.detail`
    
- `mandate.detail`
    
- `pipeline.detail`
    
- `document.detail`
    
- `fund.detail`
    

Later:

- `saved_search.detail`
    
- `interaction.detail`
    

---

## 6.3 Operational views

These emerge directly from the schema and deserve explicit design.

- `mandate.board` or `mandate.pipeline`
    
- `pipeline.queue`
    
- `reminders.agenda`
    
- `interaction.timeline`
    
- `review.queue` for extracted labels / pending review
    
- `audit.timeline`
    

---

## 6.4 Relationship / analytical views

These are where the Obsidian inspiration really pays off.

- `graph.network`
    
- `person.timeline`
    
- `firm.timeline`
    
- `career.path`
    
- `related.entities`
    
- `source.trace`
    

---

# 7. Revised floating card concept

This part still stands, but the schema tells us the card content should be more specific.

Floating cards are not just quick profiles. They are **peek inspectors** into the live data model.

## 7.1 Supported v1 card types

Start with:

- `PersonCard`
    
- `FirmCard`
    

Later:

- `MandateCard`
    
- `DocumentCard`
    
- `FundCard`
    

---

## 7.2 PersonCard should summarize

Not generic biography. It should expose the schema’s useful operational intelligence:

### Header

- full name
    
- current firm
    
- current title
    
- current function
    
- location
    
- tags
    
- last updated
    

### Core identity block

From:

- `person`
    
- current `work_history`
    
- `title`
    
- `job_function`
    
- `location`
    

### Contact / access block

From:

- `emails`
    
- `phone_numbers`
    

### Intelligence block

From:

- `person_strategy`
    
- `person_product`
    
- `entity_tag`
    

### Activity block

From:

- `interaction`
    
- `activity_feed`
    
- `reminder`
    
- `pipeline_item`
    

### Notes block

From:

- `person_notes`
    

### Quick actions

- open full profile
    
- edit current role
    
- add note
    
- log interaction
    
- add reminder
    
- add to mandate
    
- add to pipeline
    
- open graph
    
- view documents
    

That is much stronger than a generic “profile popup.”

---

## 7.3 FirmCard should summarize

### Header

- firm name
    
- tags
    
- locations
    
- last updated
    

### Identity block

From:

- `firm`
    
- `firm_alias`
    
- `firm_tag_map`
    
- `entity_tag`
    

### Structure block

From:

- `fund`
    
- `firm_location`
    

### Workflow block

From:

- `mandate`
    
- `pipeline_item`
    
- `interaction`
    
- `news_tag`
    

### Notes block

From:

- `firm_notes`
    

### Quick actions

- open full profile
    
- add note
    
- log interaction
    
- add reminder
    
- view mandates
    
- view funds
    
- view graph
    
- open documents
    

---

# 8. Revised command palette brief

The command palette should now be explicitly designed around your real data model.

It is a universal operator layer across:

## A. Commands

Examples:

- Open people table
    
- Open firms table
    
- Open mandates
    
- Open pipeline queue
    
- Toggle right rail
    
- Split pane right
    
- New reminder
    
- New interaction
    
- Open review queue
    

## B. Entities

Examples:

- person
    
- firm
    
- fund
    
- mandate
    
- document
    
- saved search
    

## C. Contextual actions

Examples:

- Add candidate to mandate
    
- Log interaction for active person
    
- Create reminder for active firm
    
- View current work history
    
- Review extracted strategies
    
- Review extracted products
    
- Open audit trail
    
- Open related documents
    

## D. Quick-create

Examples:

- Create person
    
- Create firm
    
- Create mandate
    
- Create reminder
    
- Create note
    
- Create saved search
    

The palette is not merely navigation. It is **read + write + act**.

---

# 9. Revised right rail brief

The schema shows the right rail should be heavily chronology- and workflow-oriented.

## 9.1 Right rail purpose

To show contextual vertical metadata for the active entity or active work object.

## 9.2 Initial widgets

Best v1 widgets:

### Recent activity

From:

- `activity_feed`
    

### Recent interactions

From:

- `interaction`
    

### Reminders

From:

- `reminder`
    

### Notes

From:

- `person_notes` / `firm_notes`
    

### Related workflow

From:

- `pipeline_item`
    
- `mandate_candidate`
    
- `mandate`
    

### Audit snippet

From:

- `audit_log`
    

This gives the right rail a strong job:  
**what has happened, what needs doing, what is connected.**

---

# 10. Revised center workspace priorities

Your earlier idea said “main page for tables / data etc.” That’s right, but now we can be more exact.

The center workspace should primarily host three categories of views:

## A. Intelligence tables

- People
    
- Firms
    
- Documents
    
- Funds
    

## B. Workflow views

- Pipeline queue
    
- Mandate view
    
- Reminders
    
- Saved searches
    

## C. Rich detail views

- Person profile
    
- Firm profile
    
- Mandate detail
    
- Document detail
    
- Graph / timeline
    

That mix is what makes the app useful.

---

# 11. Revised relationship model

The old brief said “connections / links.” The schema lets us define what those actually are.

Your relationship system is currently expressed through multiple tables rather than one single edge table.

Important relationship types include:

- `person` → `firm` via `work_history`
    
- `person` → `title` via `work_history.title_id`
    
- `person` → `job_function` via `work_history.function_id`
    
- `person` → `manager_person` via `work_history.manager_person_id`
    
- `person` → `strategy` via `person_strategy`
    
- `person` → `financial_product` via `person_product`
    
- `person` → `mandate` via `mandate_candidate`
    
- `person` / `firm` / `fund` → `interaction`
    
- `firm` → `location` via `firm_location`
    
- `firm` → `fund`
    
- `firm` → `mandate`
    
- `firm` → `news_article` via `news_tag`
    
- `person` / `firm` / `fund` → `document`
    
- entity → `tag` via `entity_tag` / `firm_tag_map`
    

This is important because the graph view should not be a toy. It should be a projection over these real joins.

---

# 12. Revised data quality / curation layer

One major thing the old brief underplayed: this schema has a strong **review and curation dimension**.

Particularly:

- `person_strategy.review_status`
    
- `person_product.review_status`
    
- `source_document_id`
    
- `override_text`
    
- `deleted_at`
    
- `deletion_reason`
    
- `audit_log`
    

That means the product should explicitly support a **review queue / curation workflow**.

This likely becomes a later center view such as:

- `review.strategies`
    
- `review.products`
    
- `source.trace`
    
- `audit.diff`
    

This is a real differentiator because your system isn’t just storing data — it is refining noisy extracted intelligence into trusted records.

---

# 13. Revised workflow brief

The schema shows two different workflow engines:

## A. Personal work queue workflow

Through:

- `pipeline_item`
    
- `pipeline_stage`
    
- `reminder`
    
- `saved_search`
    

This is your day-to-day operator workflow.

## B. Mandate execution workflow

Through:

- `mandate`
    
- `mandate_section`
    
- `mandate_candidate`
    
- `mandate_candidate_section_event`
    

This is your client-delivery workflow.

These should not be mashed together conceptually.

They are related, but distinct.

That means in the app:

- **Pipeline** deserves its own view grammar
    
- **Mandates** deserve their own view grammar
    

---

# 14. Revised v1 scope

Given the actual schema, a cleaner v1 scope would be:

## Must-have

- shell with left / center / right / overlays
    
- people table
    
- firms table
    
- person floating card
    
- firm floating card
    
- command palette across commands + people + firms
    
- right rail with activity / notes / reminders
    
- full person detail tab
    
- full firm detail tab
    
- basic pipeline queue view
    
- basic mandate list/detail view
    

## Strong v1.5

- person timeline from work history + interactions
    
- firm timeline
    
- document detail
    
- saved search detail
    
- graph/network view
    
- add to mandate flow
    
- add reminder flow
    
- interaction logging modal
    

## Later

- strategy/product review queue
    
- audit diff explorer
    
- richer fund views
    
- document extraction review workbench
    
- performance overlays
    
- manager/team relationship explorer
    

---

# 15. Revised UI object model

Here is the more accurate object model for this schema.

`type EntityType =   | "person"   | "firm"   | "fund"   | "mandate"   | "document"   | "pipeline_item"   | "saved_search"  type ViewType =   | "people.table"   | "firms.table"   | "mandates.table"   | "pipeline.queue"   | "documents.table"   | "person.detail"   | "firm.detail"   | "mandate.detail"   | "document.detail"   | "fund.detail"   | "search.results"   | "graph.network"   | "activity.timeline"   | "review.queue"  type FloatingCardType =   | "person.card"   | "firm.card"  type ActiveContext = {   activePaneId?: string   activeTabId?: string   activeEntityType?: EntityType   activeEntityId?: string   selectionType?: "row" | "text" | "node" | "none"   activeMandateId?: string   activePipelineId?: string }`

---

# 16. Revised product conclusion

The most important correction is this:

You are **not predominantly creating only firm profiles and person profiles**.

You are creating:

- canonical entity records
    
- evolving employment and relationship histories
    
- workflow objects around those records
    
- source-backed intelligence layers
    
- reminders, interactions, and activity systems
    
- reviewable extracted metadata
    
- graphable relationship context
    

So the product brief should position BankSt OS as:

**a workspace for entity intelligence, relationship navigation, and recruiting workflow execution**

with:

- floating inspectors for fast context
    
- full tabs for durable work
    
- a right rail for chronology and action
    
- a command palette for universal operation
    
- graph/timeline views for structural insight
    

That is much closer to what your schema is actually building.

The next useful move is to turn this revised brief into a **screen-by-screen spec** for:

- People table
    
- Person card
    
- Person detail view
    
- Firm table
    
- Firm card
    
- Firm detail view
    
- Pipeline queue
    
- Mandate detail
    
- Right rail widgets
    
- Command palette result types