-- ============================================================
-- Northern Wolves AC — Supabase Database Schema
-- Phase 1: Tables, RLS, Triggers, Storage
-- Run this entire script in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 0. HELPER FUNCTION — check user role for RLS policies
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_has_role(allowed_roles text[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = ANY(allowed_roles)
    AND is_active = true
  );
END;
$$;

-- ============================================================
-- 1. PROFILES — extends auth.users
-- ============================================================
CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text,
  full_name   text NOT NULL DEFAULT '',
  phone       text DEFAULT '',
  role        text NOT NULL DEFAULT 'tech'
              CHECK (role IN ('tech','foreman','pm','manager','admin')),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Everyone can read all profiles (need names for dropdowns, assignments)
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- Users can update their own profile
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());

-- Managers/admins can update any profile
CREATE POLICY "profiles_update_managers" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.user_has_role(ARRAY['manager','admin']));

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'tech')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 2. CUSTOMERS — shared customer/site database
-- ============================================================
CREATE TABLE public.customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  address       text DEFAULT '',
  city          text DEFAULT '',
  state         text DEFAULT 'NY',
  zip           text DEFAULT '',
  contact_name  text DEFAULT '',
  contact_phone text DEFAULT '',
  contact_email text DEFAULT '',
  building_type text DEFAULT '',
  notes         text DEFAULT '',
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_name ON public.customers(name);
CREATE INDEX idx_customers_active ON public.customers(is_active) WHERE is_active = true;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read customers
CREATE POLICY "customers_select" ON public.customers
  FOR SELECT TO authenticated USING (true);

-- All authenticated users can create customers (techs need to add new customers in the field)
CREATE POLICY "customers_insert" ON public.customers
  FOR INSERT TO authenticated WITH CHECK (true);

-- Managers/admins can update customers
CREATE POLICY "customers_update" ON public.customers
  FOR UPDATE TO authenticated
  USING (public.user_has_role(ARRAY['manager','admin']));

-- Admins can delete customers
CREATE POLICY "customers_delete" ON public.customers
  FOR DELETE TO authenticated
  USING (public.user_has_role(ARRAY['admin']));

-- ============================================================
-- 3. EQUIPMENT — per customer/site
-- ============================================================
CREATE TABLE public.equipment (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  equipment_type   text NOT NULL DEFAULT '',
  manufacturer     text DEFAULT '',
  model            text DEFAULT '',
  serial_number    text DEFAULT '',
  refrigerant_type text DEFAULT '',
  location_tag     text DEFAULT '',
  capacity         text DEFAULT '',
  install_year     integer,
  condition        text DEFAULT 'Good'
                   CHECK (condition IN ('New','Good','Fair','Poor','End of Life')),
  notes            text DEFAULT '',
  is_active        boolean NOT NULL DEFAULT true,
  created_by       uuid REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_equipment_customer ON public.equipment(customer_id);
CREATE INDEX idx_equipment_serial ON public.equipment(serial_number) WHERE serial_number != '';

ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read equipment
CREATE POLICY "equipment_select" ON public.equipment
  FOR SELECT TO authenticated USING (true);

-- All authenticated can create (techs log new equipment in the field)
CREATE POLICY "equipment_insert" ON public.equipment
  FOR INSERT TO authenticated WITH CHECK (true);

-- Managers/admins can update
CREATE POLICY "equipment_update" ON public.equipment
  FOR UPDATE TO authenticated
  USING (public.user_has_role(ARRAY['manager','admin']));

-- Admins can delete
CREATE POLICY "equipment_delete" ON public.equipment
  FOR DELETE TO authenticated
  USING (public.user_has_role(ARRAY['admin']));

-- ============================================================
-- 4. PROJECTS — project hub
-- ============================================================
CREATE TABLE public.projects (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name          text NOT NULL,
  project_number        text DEFAULT '',
  customer_id           uuid REFERENCES public.customers(id),
  address               text DEFAULT '',
  city                  text DEFAULT '',
  state                 text DEFAULT 'NY',
  zip                   text DEFAULT '',
  description           text DEFAULT '',
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','on-hold','completed','cancelled')),
  start_date            date,
  estimated_completion  date,
  actual_completion     date,
  project_manager_id    uuid REFERENCES public.profiles(id),
  contract_value        numeric(12,2),
  notes                 text DEFAULT '',
  created_by            uuid REFERENCES public.profiles(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_customer ON public.projects(customer_id);
CREATE INDEX idx_projects_status ON public.projects(status);
CREATE INDEX idx_projects_pm ON public.projects(project_manager_id);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- All authenticated can read projects
CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated USING (true);

-- Foremen/PMs/managers/admins can create projects
CREATE POLICY "projects_insert" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_role(ARRAY['foreman','pm','manager','admin']));

-- Managers/admins can update projects
CREATE POLICY "projects_update" ON public.projects
  FOR UPDATE TO authenticated
  USING (public.user_has_role(ARRAY['pm','manager','admin']));

-- Admins can delete projects
CREATE POLICY "projects_delete" ON public.projects
  FOR DELETE TO authenticated
  USING (public.user_has_role(ARRAY['admin']));

-- ============================================================
-- 5. PROJECT DOCUMENTS — drawings, submittals, manuals, etc.
-- ============================================================
CREATE TABLE public.project_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  document_type text NOT NULL DEFAULT 'other'
                CHECK (document_type IN ('drawing','submittal','manual','warranty','report','specification','contract','photo','other')),
  title         text NOT NULL,
  description   text DEFAULT '',
  storage_path  text NOT NULL,
  file_name     text NOT NULL,
  file_size     integer,
  mime_type     text DEFAULT '',
  version       text DEFAULT '1',
  uploaded_by   uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_docs_project ON public.project_documents(project_id);
CREATE INDEX idx_project_docs_type ON public.project_documents(project_id, document_type);

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

-- All authenticated can read project documents
CREATE POLICY "project_docs_select" ON public.project_documents
  FOR SELECT TO authenticated USING (true);

-- Foremen/PMs/managers/admins can upload documents
CREATE POLICY "project_docs_insert" ON public.project_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_role(ARRAY['foreman','pm','manager','admin']));

-- Managers/admins can update document metadata
CREATE POLICY "project_docs_update" ON public.project_documents
  FOR UPDATE TO authenticated
  USING (public.user_has_role(ARRAY['manager','admin']));

-- Managers/admins can delete documents
CREATE POLICY "project_docs_delete" ON public.project_documents
  FOR DELETE TO authenticated
  USING (public.user_has_role(ARRAY['manager','admin']));

-- ============================================================
-- 6. REPORTS — all 7 report types in one table
-- ============================================================
CREATE TABLE public.reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_number     text UNIQUE NOT NULL,
  report_type       text NOT NULL
                    CHECK (report_type IN ('service-call','startup','site-survey','pm-checklist','work-order','change-order','rfi')),
  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','submitted','reviewed','approved','rejected','closed')),
  report_date       date NOT NULL DEFAULT CURRENT_DATE,
  customer_id       uuid REFERENCES public.customers(id),
  equipment_id      uuid REFERENCES public.equipment(id),
  project_id        uuid REFERENCES public.projects(id),
  tech_id           uuid REFERENCES public.profiles(id),
  -- Denormalized for fast list queries (no joins needed)
  customer_name     text DEFAULT '',
  tech_name         text DEFAULT '',
  equipment_summary text DEFAULT '',
  -- All type-specific form fields stored as JSON
  form_data         jsonb NOT NULL DEFAULT '{}',
  -- Workflow timestamps
  submitted_at      timestamptz,
  reviewed_by       uuid REFERENCES public.profiles(id),
  reviewed_at       timestamptz,
  -- PDF link from Google Drive
  pdf_drive_url     text DEFAULT '',
  pdf_drive_id      text DEFAULT '',
  -- Standard timestamps
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_type ON public.reports(report_type);
CREATE INDEX idx_reports_status ON public.reports(status);
CREATE INDEX idx_reports_tech ON public.reports(tech_id);
CREATE INDEX idx_reports_customer ON public.reports(customer_id);
CREATE INDEX idx_reports_project ON public.reports(project_id);
CREATE INDEX idx_reports_date ON public.reports(report_date DESC);
CREATE INDEX idx_reports_form_data ON public.reports USING GIN (form_data);
-- Fast draft lookup per tech
CREATE INDEX idx_reports_drafts ON public.reports(tech_id, status) WHERE status = 'draft';

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Techs can see their own reports
CREATE POLICY "reports_select_own" ON public.reports
  FOR SELECT TO authenticated
  USING (tech_id = auth.uid());

-- Foremen/PMs/managers/admins can see all reports
CREATE POLICY "reports_select_managers" ON public.reports
  FOR SELECT TO authenticated
  USING (public.user_has_role(ARRAY['foreman','pm','manager','admin']));

-- All authenticated can create reports
CREATE POLICY "reports_insert" ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (tech_id = auth.uid());

-- Techs can update their own drafts only
CREATE POLICY "reports_update_own_drafts" ON public.reports
  FOR UPDATE TO authenticated
  USING (tech_id = auth.uid() AND status = 'draft');

-- Managers/admins can update any report (change status, review, etc.)
CREATE POLICY "reports_update_managers" ON public.reports
  FOR UPDATE TO authenticated
  USING (public.user_has_role(ARRAY['manager','admin']));

-- Admins can delete reports
CREATE POLICY "reports_delete" ON public.reports
  FOR DELETE TO authenticated
  USING (public.user_has_role(ARRAY['admin']));

-- ============================================================
-- 7. RFIs — Requests for Information
-- ============================================================
CREATE TABLE public.rfis (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfi_number      text UNIQUE NOT NULL,
  project_id      uuid REFERENCES public.projects(id),
  subject         text NOT NULL,
  question        text NOT NULL DEFAULT '',
  details         text DEFAULT '',
  sent_to_name    text DEFAULT '',
  sent_to_email   text DEFAULT '',
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','sent','responded','closed')),
  priority        text DEFAULT 'standard'
                  CHECK (priority IN ('urgent','standard','low')),
  due_date        date,
  response        text DEFAULT '',
  responded_by    text DEFAULT '',
  responded_at    timestamptz,
  cost_impact     text DEFAULT '',
  schedule_impact text DEFAULT '',
  created_by      uuid REFERENCES public.profiles(id),
  assigned_to     uuid REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rfis_project ON public.rfis(project_id);
CREATE INDEX idx_rfis_status ON public.rfis(status);
CREATE INDEX idx_rfis_created_by ON public.rfis(created_by);

ALTER TABLE public.rfis ENABLE ROW LEVEL SECURITY;

-- All authenticated can read RFIs
CREATE POLICY "rfis_select" ON public.rfis
  FOR SELECT TO authenticated USING (true);

-- All authenticated can create RFIs (field team needs this)
CREATE POLICY "rfis_insert" ON public.rfis
  FOR INSERT TO authenticated WITH CHECK (true);

-- Creator can update their own draft RFIs
CREATE POLICY "rfis_update_own" ON public.rfis
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND status = 'draft');

-- Managers/admins can update any RFI
CREATE POLICY "rfis_update_managers" ON public.rfis
  FOR UPDATE TO authenticated
  USING (public.user_has_role(ARRAY['pm','manager','admin']));

-- Admins can delete
CREATE POLICY "rfis_delete" ON public.rfis
  FOR DELETE TO authenticated
  USING (public.user_has_role(ARRAY['admin']));

-- ============================================================
-- 8. REPORT PHOTOS — references to Supabase Storage
-- ============================================================
CREATE TABLE public.report_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    uuid REFERENCES public.reports(id) ON DELETE CASCADE,
  rfi_id       uuid REFERENCES public.rfis(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name    text NOT NULL DEFAULT '',
  file_size    integer,
  mime_type    text DEFAULT 'image/jpeg',
  caption      text DEFAULT '',
  sort_order   integer DEFAULT 0,
  uploaded_by  uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- Must belong to either a report or an RFI
  CHECK (report_id IS NOT NULL OR rfi_id IS NOT NULL)
);

CREATE INDEX idx_report_photos_report ON public.report_photos(report_id);
CREATE INDEX idx_report_photos_rfi ON public.report_photos(rfi_id);

ALTER TABLE public.report_photos ENABLE ROW LEVEL SECURITY;

-- All authenticated can read photos
CREATE POLICY "photos_select" ON public.report_photos
  FOR SELECT TO authenticated USING (true);

-- All authenticated can upload photos
CREATE POLICY "photos_insert" ON public.report_photos
  FOR INSERT TO authenticated WITH CHECK (true);

-- Uploader can delete their own photos
CREATE POLICY "photos_delete_own" ON public.report_photos
  FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid());

-- Admins can delete any photo
CREATE POLICY "photos_delete_admin" ON public.report_photos
  FOR DELETE TO authenticated
  USING (public.user_has_role(ARRAY['admin']));

-- ============================================================
-- 9. REPORT SIGNATURES
-- ============================================================
CREATE TABLE public.report_signatures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  signature_type  text NOT NULL
                  CHECK (signature_type IN ('tech','customer','foreman','pm')),
  signer_name     text DEFAULT '',
  signature_data  text NOT NULL,
  signed_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(report_id, signature_type)
);

CREATE INDEX idx_signatures_report ON public.report_signatures(report_id);

ALTER TABLE public.report_signatures ENABLE ROW LEVEL SECURITY;

-- All authenticated can read signatures
CREATE POLICY "signatures_select" ON public.report_signatures
  FOR SELECT TO authenticated USING (true);

-- All authenticated can create signatures
CREATE POLICY "signatures_insert" ON public.report_signatures
  FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- TRIGGERS — auto-update timestamps
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.rfis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Auto-set submitted_at when report status changes to 'submitted'
CREATE OR REPLACE FUNCTION public.handle_report_submit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'draft' AND NEW.status = 'submitted' THEN
    NEW.submitted_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_report_submit BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.handle_report_submit();

-- ============================================================
-- STORAGE BUCKET — for report photos and project documents
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'report-photos',
  'report-photos',
  false,
  10485760,  -- 10MB limit
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-documents',
  'project-documents',
  false,
  52428800,  -- 50MB limit for large drawings/PDFs
  ARRAY['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/msword','application/zip']
);

-- Storage policies: authenticated users can upload to their own folder
CREATE POLICY "upload_own_photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'report-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "read_photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'report-photos');

CREATE POLICY "delete_own_photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'report-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "upload_project_docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-documents');

CREATE POLICY "read_project_docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'project-documents');

CREATE POLICY "delete_project_docs" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'project-documents' AND public.user_has_role(ARRAY['manager','admin']));

-- ============================================================
-- DONE! Your database is ready.
-- ============================================================
