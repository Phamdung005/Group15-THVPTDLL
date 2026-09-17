-- PostgreSQL Initialization Script for Big Data SQL Optimizer

-- Enable pg_stat_statements for query performance tracking
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Set timezone
SET timezone = 'UTC';
