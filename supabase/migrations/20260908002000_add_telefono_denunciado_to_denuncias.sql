-- Migration: 20260908002000_add_telefono_denunciado_to_denuncias.sql
-- Description: Add telefono_denunciado column to public.denuncias table for fake order reports.

ALTER TABLE public.denuncias
ADD COLUMN IF NOT EXISTS telefono_denunciado text;

-- Add index on telefono_denunciado for quick lookup by admins
CREATE INDEX IF NOT EXISTS idx_denuncias_telefono_denunciado ON public.denuncias (telefono_denunciado);
