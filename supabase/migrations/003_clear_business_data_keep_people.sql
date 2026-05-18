-- Clear workflow/business records while keeping local employee/user seed data.

DELETE FROM public.contract_pocs;
DELETE FROM public.locked_subcontractors;
DELETE FROM public.government_warnings;
DELETE FROM public.comments;
DELETE FROM public.subcontractors;
DELETE FROM public.non_submission_reports;
DELETE FROM public.deletion_requests;
DELETE FROM public.notifications;
DELETE FROM public.activity_logs;
DELETE FROM public.bd_submissions;
DELETE FROM public.subk_database;
DELETE FROM public.past_performances;
DELETE FROM public.fresh_awards;
DELETE FROM public.contracts;
DELETE FROM public.opportunities;
