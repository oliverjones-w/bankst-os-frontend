-- public.alembic_version definition

-- Drop table

-- DROP TABLE public.alembic_version;

CREATE TABLE public.alembic_version ( version_num text NOT NULL, CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num));


-- public.app_user definition

-- Drop table

-- DROP TABLE public.app_user;

CREATE TABLE public.app_user ( user_id uuid DEFAULT uuid_generate_v7() NOT NULL, username text NOT NULL, full_name text NULL, email text NULL, "role" text NULL, active bool DEFAULT true NOT NULL, last_login timestamptz NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT app_user_email_key UNIQUE (email), CONSTRAINT app_user_pkey PRIMARY KEY (user_id), CONSTRAINT app_user_username_key UNIQUE (username));

-- Table Triggers

create trigger trg_app_user_updated_at before
update
    on
    public.app_user for each row execute function set_updated_at();


-- public.firm definition

-- Drop table

-- DROP TABLE public.firm;

CREATE TABLE public.firm ( firm_id uuid DEFAULT uuid_generate_v7() NOT NULL, "name" text NOT NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, firm_key text NULL, CONSTRAINT firm_pkey PRIMARY KEY (firm_id));
CREATE INDEX idx_firm_key_trgm ON public.firm USING gin (firm_key gin_trgm_ops) WHERE (firm_key IS NOT NULL);
CREATE INDEX idx_firm_name_trgm ON public.firm USING gin (name gin_trgm_ops);
CREATE UNIQUE INDEX uq_firm_firm_key ON public.firm USING btree (firm_key) WHERE (firm_key IS NOT NULL);
CREATE UNIQUE INDEX uq_firm_name_ci ON public.firm USING btree (lower(TRIM(BOTH FROM name)));

-- Table Triggers

create trigger trg_firm_updated_at before
update
    on
    public.firm for each row execute function set_updated_at();


-- public.firm_tag_dimension definition

-- Drop table

-- DROP TABLE public.firm_tag_dimension;

CREATE TABLE public.firm_tag_dimension ( "name" text NOT NULL, description text NULL, dimension_id uuid DEFAULT uuid_generate_v7() NOT NULL, CONSTRAINT firm_tag_dimension_name_key UNIQUE (name), CONSTRAINT firm_tag_dimension_pkey PRIMARY KEY (dimension_id));


-- public.mandate_section definition

-- Drop table

-- DROP TABLE public.mandate_section;

CREATE TABLE public.mandate_section ( section_id uuid DEFAULT uuid_generate_v7() NOT NULL, "name" text NOT NULL, "position" int4 NOT NULL, CONSTRAINT mandate_section_name_key UNIQUE (name), CONSTRAINT mandate_section_pkey PRIMARY KEY (section_id), CONSTRAINT mandate_section_position_key UNIQUE ("position"));


-- public.news_article definition

-- Drop table

-- DROP TABLE public.news_article;

CREATE TABLE public.news_article ( article_id uuid DEFAULT gen_random_uuid() NOT NULL, headline varchar NOT NULL, content_md text NULL, url varchar NOT NULL, published_at timestamp NULL, created_at timestamp DEFAULT now() NOT NULL, CONSTRAINT news_article_pkey PRIMARY KEY (article_id), CONSTRAINT news_article_url_key UNIQUE (url));


-- public.person definition

-- Drop table

-- DROP TABLE public.person;

CREATE TABLE public.person ( person_id uuid DEFAULT uuid_generate_v7() NOT NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, first_name text NOT NULL, last_name text NOT NULL, suffix text NULL, CONSTRAINT person_pkey PRIMARY KEY (person_id));
CREATE INDEX idx_person_first_name_trgm ON public.person USING gin (first_name gin_trgm_ops);
CREATE INDEX idx_person_fullname_trgm ON public.person USING gin ((((first_name || ' '::text) || last_name)) gin_trgm_ops);
CREATE INDEX idx_person_last_name_trgm ON public.person USING gin (last_name gin_trgm_ops);

-- Table Triggers

create trigger trg_person_updated_at before
update
    on
    public.person for each row execute function set_updated_at();


-- public.pipeline_stage definition

-- Drop table

-- DROP TABLE public.pipeline_stage;

CREATE TABLE public.pipeline_stage ( "name" text NOT NULL, "position" int4 NOT NULL, stage_id uuid DEFAULT uuid_generate_v7() NOT NULL, CONSTRAINT pipeline_stage_name_key UNIQUE (name), CONSTRAINT pipeline_stage_pkey PRIMARY KEY (stage_id), CONSTRAINT pipeline_stage_position_key UNIQUE ("position"));


-- public.tag definition

-- Drop table

-- DROP TABLE public.tag;

CREATE TABLE public.tag ( tag_id uuid DEFAULT uuid_generate_v7() NOT NULL, "name" text NOT NULL, CONSTRAINT tag_name_key UNIQUE (name), CONSTRAINT tag_pkey PRIMARY KEY (tag_id));
CREATE INDEX idx_tag_name_trgm ON public.tag USING gin (name gin_trgm_ops);


-- public.activity_feed definition

-- Drop table

-- DROP TABLE public.activity_feed;

CREATE TABLE public.activity_feed ( activity_id uuid DEFAULT uuid_generate_v7() NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL, event_type text NOT NULL, user_id uuid NULL, details text NULL, event_time timestamptz DEFAULT now() NOT NULL, CONSTRAINT activity_feed_pkey PRIMARY KEY (activity_id), CONSTRAINT activity_feed_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(user_id) ON DELETE SET NULL);
CREATE INDEX idx_activity_entity ON public.activity_feed USING btree (entity_type, entity_id);
CREATE INDEX idx_activity_time ON public.activity_feed USING btree (event_time);


-- public.audit_log definition

-- Drop table

-- DROP TABLE public.audit_log;

CREATE TABLE public.audit_log ( log_id uuid DEFAULT uuid_generate_v7() NOT NULL, user_id uuid NULL, "action" text NOT NULL, table_name text NOT NULL, record_id text NOT NULL, field_name text NULL, old_value text NULL, new_value text NULL, action_time timestamptz DEFAULT now() NOT NULL, CONSTRAINT audit_log_pkey PRIMARY KEY (log_id), CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(user_id) ON DELETE SET NULL);
CREATE INDEX idx_audit_log_table ON public.audit_log USING btree (table_name);
CREATE INDEX idx_audit_log_user ON public.audit_log USING btree (user_id);


-- public.education definition

-- Drop table

-- DROP TABLE public.education;

CREATE TABLE public.education ( education_id uuid DEFAULT uuid_generate_v7() NOT NULL, person_id uuid NOT NULL, institution_name text NOT NULL, "degree" text NULL, field_of_study text NULL, graduation_year int4 NULL, start_year int4 NULL, end_year int4 NULL, notes text NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT education_pkey PRIMARY KEY (education_id), CONSTRAINT education_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.person(person_id) ON DELETE CASCADE);
CREATE INDEX idx_education_institution ON public.education USING btree (institution_name);
CREATE INDEX idx_education_person ON public.education USING btree (person_id);

-- Table Triggers

create trigger trg_education_updated_at before
update
    on
    public.education for each row execute function set_updated_at();


-- public.financial_product definition

-- Drop table

-- DROP TABLE public.financial_product;

CREATE TABLE public.financial_product ( product_id uuid DEFAULT uuid_generate_v7() NOT NULL, "name" text NOT NULL, category text NULL, subcategory text NULL, parent_id uuid NULL, description text NULL, active bool DEFAULT true NOT NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT financial_product_name_key UNIQUE (name), CONSTRAINT financial_product_pkey PRIMARY KEY (product_id), CONSTRAINT financial_product_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.financial_product(product_id) ON DELETE SET NULL);
CREATE INDEX idx_fin_product_name_trgm ON public.financial_product USING gin (name gin_trgm_ops);

-- Table Triggers

create trigger trg_financial_product_updated_at before
update
    on
    public.financial_product for each row execute function set_updated_at();


-- public.firm_alias definition

-- Drop table

-- DROP TABLE public.firm_alias;

CREATE TABLE public.firm_alias ( firm_alias_id uuid DEFAULT uuid_generate_v7() NOT NULL, firm_id uuid NULL, alias_text text NOT NULL, alias_normalized text NOT NULL, alias_type text DEFAULT 'alias'::text NOT NULL, active bool DEFAULT true NOT NULL, "source" text NULL, notes text NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT ck_firm_alias_alias_type CHECK ((alias_type = ANY (ARRAY['alias'::text, 'platform'::text, 'blacklist'::text]))), CONSTRAINT firm_alias_pkey PRIMARY KEY (firm_alias_id), CONSTRAINT firm_alias_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firm(firm_id) ON DELETE CASCADE);
CREATE INDEX idx_firm_alias_firm ON public.firm_alias USING btree (firm_id);
CREATE INDEX idx_firm_alias_norm_trgm ON public.firm_alias USING gin (alias_normalized gin_trgm_ops);
CREATE INDEX idx_firm_alias_text_trgm ON public.firm_alias USING gin (alias_text gin_trgm_ops);
CREATE UNIQUE INDEX uq_firm_alias_norm ON public.firm_alias USING btree (alias_normalized, alias_type) WHERE (active = true);

-- Table Triggers

create trigger trg_firm_alias_updated_at before
update
    on
    public.firm_alias for each row execute function set_updated_at();


-- public.firm_notes definition

-- Drop table

-- DROP TABLE public.firm_notes;

CREATE TABLE public.firm_notes ( note_id uuid DEFAULT uuid_generate_v7() NOT NULL, firm_id uuid NOT NULL, "content" text NOT NULL, created_by uuid NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT firm_notes_pkey PRIMARY KEY (note_id), CONSTRAINT firm_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(user_id) ON DELETE SET NULL, CONSTRAINT firm_notes_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firm(firm_id) ON DELETE CASCADE);

-- Table Triggers

create trigger trg_firm_notes_updated_at before
update
    on
    public.firm_notes for each row execute function set_updated_at();


-- public.firm_tag definition

-- Drop table

-- DROP TABLE public.firm_tag;

CREATE TABLE public.firm_tag ( "name" text NOT NULL, description text NULL, active bool DEFAULT true NOT NULL, dimension_id uuid NULL, tag_id uuid DEFAULT uuid_generate_v7() NOT NULL, CONSTRAINT firm_tag_name_key UNIQUE (name), CONSTRAINT firm_tag_pkey PRIMARY KEY (tag_id), CONSTRAINT firm_tag_dimension_id_fkey FOREIGN KEY (dimension_id) REFERENCES public.firm_tag_dimension(dimension_id) ON DELETE SET NULL);
CREATE INDEX idx_firm_tag_name_trgm ON public.firm_tag USING gin (name gin_trgm_ops);


-- public.firm_tag_map definition

-- Drop table

-- DROP TABLE public.firm_tag_map;

CREATE TABLE public.firm_tag_map ( firm_id uuid NOT NULL, tag_id uuid NOT NULL, created_by uuid NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT firm_tag_map_pkey PRIMARY KEY (firm_id, tag_id), CONSTRAINT firm_tag_map_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(user_id) ON DELETE SET NULL, CONSTRAINT firm_tag_map_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firm(firm_id) ON DELETE CASCADE, CONSTRAINT firm_tag_map_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.firm_tag(tag_id) ON DELETE RESTRICT);
CREATE INDEX idx_firm_tag_map_firm ON public.firm_tag_map USING btree (firm_id);
CREATE INDEX idx_firm_tag_map_tag ON public.firm_tag_map USING btree (tag_id);

-- Table Triggers

create trigger trg_firm_tag_map_updated_at before
update
    on
    public.firm_tag_map for each row execute function set_updated_at();


-- public.fund definition

-- Drop table

-- DROP TABLE public.fund;

CREATE TABLE public.fund ( fund_id uuid DEFAULT uuid_generate_v7() NOT NULL, firm_id uuid NULL, "name" text NOT NULL, fund_type text NULL, inception_date date NULL, aum_usd numeric NULL, aum_date date NULL, active bool DEFAULT true NOT NULL, notes text NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT fund_pkey PRIMARY KEY (fund_id), CONSTRAINT fund_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firm(firm_id) ON DELETE SET NULL);
CREATE INDEX idx_fund_firm ON public.fund USING btree (firm_id);
CREATE INDEX idx_fund_name_trgm ON public.fund USING gin (name gin_trgm_ops);

-- Table Triggers

create trigger trg_fund_updated_at before
update
    on
    public.fund for each row execute function set_updated_at();


-- public.job_function definition

-- Drop table

-- DROP TABLE public.job_function;

CREATE TABLE public.job_function ( function_id uuid DEFAULT uuid_generate_v7() NOT NULL, "name" text NOT NULL, description text NULL, risk_taker bool NULL, "hierarchy" int4 NULL, active bool DEFAULT true NOT NULL, created_at timestamptz DEFAULT now() NOT NULL, created_by uuid NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT job_function_name_key UNIQUE (name), CONSTRAINT job_function_pkey PRIMARY KEY (function_id), CONSTRAINT job_function_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(user_id) ON DELETE SET NULL);
CREATE INDEX idx_job_fn_name_trgm ON public.job_function USING gin (name gin_trgm_ops);

-- Table Triggers

create trigger trg_job_function_updated_at before
update
    on
    public.job_function for each row execute function set_updated_at();


-- public."location" definition

-- Drop table

-- DROP TABLE public."location";

CREATE TABLE public."location" ( location_id uuid DEFAULT uuid_generate_v7() NOT NULL, "name" text NOT NULL, nickname text NULL, "type" text NOT NULL, parent_id uuid NULL, timezone text NULL, latitude numeric(9, 6) NULL, longitude numeric(9, 6) NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT location_pkey PRIMARY KEY (location_id), CONSTRAINT location_type_parent_name_uq UNIQUE (type, parent_id, name), CONSTRAINT location_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public."location"(location_id) ON DELETE SET NULL);
CREATE INDEX idx_location_name_trgm ON public.location USING gin (name gin_trgm_ops);

-- Table Triggers

create trigger trg_location_updated_at before
update
    on
    public.location for each row execute function set_updated_at();


-- public.mandate definition

-- Drop table

-- DROP TABLE public.mandate;

CREATE TABLE public.mandate ( mandate_id uuid DEFAULT uuid_generate_v7() NOT NULL, owner_user_id uuid NOT NULL, client_firm_id uuid NOT NULL, "name" text NOT NULL, description text NULL, status text DEFAULT 'active'::text NOT NULL, priority text NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT mandate_pkey PRIMARY KEY (mandate_id), CONSTRAINT mandate_client_firm_id_fkey FOREIGN KEY (client_firm_id) REFERENCES public.firm(firm_id) ON DELETE RESTRICT, CONSTRAINT mandate_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.app_user(user_id) ON DELETE RESTRICT);
CREATE INDEX idx_mandate_client_firm ON public.mandate USING btree (client_firm_id);
CREATE INDEX idx_mandate_owner ON public.mandate USING btree (owner_user_id);

-- Table Triggers

create trigger trg_mandate_updated_at before
update
    on
    public.mandate for each row execute function set_updated_at();


-- public.mandate_candidate definition

-- Drop table

-- DROP TABLE public.mandate_candidate;

CREATE TABLE public.mandate_candidate ( mandate_candidate_id uuid DEFAULT uuid_generate_v7() NOT NULL, mandate_id uuid NOT NULL, person_id uuid NOT NULL, added_by uuid NULL, notes text NULL, created_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT mandate_candidate_pkey PRIMARY KEY (mandate_candidate_id), CONSTRAINT uq_mandate_candidate UNIQUE (mandate_id, person_id), CONSTRAINT mandate_candidate_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.app_user(user_id) ON DELETE SET NULL, CONSTRAINT mandate_candidate_mandate_id_fkey FOREIGN KEY (mandate_id) REFERENCES public.mandate(mandate_id) ON DELETE CASCADE, CONSTRAINT mandate_candidate_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.person(person_id) ON DELETE RESTRICT);
CREATE INDEX idx_mandate_candidate_mandate ON public.mandate_candidate USING btree (mandate_id);
CREATE INDEX idx_mandate_candidate_person ON public.mandate_candidate USING btree (person_id);


-- public.mandate_candidate_section_event definition

-- Drop table

-- DROP TABLE public.mandate_candidate_section_event;

CREATE TABLE public.mandate_candidate_section_event ( event_id uuid DEFAULT uuid_generate_v7() NOT NULL, mandate_candidate_id uuid NOT NULL, section_id uuid NOT NULL, moved_by uuid NULL, notes text NULL, created_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT mandate_candidate_section_event_pkey PRIMARY KEY (event_id), CONSTRAINT mandate_candidate_section_event_mandate_candidate_id_fkey FOREIGN KEY (mandate_candidate_id) REFERENCES public.mandate_candidate(mandate_candidate_id) ON DELETE CASCADE, CONSTRAINT mandate_candidate_section_event_moved_by_fkey FOREIGN KEY (moved_by) REFERENCES public.app_user(user_id) ON DELETE SET NULL, CONSTRAINT mandate_candidate_section_event_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.mandate_section(section_id) ON DELETE RESTRICT);
CREATE INDEX idx_mcs_event_candidate_time ON public.mandate_candidate_section_event USING btree (mandate_candidate_id, created_at DESC);
CREATE INDEX idx_mcs_event_section ON public.mandate_candidate_section_event USING btree (section_id);


-- public.news_tag definition

-- Drop table

-- DROP TABLE public.news_tag;

CREATE TABLE public.news_tag ( article_id uuid NOT NULL, firm_id uuid NOT NULL, created_at timestamp DEFAULT now() NOT NULL, CONSTRAINT news_tag_pkey PRIMARY KEY (article_id, firm_id), CONSTRAINT news_tag_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.news_article(article_id) ON DELETE CASCADE, CONSTRAINT news_tag_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firm(firm_id) ON DELETE CASCADE);


-- public.person_notes definition

-- Drop table

-- DROP TABLE public.person_notes;

CREATE TABLE public.person_notes ( note_id uuid DEFAULT uuid_generate_v7() NOT NULL, person_id uuid NOT NULL, "content" text NOT NULL, created_by uuid NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT person_notes_pkey PRIMARY KEY (note_id), CONSTRAINT person_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(user_id) ON DELETE SET NULL, CONSTRAINT person_notes_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.person(person_id) ON DELETE CASCADE);

-- Table Triggers

create trigger trg_person_notes_updated_at before
update
    on
    public.person_notes for each row execute function set_updated_at();


-- public.phone_numbers definition

-- Drop table

-- DROP TABLE public.phone_numbers;

CREATE TABLE public.phone_numbers ( phone_id uuid DEFAULT uuid_generate_v7() NOT NULL, person_id uuid NOT NULL, phone_raw text NULL, phone_normalized text NOT NULL, phone_type text NULL, is_primary bool DEFAULT false NOT NULL, added_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT phone_numbers_phone_normalized_key UNIQUE (phone_normalized), CONSTRAINT phone_numbers_pkey PRIMARY KEY (phone_id), CONSTRAINT phone_numbers_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.person(person_id) ON DELETE CASCADE);
CREATE INDEX idx_phone_person ON public.phone_numbers USING btree (person_id);
CREATE UNIQUE INDEX uq_phone_one_primary_per_person ON public.phone_numbers USING btree (person_id) WHERE (is_primary = true);


-- public.pipeline_item definition

-- Drop table

-- DROP TABLE public.pipeline_item;

CREATE TABLE public.pipeline_item ( pipeline_id uuid DEFAULT uuid_generate_v7() NOT NULL, person_id uuid NULL, firm_id uuid NULL, user_id uuid NOT NULL, stage_id uuid NOT NULL, priority text NULL, next_step_date date NULL, job_title text NULL, role_type text NULL, value_usd numeric NULL, status_notes text NULL, active bool DEFAULT true NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, created_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT pipeline_item_entity_ck CHECK (((person_id IS NOT NULL) OR (firm_id IS NOT NULL))), CONSTRAINT pipeline_item_pkey PRIMARY KEY (pipeline_id), CONSTRAINT pipeline_item_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firm(firm_id) ON DELETE SET NULL, CONSTRAINT pipeline_item_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.person(person_id) ON DELETE SET NULL, CONSTRAINT pipeline_item_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.pipeline_stage(stage_id) ON DELETE RESTRICT, CONSTRAINT pipeline_item_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(user_id) ON DELETE RESTRICT);
CREATE INDEX idx_pipeline_firm ON public.pipeline_item USING btree (firm_id);
CREATE INDEX idx_pipeline_next_step ON public.pipeline_item USING btree (next_step_date);
CREATE INDEX idx_pipeline_person ON public.pipeline_item USING btree (person_id);
CREATE INDEX idx_pipeline_stage ON public.pipeline_item USING btree (stage_id);
CREATE INDEX idx_pipeline_work_queue ON public.pipeline_item USING btree (user_id, active, next_step_date);

-- Table Triggers

create trigger trg_pipeline_item_updated_at before
update
    on
    public.pipeline_item for each row execute function set_updated_at();


-- public.reminder definition

-- Drop table

-- DROP TABLE public.reminder;

CREATE TABLE public.reminder ( reminder_id uuid DEFAULT uuid_generate_v7() NOT NULL, user_id uuid NULL, entity_type text NOT NULL, entity_id text NOT NULL, remind_at timestamptz NOT NULL, message text NULL, completed bool DEFAULT false NOT NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT reminder_pkey PRIMARY KEY (reminder_id), CONSTRAINT reminder_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(user_id) ON DELETE CASCADE);
CREATE INDEX idx_reminder_time ON public.reminder USING btree (remind_at);
CREATE INDEX idx_reminder_user ON public.reminder USING btree (user_id);

-- Table Triggers

create trigger trg_reminder_updated_at before
update
    on
    public.reminder for each row execute function set_updated_at();


-- public.saved_search definition

-- Drop table

-- DROP TABLE public.saved_search;

CREATE TABLE public.saved_search ( search_id uuid DEFAULT uuid_generate_v7() NOT NULL, user_id uuid NOT NULL, "name" text NOT NULL, "type" text NULL, notes text NULL, active bool DEFAULT true NOT NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT saved_search_pkey PRIMARY KEY (search_id), CONSTRAINT saved_search_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(user_id) ON DELETE CASCADE);
CREATE INDEX idx_saved_search_user ON public.saved_search USING btree (user_id);

-- Table Triggers

create trigger trg_saved_search_updated_at before
update
    on
    public.saved_search for each row execute function set_updated_at();


-- public.saved_search_member definition

-- Drop table

-- DROP TABLE public.saved_search_member;

CREATE TABLE public.saved_search_member ( member_id uuid DEFAULT uuid_generate_v7() NOT NULL, search_id uuid NOT NULL, person_id uuid NULL, firm_id uuid NULL, added_at timestamptz DEFAULT now() NOT NULL, added_by uuid NULL, CONSTRAINT saved_search_member_entity_ck CHECK (((person_id IS NOT NULL) OR (firm_id IS NOT NULL))), CONSTRAINT saved_search_member_pkey PRIMARY KEY (member_id), CONSTRAINT saved_search_member_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.app_user(user_id) ON DELETE SET NULL, CONSTRAINT saved_search_member_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firm(firm_id) ON DELETE CASCADE, CONSTRAINT saved_search_member_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.person(person_id) ON DELETE CASCADE, CONSTRAINT saved_search_member_search_id_fkey FOREIGN KEY (search_id) REFERENCES public.saved_search(search_id) ON DELETE CASCADE);
CREATE INDEX idx_saved_search_member_firm ON public.saved_search_member USING btree (firm_id);
CREATE INDEX idx_saved_search_member_person ON public.saved_search_member USING btree (person_id);
CREATE INDEX idx_saved_search_member_search ON public.saved_search_member USING btree (search_id);
CREATE UNIQUE INDEX uq_saved_search_member_firm ON public.saved_search_member USING btree (search_id, firm_id) WHERE (firm_id IS NOT NULL);
CREATE UNIQUE INDEX uq_saved_search_member_person ON public.saved_search_member USING btree (search_id, person_id) WHERE (person_id IS NOT NULL);


-- public.strategy definition

-- Drop table

-- DROP TABLE public.strategy;

CREATE TABLE public.strategy ( strategy_id uuid DEFAULT uuid_generate_v7() NOT NULL, "name" text NOT NULL, parent_id uuid NULL, description text NULL, active bool DEFAULT true NOT NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT strategy_name_key UNIQUE (name), CONSTRAINT strategy_pkey PRIMARY KEY (strategy_id), CONSTRAINT strategy_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.strategy(strategy_id) ON DELETE SET NULL);
CREATE INDEX idx_strategy_name_trgm ON public.strategy USING gin (name gin_trgm_ops);

-- Table Triggers

create trigger trg_strategy_updated_at before
update
    on
    public.strategy for each row execute function set_updated_at();


-- public.title definition

-- Drop table

-- DROP TABLE public.title;

CREATE TABLE public.title ( title_id uuid DEFAULT uuid_generate_v7() NOT NULL, "name" text NOT NULL, seniority int4 NOT NULL, active bool DEFAULT true NOT NULL, created_at timestamptz DEFAULT now() NOT NULL, created_by uuid NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT title_name_key UNIQUE (name), CONSTRAINT title_pkey PRIMARY KEY (title_id), CONSTRAINT title_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(user_id) ON DELETE SET NULL);
CREATE INDEX idx_title_name_trgm ON public.title USING gin (name gin_trgm_ops);

-- Table Triggers

create trigger trg_title_updated_at before
update
    on
    public.title for each row execute function set_updated_at();


-- public."document" definition

-- Drop table

-- DROP TABLE public."document";

CREATE TABLE public."document" ( document_id uuid DEFAULT uuid_generate_v7() NOT NULL, person_id uuid NULL, firm_id uuid NULL, fund_id uuid NULL, filename text NOT NULL, mime_type text NULL, filetype text NULL, file_url text NULL, extracted_text text NULL, extraction_status text DEFAULT 'pending'::text NOT NULL, extracted_at timestamptz NULL, uploaded_at timestamptz DEFAULT now() NOT NULL, uploaded_by uuid NULL, notes text NULL, CONSTRAINT document_pkey PRIMARY KEY (document_id), CONSTRAINT document_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firm(firm_id) ON DELETE SET NULL, CONSTRAINT document_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.person(person_id) ON DELETE SET NULL, CONSTRAINT document_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.app_user(user_id) ON DELETE SET NULL, CONSTRAINT fk_document_fund FOREIGN KEY (fund_id) REFERENCES public.fund(fund_id) ON DELETE SET NULL);
CREATE INDEX idx_document_extraction_status ON public.document USING btree (extraction_status);
CREATE INDEX idx_document_firm ON public.document USING btree (firm_id);
CREATE INDEX idx_document_fund ON public.document USING btree (fund_id);
CREATE INDEX idx_document_person ON public.document USING btree (person_id);


-- public.entity_tag definition

-- Drop table

-- DROP TABLE public.entity_tag;

CREATE TABLE public.entity_tag ( entity_tag_id uuid DEFAULT uuid_generate_v7() NOT NULL, tag_id uuid NOT NULL, person_id uuid NULL, firm_id uuid NULL, fund_id uuid NULL, auto_tagged bool DEFAULT false NOT NULL, created_by uuid NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT entity_tag_pkey PRIMARY KEY (entity_tag_id), CONSTRAINT entity_tag_target_ck CHECK ((((((person_id IS NOT NULL))::integer + ((firm_id IS NOT NULL))::integer) + ((fund_id IS NOT NULL))::integer) = 1)), CONSTRAINT entity_tag_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(user_id) ON DELETE SET NULL, CONSTRAINT entity_tag_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firm(firm_id) ON DELETE CASCADE, CONSTRAINT entity_tag_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.fund(fund_id) ON DELETE CASCADE, CONSTRAINT entity_tag_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.person(person_id) ON DELETE CASCADE, CONSTRAINT entity_tag_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tag(tag_id) ON DELETE CASCADE);
CREATE INDEX idx_entity_tag_firm ON public.entity_tag USING btree (firm_id);
CREATE INDEX idx_entity_tag_fund ON public.entity_tag USING btree (fund_id);
CREATE INDEX idx_entity_tag_person ON public.entity_tag USING btree (person_id);
CREATE INDEX idx_entity_tag_tag ON public.entity_tag USING btree (tag_id);

-- Table Triggers

create trigger trg_entity_tag_updated_at before
update
    on
    public.entity_tag for each row execute function set_updated_at();


-- public.firm_location definition

-- Drop table

-- DROP TABLE public.firm_location;

CREATE TABLE public.firm_location ( firm_location_id uuid DEFAULT uuid_generate_v7() NOT NULL, firm_id uuid NOT NULL, location_id uuid NULL, location_type text NULL, street_address text NULL, postal_code text NULL, notes text NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT firm_location_pkey PRIMARY KEY (firm_location_id), CONSTRAINT firm_location_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firm(firm_id) ON DELETE CASCADE, CONSTRAINT firm_location_location_id_fkey FOREIGN KEY (location_id) REFERENCES public."location"(location_id) ON DELETE SET NULL);
CREATE INDEX idx_firm_location_firm ON public.firm_location USING btree (firm_id);
CREATE INDEX idx_firm_location_location ON public.firm_location USING btree (location_id);

-- Table Triggers

create trigger trg_firm_location_updated_at before
update
    on
    public.firm_location for each row execute function set_updated_at();


-- public.interaction definition

-- Drop table

-- DROP TABLE public.interaction;

CREATE TABLE public.interaction ( interaction_id uuid DEFAULT uuid_generate_v7() NOT NULL, person_id uuid NULL, firm_id uuid NULL, fund_id uuid NULL, user_id uuid NULL, interaction_type text NULL, interaction_date timestamptz DEFAULT now() NOT NULL, summary text NULL, outcome text NULL, next_steps text NULL, notes text NULL, mandate_id uuid NULL, CONSTRAINT interaction_pkey PRIMARY KEY (interaction_id), CONSTRAINT interaction_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firm(firm_id) ON DELETE SET NULL, CONSTRAINT interaction_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.fund(fund_id) ON DELETE SET NULL, CONSTRAINT interaction_mandate_id_fkey FOREIGN KEY (mandate_id) REFERENCES public.mandate(mandate_id) ON DELETE SET NULL, CONSTRAINT interaction_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.person(person_id) ON DELETE SET NULL, CONSTRAINT interaction_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(user_id) ON DELETE SET NULL);
CREATE INDEX idx_interaction_date ON public.interaction USING btree (interaction_date);
CREATE INDEX idx_interaction_firm ON public.interaction USING btree (firm_id);
CREATE INDEX idx_interaction_fund ON public.interaction USING btree (fund_id);
CREATE INDEX idx_interaction_mandate_date ON public.interaction USING btree (mandate_id, interaction_date DESC);
CREATE INDEX idx_interaction_person ON public.interaction USING btree (person_id);
CREATE INDEX idx_interaction_type ON public.interaction USING btree (interaction_type);
CREATE INDEX idx_interaction_user ON public.interaction USING btree (user_id);


-- public.person_product definition

-- Drop table

-- DROP TABLE public.person_product;

CREATE TABLE public.person_product ( person_product_id uuid DEFAULT uuid_generate_v7() NOT NULL, person_id uuid NOT NULL, product_id uuid NULL, product_free_text text NULL, "source" text NOT NULL, confidence numeric(4, 3) NULL, model_version text NULL, source_document_id uuid NULL, review_status text DEFAULT 'pending'::text NOT NULL, reviewed_by uuid NULL, reviewed_at timestamptz NULL, deleted_at timestamptz NULL, deletion_reason text NULL, deleted_by uuid NULL, created_at timestamptz DEFAULT now() NOT NULL, created_by uuid NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT person_product_label_ck CHECK (((product_id IS NOT NULL) OR (product_free_text IS NOT NULL))), CONSTRAINT person_product_pkey PRIMARY KEY (person_product_id), CONSTRAINT person_product_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(user_id) ON DELETE SET NULL, CONSTRAINT person_product_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.app_user(user_id) ON DELETE SET NULL, CONSTRAINT person_product_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.person(person_id) ON DELETE CASCADE, CONSTRAINT person_product_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.financial_product(product_id) ON DELETE SET NULL, CONSTRAINT person_product_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.app_user(user_id) ON DELETE SET NULL, CONSTRAINT person_product_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES public."document"(document_id) ON DELETE SET NULL);
CREATE INDEX idx_person_product_deleted ON public.person_product USING btree (deleted_at);
CREATE INDEX idx_person_product_person ON public.person_product USING btree (person_id);
CREATE INDEX idx_person_product_product ON public.person_product USING btree (product_id);
CREATE UNIQUE INDEX uq_person_product_live_dedupe ON public.person_product USING btree (person_id, COALESCE((product_id)::text, product_free_text), source) WHERE (deleted_at IS NULL);

-- Table Triggers

create trigger trg_person_product_updated_at before
update
    on
    public.person_product for each row execute function set_updated_at();


-- public.person_strategy definition

-- Drop table

-- DROP TABLE public.person_strategy;

CREATE TABLE public.person_strategy ( person_strategy_id uuid DEFAULT uuid_generate_v7() NOT NULL, person_id uuid NOT NULL, strategy_id uuid NULL, strategy_free_text text NULL, "source" text NOT NULL, confidence numeric(4, 3) NULL, model_version text NULL, source_document_id uuid NULL, review_status text DEFAULT 'pending'::text NOT NULL, reviewed_by uuid NULL, reviewed_at timestamptz NULL, override_text text NULL, deleted_at timestamptz NULL, deletion_reason text NULL, deleted_by uuid NULL, created_at timestamptz DEFAULT now() NOT NULL, created_by uuid NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT person_strategy_label_ck CHECK (((strategy_id IS NOT NULL) OR (strategy_free_text IS NOT NULL))), CONSTRAINT person_strategy_pkey PRIMARY KEY (person_strategy_id), CONSTRAINT person_strategy_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(user_id) ON DELETE SET NULL, CONSTRAINT person_strategy_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.app_user(user_id) ON DELETE SET NULL, CONSTRAINT person_strategy_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.person(person_id) ON DELETE CASCADE, CONSTRAINT person_strategy_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.app_user(user_id) ON DELETE SET NULL, CONSTRAINT person_strategy_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES public."document"(document_id) ON DELETE SET NULL, CONSTRAINT person_strategy_strategy_id_fkey FOREIGN KEY (strategy_id) REFERENCES public.strategy(strategy_id) ON DELETE SET NULL);
CREATE INDEX idx_person_strategy_deleted ON public.person_strategy USING btree (deleted_at);
CREATE INDEX idx_person_strategy_person ON public.person_strategy USING btree (person_id);
CREATE INDEX idx_person_strategy_review ON public.person_strategy USING btree (review_status);
CREATE INDEX idx_person_strategy_source ON public.person_strategy USING btree (source);
CREATE UNIQUE INDEX uq_person_strategy_live_dedupe ON public.person_strategy USING btree (person_id, COALESCE((strategy_id)::text, strategy_free_text), source) WHERE (deleted_at IS NULL);

-- Table Triggers

create trigger trg_person_strategy_updated_at before
update
    on
    public.person_strategy for each row execute function set_updated_at();


-- public.work_history definition

-- Drop table

-- DROP TABLE public.work_history;

CREATE TABLE public.work_history ( work_id uuid DEFAULT uuid_generate_v7() NOT NULL, person_id uuid NOT NULL, firm_id uuid NOT NULL, title_raw text NULL, title_id uuid NULL, function_id uuid NULL, manager_person_id uuid NULL, date_start date NULL, date_end date NULL, is_current bool DEFAULT false NOT NULL, firm_location_id uuid NULL, primary_location_id uuid NULL, secondary_location_id uuid NULL, location_notes text NULL, notes text NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT work_history_pkey PRIMARY KEY (work_id), CONSTRAINT work_history_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firm(firm_id) ON DELETE RESTRICT, CONSTRAINT work_history_firm_location_id_fkey FOREIGN KEY (firm_location_id) REFERENCES public.firm_location(firm_location_id) ON DELETE SET NULL, CONSTRAINT work_history_function_id_fkey FOREIGN KEY (function_id) REFERENCES public.job_function(function_id) ON DELETE SET NULL, CONSTRAINT work_history_manager_person_id_fkey FOREIGN KEY (manager_person_id) REFERENCES public.person(person_id) ON DELETE SET NULL, CONSTRAINT work_history_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.person(person_id) ON DELETE CASCADE, CONSTRAINT work_history_primary_location_id_fkey FOREIGN KEY (primary_location_id) REFERENCES public."location"(location_id) ON DELETE SET NULL, CONSTRAINT work_history_secondary_location_id_fkey FOREIGN KEY (secondary_location_id) REFERENCES public."location"(location_id) ON DELETE SET NULL, CONSTRAINT work_history_title_id_fkey FOREIGN KEY (title_id) REFERENCES public.title(title_id) ON DELETE SET NULL);
CREATE INDEX idx_work_history_firm ON public.work_history USING btree (firm_id);
CREATE INDEX idx_work_history_function ON public.work_history USING btree (function_id);
CREATE INDEX idx_work_history_manager ON public.work_history USING btree (manager_person_id);
CREATE INDEX idx_work_history_person_current ON public.work_history USING btree (person_id, is_current);
CREATE INDEX idx_work_history_title ON public.work_history USING btree (title_id);
CREATE UNIQUE INDEX uq_work_history_one_current_per_person ON public.work_history USING btree (person_id) WHERE (is_current = true);

-- Table Triggers

create trigger trg_work_history_updated_at before
update
    on
    public.work_history for each row execute function set_updated_at();


-- public.emails definition

-- Drop table

-- DROP TABLE public.emails;

CREATE TABLE public.emails ( email_id uuid DEFAULT uuid_generate_v7() NOT NULL, person_id uuid NOT NULL, work_id uuid NULL, email_raw text NULL, email_normalized text NOT NULL, email_type text NULL, is_primary bool DEFAULT false NOT NULL, is_verified bool DEFAULT false NOT NULL, added_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT ck_emails_email_type CHECK ((email_type = ANY (ARRAY['work'::text, 'personal'::text, 'other'::text]))), CONSTRAINT emails_email_normalized_key UNIQUE (email_normalized), CONSTRAINT emails_pkey PRIMARY KEY (email_id), CONSTRAINT emails_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.person(person_id) ON DELETE CASCADE, CONSTRAINT emails_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.work_history(work_id) ON DELETE SET NULL);
CREATE INDEX idx_emails_person ON public.emails USING btree (person_id);
CREATE INDEX idx_emails_work ON public.emails USING btree (work_id);
CREATE UNIQUE INDEX uq_emails_one_primary_per_person ON public.emails USING btree (person_id) WHERE (is_primary = true);


-- public.performance definition

-- Drop table

-- DROP TABLE public.performance;

CREATE TABLE public.performance ( performance_id uuid DEFAULT uuid_generate_v7() NOT NULL, person_id uuid NULL, work_id uuid NULL, "year" int4 NULL, "period" text NULL, pnl_usd numeric NULL, return_pct numeric NULL, capital_usd numeric NULL, vol_usd numeric NULL, var_usd numeric NULL, product text NULL, "source" text NULL, notes text NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT performance_pkey PRIMARY KEY (performance_id), CONSTRAINT performance_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.person(person_id) ON DELETE SET NULL, CONSTRAINT performance_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.work_history(work_id) ON DELETE SET NULL);
CREATE INDEX idx_perf_person ON public.performance USING btree (person_id);
CREATE INDEX idx_perf_work ON public.performance USING btree (work_id);

-- Table Triggers

create trigger trg_performance_updated_at before
update
    on
    public.performance for each row execute function set_updated_at();