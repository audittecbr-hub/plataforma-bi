-- Migration: Add 'allowed_departments' to dashboards table
-- Date: 2026-01-14
-- Description: Enables assigning a dashboard to multiple departments for visibility.

ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS allowed_departments text[] DEFAULT '{}';
