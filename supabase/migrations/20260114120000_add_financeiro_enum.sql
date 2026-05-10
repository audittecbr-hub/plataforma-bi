-- Migration: Add 'Financeiro' to department_enum
-- Date: 2026-01-14
-- Description: Adds missing department value that was causing user creation errors.

ALTER TYPE department_enum ADD VALUE IF NOT EXISTS 'Financeiro';
