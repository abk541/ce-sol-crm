import { describe, expect, it } from 'vitest'
import type { QueryResult, QueryResultRow } from 'pg'
import { asAuthenticatedUser, type Database, type Queryable } from '../src/db.js'
import { ApiError } from '../src/errors.js'
import { __test, executeOpportunityWorkflow } from '../src/opportunity-workflows.js'

type Handler = (text: string, values: readonly unknown[] | undefined) => QueryResultRow[]

function queryable(handler: Handler, statements: string[] = []): Queryable {
  return {
    async query(text, values) {
      statements.push(text)
      const rows = handler(text, values)
      return {
        rows,
        rowCount: rows.length,
        command: text.trimStart().split(/\s/, 1)[0]?.toUpperCase() ?? '',
        oid: 0,
        fields: [],
      } as QueryResult
    },
  }
}

function permissionRows(...allowed: string[]): QueryResultRow[] {
  return allowed.map((permission) => ({ permission, allowed: true }))
}

const opportunity = {
  id: 'opp-1',
  solicitation_id: 'SOL-1',
  solicitation: 'Example solicitation',
  status: 'ACTIVE',
  set_aside: 'SB',
  type: 'OTJ',
  due_date: '2026-08-01',
  local_time: '10:00',
  timezone: 'ET',
  location: 'Remote',
  bdm: 'Manager',
  bds: 'Lead',
  support_agent: 'Associate',
  contract_amount: 100,
}

const submission = {
  id: 41,
  opportunity_id: 'opp-1',
  solicitation_id: 'SOL-1',
  status: 'SUBMITTED',
  bdm: 'Manager',
  bds: 'Lead',
  support_agent: 'Associate',
  comment: null,
}

describe('opportunity workflow request validation', () => {
  it('uses strict per-action request fields', () => {
    expect(() => __test.parseRequest({
      action: 'submit',
      opportunityId: 'opp-1',
      values: { contractAmount: 10, status: 'WON' },
    })).toThrowError(ApiError)
    expect(() => __test.parseRequest({ action: 'transition', submissionId: 1, status: 'deleted' }))
      .toThrowError(/not supported/)
    expect(() => __test.parseRequest({
      action: 'submit', opportunityId: 'opp-1', values: {},
    })).toThrowError(/expectedOpportunityStatus/)
    expect(() => __test.parseRequest({
      action: 'delete', submissionId: 1,
    })).toThrowError(/expectedSubmissionStatus/)
    expect(() => __test.parseRequest({
      action: 'return', submissionId: 1, targetOpportunityStatus: 'ACTIVE',
    })).toThrowError(/expectedOpportunityStatus/)
  })

  it('recognizes only the finite generated cancellation comments', () => {
    expect(__test.generatedCancellationComment(' Canceled ')).toBe(true)
    expect(__test.generatedCancellationComment('Cancelled from contract opportunities')).toBe(true)
    expect(__test.generatedCancellationComment('Canceled because the client withdrew')).toBe(false)
  })
})

describe('atomic opportunity workflows', () => {
  it('submits by locking/updating the opportunity before reconciling and creating a tracker row', async () => {
    const statements: string[] = []
    const client = queryable((text, values) => {
      if (text.includes('private.has_permission')) return permissionRows('opportunity:submitProposal')
      if (text.includes('from public.opportunities') && text.includes('for update')) return [opportunity]
      if (text.startsWith('update public.opportunities')) {
        expect(values).toContain('SUBMITTED')
        return [{ ...opportunity, status: 'SUBMITTED', submitted_at: '2026-07-21T12:00:00.000Z' }]
      }
      if (text.includes('where opportunity_id = $1 for update')) return []
      if (text.includes('opportunity_id is null')) {
        expect(text).toContain('lower(btrim(solicitation_id)) = lower(btrim($1))')
        return []
      }
      if (text.startsWith('insert into public.bd_submissions')) {
        expect(text).not.toMatch(/\("?id"?[,)]/)
        return [{ ...submission, status: 'SUBMITTED' }]
      }
      throw new Error(`Unexpected query: ${text}`)
    }, statements)

    await expect(executeOpportunityWorkflow(client, {
      action: 'submit',
      opportunityId: 'opp-1',
      expectedOpportunityStatus: 'ACTIVE',
      values: { contractAmount: 250, proposals: ['proposal.pdf'] },
    }, new Date('2026-07-21T12:00:00.000Z'))).resolves.toMatchObject({
      opportunity: { id: 'opp-1', status: 'SUBMITTED' },
      submission: { opportunity_id: 'opp-1', status: 'SUBMITTED' },
    })

    const opportunityLock = statements.findIndex((text) => text.includes('from public.opportunities') && text.includes('for update'))
    const trackerLock = statements.findIndex((text) => text.includes('from public.bd_submissions') && text.includes('for update'))
    expect(opportunityLock).toBeGreaterThan(-1)
    expect(trackerLock).toBeGreaterThan(opportunityLock)
  })

  it('atomically clears a pending non-submission report when an associate submits late', async () => {
    const statements: string[] = []
    const lateOpportunity = { ...opportunity, non_submission_report_id: 'report-1' }
    const client = queryable((text) => {
      if (text.includes('private.has_permission')) return permissionRows('opportunity:submitProposal')
      if (text.includes('from public.opportunities') && text.includes('for update')) return [lateOpportunity]
      if (text.includes('where opportunity_id = $1 for update')) return []
      if (text.includes('opportunity_id is null')) return []
      if (text.startsWith('select id, status from public.non_submission_reports')) {
        return [{ id: 'report-1', status: 'PENDING' }]
      }
      if (text.startsWith('update public.opportunities')) {
        expect(text).toContain('non_submission_report_id = null')
        return [{ ...lateOpportunity, status: 'SUBMITTED', non_submission_report_id: null }]
      }
      if (text.startsWith('insert into public.bd_submissions')) return [submission]
      if (text.startsWith('delete from public.non_submission_reports')) return [{ id: 'report-1' }]
      throw new Error(`Unexpected query: ${text}`)
    }, statements)

    await expect(executeOpportunityWorkflow(client, {
      action: 'submit',
      opportunityId: 'opp-1',
      expectedOpportunityStatus: 'ACTIVE',
      values: {},
    }, new Date())).resolves.toMatchObject({
      opportunity: { status: 'SUBMITTED', non_submission_report_id: null },
      submission: { status: 'SUBMITTED' },
    })
    expect(statements.findIndex((text) => text.startsWith('delete from public.non_submission_reports')))
      .toBeGreaterThan(statements.findIndex((text) => text.startsWith('insert into public.bd_submissions')))
  })

  it('preserves a reviewed non-submission report as history when a proposal is submitted', async () => {
    const statements: string[] = []
    const lateOpportunity = { ...opportunity, non_submission_report_id: 'report-1' }
    const client = queryable((text) => {
      if (text.includes('private.has_permission')) return permissionRows('opportunity:submitProposal')
      if (text.includes('from public.opportunities') && text.includes('for update')) return [lateOpportunity]
      if (text.includes('where opportunity_id = $1 for update')) return []
      if (text.includes('opportunity_id is null')) return []
      if (text.startsWith('select id, status from public.non_submission_reports')) {
        return [{ id: 'report-1', status: 'APPROVED' }]
      }
      if (text.startsWith('update public.opportunities')) {
        expect(text).toContain('non_submission_report_id = null')
        return [{ ...lateOpportunity, status: 'SUBMITTED', non_submission_report_id: null }]
      }
      if (text.startsWith('insert into public.bd_submissions')) return [submission]
      throw new Error(`Unexpected query: ${text}`)
    }, statements)

    await expect(executeOpportunityWorkflow(client, {
      action: 'submit',
      opportunityId: 'opp-1',
      expectedOpportunityStatus: 'ACTIVE',
      values: {},
    }, new Date())).resolves.toMatchObject({
      opportunity: { status: 'SUBMITTED', non_submission_report_id: null },
      submission: { status: 'SUBMITTED' },
    })
    expect(statements.some((text) => text.startsWith('delete from public.non_submission_reports'))).toBe(false)
  })

  it('derives tracker manager, lead, and associate from assigned_to', async () => {
    const assignedOpportunity = {
      ...opportunity,
      assigned_to: 'associate-1',
      bdm: '',
      bds: '',
      support_agent: null,
    }
    const client = queryable((text, values) => {
      if (text.includes('private.has_permission')) return permissionRows('opportunity:submitProposal')
      if (text.includes('from public.opportunities') && text.includes('for update')) return [assignedOpportunity]
      if (text.includes('where opportunity_id = $1 for update')) return []
      if (text.includes('opportunity_id is null')) return []
      if (text.startsWith('update public.opportunities')) return [{ ...assignedOpportunity, status: 'SUBMITTED' }]
      if (text.includes('from public.employees assigned')) {
        return [{
          assigned_role: 'ASSOCIATE',
          assigned_name: 'Alex Associate',
          parent_role: 'TEAM_LEAD',
          parent_name: 'Taylor Lead',
          grandparent_role: 'BD_MANAGER',
          grandparent_name: 'Morgan Manager',
        }]
      }
      if (text.startsWith('insert into public.bd_submissions')) {
        expect(values).toEqual(expect.arrayContaining([
          'Morgan Manager', 'Taylor Lead', 'Alex Associate',
        ]))
        return [{
          ...submission,
          bdm: 'Morgan Manager',
          bds: 'Taylor Lead',
          support_agent: 'Alex Associate',
        }]
      }
      throw new Error(`Unexpected query: ${text}`)
    })

    await expect(executeOpportunityWorkflow(client, {
      action: 'submit', opportunityId: 'opp-1', expectedOpportunityStatus: 'ACTIVE', values: {},
    }, new Date())).resolves.toMatchObject({
      submission: {
        bdm: 'Morgan Manager',
        bds: 'Taylor Lead',
        support_agent: 'Alex Associate',
      },
    })
  })

  it('rejects ambiguous legacy tracker matches without writing either record', async () => {
    const statements: string[] = []
    const client = queryable((text) => {
      if (text.includes('private.has_permission')) return permissionRows('opportunity:submitProposal')
      if (text.includes('from public.opportunities') && text.includes('for update')) return [opportunity]
      if (text.includes('where opportunity_id = $1 for update')) return []
      if (text.includes('opportunity_id is null')) return [{ id: 1 }, { id: 2 }]
      throw new Error(`Unexpected query: ${text}`)
    }, statements)

    await expect(executeOpportunityWorkflow(client, {
      action: 'submit', opportunityId: 'opp-1', expectedOpportunityStatus: 'ACTIVE',
      expectedSubmissionStatus: 'SUBMITTED', values: {},
    }, new Date())).rejects.toMatchObject({ statusCode: 409, code: 'ambiguous_submission' })
    expect(statements.some((text) => text.startsWith('insert into public.bd_submissions'))).toBe(false)
  })

  it('does not let duplicate opportunities claim an unlinked legacy tracker', async () => {
    const statements: string[] = []
    const client = queryable((text) => {
      if (text.includes('private.has_permission')) return permissionRows('opportunity:submitProposal')
      if (text.includes('from public.opportunities') && text.includes('for update')) return [opportunity]
      if (text.includes('where opportunity_id = $1 for update')) return []
      if (text.includes('opportunity_id is null')) return [{ ...submission, opportunity_id: null }]
      if (text.includes('select id::text as id')) return [{ id: 'opp-1' }, { id: 'opp-2' }]
      throw new Error(`Unexpected query: ${text}`)
    }, statements)

    await expect(executeOpportunityWorkflow(client, {
      action: 'submit', opportunityId: 'opp-1', expectedOpportunityStatus: 'ACTIVE', values: {},
    }, new Date())).rejects.toMatchObject({ statusCode: 409, code: 'ambiguous_submission' })
    expect(statements.some((text) => text.startsWith('update public.bd_submissions'))).toBe(false)
    expect(statements.some((text) => text.startsWith('update public.opportunities'))).toBe(false)
  })

  it('reconciles an unlinked tracker only when the opportunity match is unique', async () => {
    const client = queryable((text) => {
      if (text.includes('private.has_permission')) return permissionRows('opportunity:submitProposal')
      if (text.includes('from public.opportunities') && text.includes('for update')) return [opportunity]
      if (text.includes('where opportunity_id = $1 for update')) return []
      if (text.includes('opportunity_id is null') && text.startsWith('select')) {
        return [{ ...submission, opportunity_id: null }]
      }
      if (text.includes('select id::text as id')) return [{ id: 'opp-1' }]
      if (text.startsWith('update public.bd_submissions set opportunity_id')) return [submission]
      if (text.startsWith('update public.opportunities')) return [{ ...opportunity, status: 'SUBMITTED' }]
      if (text.startsWith('update public.bd_submissions')) return [{ ...submission, status: 'SUBMITTED' }]
      throw new Error(`Unexpected query: ${text}`)
    })

    await expect(executeOpportunityWorkflow(client, {
      action: 'submit', opportunityId: 'opp-1', expectedOpportunityStatus: 'ACTIVE',
      expectedSubmissionStatus: 'SUBMITTED', values: {},
    }, new Date())).resolves.toMatchObject({
      opportunity: { id: 'opp-1', status: 'SUBMITTED' },
      submission: { id: 41, opportunity_id: 'opp-1', status: 'SUBMITTED' },
    })
  })

  it('does not recreate a missing tracker when an expected tracker status proves the request is stale', async () => {
    const client = queryable((text) => {
      if (text.includes('private.has_permission')) return permissionRows('opportunity:submitProposal')
      if (text.includes('from public.opportunities') && text.includes('for update')) return [opportunity]
      if (text.startsWith('update public.opportunities')) return [{ ...opportunity, status: 'SUBMITTED' }]
      if (text.includes('where opportunity_id = $1 for update')) return []
      if (text.includes('opportunity_id is null')) return []
      throw new Error(`Unexpected query: ${text}`)
    })
    await expect(executeOpportunityWorkflow(client, {
      action: 'submit',
      opportunityId: 'opp-1',
      expectedOpportunityStatus: 'ACTIVE',
      expectedSubmissionStatus: 'DISCUSSING',
      values: {},
    }, new Date())).rejects.toMatchObject({ statusCode: 409, code: 'stale_workflow' })
  })

  it('does not let submit bypass the permissions required to restore a canceled tracker', async () => {
    const makeClient = (allowed: string[]) => queryable((text) => {
      if (text.includes('private.has_permission')) return permissionRows(...allowed)
      if (text.includes('from public.opportunities') && text.includes('for update')) {
        return [{ ...opportunity, status: 'CANCELED' }]
      }
      if (text.includes('where opportunity_id = $1 for update')) {
        return [{ ...submission, status: 'CANCELED', comment: 'User reason' }]
      }
      if (text.startsWith('update public.opportunities')) return [{ ...opportunity, status: 'SUBMITTED' }]
      if (text.startsWith('update public.bd_submissions')) return [{ ...submission, status: 'SUBMITTED', comment: 'User reason' }]
      throw new Error(`Unexpected query: ${text}`)
    })
    await expect(executeOpportunityWorkflow(makeClient(['opportunity:submitProposal']), {
      action: 'submit', opportunityId: 'opp-1', expectedOpportunityStatus: 'CANCELED',
      expectedSubmissionStatus: 'CANCELED', values: {},
    }, new Date())).rejects.toMatchObject({ statusCode: 403 })
    await expect(executeOpportunityWorkflow(makeClient(['opportunity:submitProposal', 'opportunity:cancel']), {
      action: 'submit', opportunityId: 'opp-1', expectedOpportunityStatus: 'CANCELED',
      expectedSubmissionStatus: 'CANCELED', values: {},
    }, new Date())).resolves.toMatchObject({ submission: { comment: 'User reason' } })
  })

  it('clears only a generated cancellation marker when resubmitting', async () => {
    const client = queryable((text, values) => {
      if (text.includes('private.has_permission')) {
        return permissionRows('opportunity:submitProposal', 'opportunity:cancel')
      }
      if (text.includes('from public.opportunities') && text.includes('for update')) {
        return [{ ...opportunity, status: 'CANCELED' }]
      }
      if (text.includes('where opportunity_id = $1 for update')) {
        return [{ ...submission, status: 'CANCELED', comment: 'Canceled' }]
      }
      if (text.startsWith('update public.opportunities')) return [{ ...opportunity, status: 'SUBMITTED' }]
      if (text.startsWith('update public.bd_submissions')) {
        expect(values).toContain(null)
        return [{ ...submission, status: 'SUBMITTED', comment: null }]
      }
      throw new Error(`Unexpected query: ${text}`)
    })

    await expect(executeOpportunityWorkflow(client, {
      action: 'submit',
      opportunityId: 'opp-1',
      expectedOpportunityStatus: 'CANCELED',
      expectedSubmissionStatus: 'CANCELED',
      values: {},
    }, new Date())).resolves.toMatchObject({ submission: { comment: null } })
  })

  it('requires cancellation permission and clears only a generated comment when leaving canceled', async () => {
    const makeClient = (allowed: string[], statements: string[] = []) => queryable((text) => {
      if (text.includes('private.has_permission')) return permissionRows(...allowed)
      if (text.startsWith('select id, opportunity_id')) return [{ id: 41, opportunity_id: 'opp-1' }]
      if (text.includes('from public.opportunities') && text.includes('for update')) {
        return [{ ...opportunity, status: 'CANCELED' }]
      }
      if (text.includes('from public.bd_submissions') && text.includes('for update')) {
        return [{ ...submission, status: 'CANCELED', comment: 'Canceled' }]
      }
      if (text.startsWith('update public.opportunities')) return [{ ...opportunity, status: 'SUBMITTED' }]
      if (text.startsWith('update public.bd_submissions')) return [{ ...submission, status: 'SUBMITTED', comment: null }]
      throw new Error(`Unexpected query: ${text}`)
    }, statements)

    await expect(executeOpportunityWorkflow(makeClient(['opportunity:submitProposal']), {
      action: 'transition', submissionId: 41, status: 'SUBMITTED',
      expectedOpportunityStatus: 'CANCELED', expectedSubmissionStatus: 'CANCELED',
    }, new Date())).rejects.toMatchObject({ statusCode: 403 })

    const statements: string[] = []
    await expect(executeOpportunityWorkflow(makeClient(['opportunity:cancel'], statements), {
      action: 'transition', submissionId: 41, status: 'SUBMITTED',
      expectedOpportunityStatus: 'CANCELED', expectedSubmissionStatus: 'CANCELED',
    }, new Date())).resolves.toMatchObject({ submission: { status: 'SUBMITTED', comment: null } })
    expect(statements.every((text) => !/\bdelete\b/i.test(text))).toBe(true)
  })

  it('atomically clears a pending report during a generic tracker transition', async () => {
    const statements: string[] = []
    const linkedOpportunity = { ...opportunity, non_submission_report_id: 'report-1' }
    const client = queryable((text) => {
      if (text.includes('private.has_permission')) return permissionRows('opportunity:cancel')
      if (text.startsWith('select id, opportunity_id')) return [{ id: 41, opportunity_id: 'opp-1' }]
      if (text.includes('from public.opportunities') && text.includes('for update')) return [linkedOpportunity]
      if (text.includes('from public.bd_submissions') && text.includes('for update')) return [submission]
      if (text.startsWith('select id, status from public.non_submission_reports')) {
        return [{ id: 'report-1', status: 'PENDING' }]
      }
      if (text.startsWith('update public.opportunities')) {
        expect(text).toContain('non_submission_report_id = null')
        return [{ ...linkedOpportunity, status: 'CANCELED', non_submission_report_id: null }]
      }
      if (text.startsWith('update public.bd_submissions')) {
        return [{ ...submission, status: 'CANCELED', comment: null }]
      }
      if (text.startsWith('delete from public.non_submission_reports')) return [{ id: 'report-1' }]
      throw new Error(`Unexpected query: ${text}`)
    }, statements)

    await expect(executeOpportunityWorkflow(client, {
      action: 'transition',
      submissionId: 41,
      status: 'CANCELED',
      expectedOpportunityStatus: 'ACTIVE',
      expectedSubmissionStatus: 'SUBMITTED',
    }, new Date())).resolves.toMatchObject({
      opportunity: { status: 'CANCELED', non_submission_report_id: null },
      submission: { status: 'CANCELED' },
    })
    expect(statements.findIndex((text) => text.startsWith('delete from public.non_submission_reports')))
      .toBeGreaterThan(statements.findIndex((text) => text.startsWith('update public.bd_submissions')))
  })

  it('preserves a reviewed report during a generic tracker transition', async () => {
    const statements: string[] = []
    const linkedOpportunity = { ...opportunity, non_submission_report_id: 'report-1' }
    const client = queryable((text) => {
      if (text.includes('private.has_permission')) return permissionRows('opportunity:cancel')
      if (text.startsWith('select id, opportunity_id')) return [{ id: 41, opportunity_id: 'opp-1' }]
      if (text.includes('from public.opportunities') && text.includes('for update')) return [linkedOpportunity]
      if (text.includes('from public.bd_submissions') && text.includes('for update')) return [submission]
      if (text.startsWith('select id, status from public.non_submission_reports')) {
        return [{ id: 'report-1', status: 'APPROVED' }]
      }
      if (text.startsWith('update public.opportunities')) {
        expect(text).not.toContain('non_submission_report_id = null')
        return [{ ...linkedOpportunity, status: 'CANCELED' }]
      }
      if (text.startsWith('update public.bd_submissions')) {
        return [{ ...submission, status: 'CANCELED', comment: null }]
      }
      throw new Error(`Unexpected query: ${text}`)
    }, statements)

    await expect(executeOpportunityWorkflow(client, {
      action: 'transition',
      submissionId: 41,
      status: 'CANCELED',
      expectedOpportunityStatus: 'ACTIVE',
      expectedSubmissionStatus: 'SUBMITTED',
    }, new Date())).resolves.toMatchObject({
      opportunity: { status: 'CANCELED', non_submission_report_id: 'report-1' },
      submission: { status: 'CANCELED' },
    })
    expect(statements.some((text) => text.startsWith('delete from public.non_submission_reports'))).toBe(false)
  })

  it('preserves a user cancellation reason when leaving canceled', async () => {
    const client = queryable((text) => {
      if (text.includes('private.has_permission')) return permissionRows('opportunity:cancel')
      if (text.startsWith('select id, opportunity_id')) return [{ id: 41, opportunity_id: 'opp-1' }]
      if (text.includes('from public.opportunities') && text.includes('for update')) {
        return [{ ...opportunity, status: 'CANCELED' }]
      }
      if (text.includes('from public.bd_submissions') && text.includes('for update')) {
        return [{ ...submission, status: 'CANCELED', comment: 'Canceled because the client withdrew' }]
      }
      if (text.startsWith('update public.opportunities')) return [{ ...opportunity, status: 'SUBMITTED' }]
      if (text.startsWith('update public.bd_submissions')) {
        return [{ ...submission, status: 'SUBMITTED', comment: 'Canceled because the client withdrew' }]
      }
      throw new Error(`Unexpected query: ${text}`)
    })
    await expect(executeOpportunityWorkflow(client, {
      action: 'transition', submissionId: 41, status: 'SUBMITTED',
      expectedOpportunityStatus: 'CANCELED', expectedSubmissionStatus: 'CANCELED',
    }, new Date())).resolves.toMatchObject({
      submission: { comment: 'Canceled because the client withdrew' },
    })
  })

  it('does not bypass cancel permission when only the opportunity is canceled', async () => {
    const client = queryable((text) => {
      if (text.includes('private.has_permission')) return permissionRows('opportunity:submitProposal')
      if (text.startsWith('select id, opportunity_id')) return [{ id: 41, opportunity_id: 'opp-1' }]
      if (text.includes('from public.opportunities') && text.includes('for update')) {
        return [{ ...opportunity, status: 'CANCELED' }]
      }
      if (text.includes('from public.bd_submissions') && text.includes('for update')) {
        return [{ ...submission, status: 'SUBMITTED' }]
      }
      throw new Error(`Unexpected query: ${text}`)
    })
    await expect(executeOpportunityWorkflow(client, {
      action: 'transition', submissionId: 41, status: 'DISCUSSING',
      expectedOpportunityStatus: 'CANCELED', expectedSubmissionStatus: 'SUBMITTED',
    }, new Date())).rejects.toMatchObject({ statusCode: 403 })
  })

  it('requires non-submission review permission when leaving NOT_SUBMITTED or DROPPED', async () => {
    const makeClient = (allowed: string[]) => queryable((text) => {
      if (text.includes('private.has_permission')) return permissionRows(...allowed)
      if (text.startsWith('select id, opportunity_id')) return [{ id: 41, opportunity_id: null }]
      if (text.includes('from public.bd_submissions') && text.includes('for update')) {
        return [{ ...submission, opportunity_id: null, status: 'NOT_SUBMITTED' }]
      }
      if (text.startsWith('update public.bd_submissions')) return [{ ...submission, status: 'SUBMITTED' }]
      throw new Error(`Unexpected query: ${text}`)
    })
    await expect(executeOpportunityWorkflow(makeClient(['opportunity:submitProposal']), {
      action: 'transition', submissionId: 41, status: 'SUBMITTED',
      expectedSubmissionStatus: 'NOT_SUBMITTED',
    }, new Date())).rejects.toMatchObject({ statusCode: 403 })
    await expect(executeOpportunityWorkflow(makeClient(['nonSubmission:review']), {
      action: 'transition', submissionId: 41, status: 'SUBMITTED',
      expectedSubmissionStatus: 'NOT_SUBMITTED',
    }, new Date())).resolves.toMatchObject({ submission: { status: 'SUBMITTED' } })
  })

  it('requires non-submission review permission for NOT_SUBMITTED and rejects stale status', async () => {
    const client = queryable((text) => {
      if (text.includes('private.has_permission')) return permissionRows('nonSubmission:review')
      if (text.startsWith('select id, opportunity_id')) return [{ id: 41, opportunity_id: null }]
      if (text.includes('from public.bd_submissions') && text.includes('for update')) return [submission]
      throw new Error(`Unexpected query: ${text}`)
    })
    await expect(executeOpportunityWorkflow(client, {
      action: 'transition', submissionId: 41, status: 'NOT_SUBMITTED',
      expectedSubmissionStatus: 'DISCUSSING',
    }, new Date())).rejects.toMatchObject({ statusCode: 409, code: 'stale_workflow' })
  })

  it('repairs an orphan tracker assignment with edit and assignment permissions', async () => {
    const statements: string[] = []
    const client = queryable((text, values) => {
      if (text.includes('private.has_permission')) return permissionRows('opportunity:edit', 'opportunity:assign')
      if (text.startsWith('select id, opportunity_id')) return [{ id: 41, opportunity_id: null }]
      if (text.includes('from public.bd_submissions') && text.includes('for update')) return [{ ...submission, opportunity_id: null }]
      if (text.startsWith('update public.bd_submissions')) {
        expect(values).toContain('New associate')
        return [{ ...submission, opportunity_id: null, support_agent: 'New associate' }]
      }
      throw new Error(`Unexpected query: ${text}`)
    }, statements)
    await expect(executeOpportunityWorkflow(client, {
      action: 'edit', submissionId: 41, expectedSubmissionStatus: 'SUBMITTED',
      values: { supportAgent: 'New associate' },
    }, new Date())).resolves.toMatchObject({
      opportunity: null,
      submission: { support_agent: 'New associate' },
    })
    expect(statements.some((text) => text.includes('public.opportunities'))).toBe(false)
  })

  it('requires assign in addition to edit and atomically mirrors linked opportunity edits to tracker', async () => {
    const denied = queryable((text) => {
      if (text.includes('private.has_permission')) return permissionRows('opportunity:edit')
      throw new Error(`Unexpected query: ${text}`)
    })
    await expect(executeOpportunityWorkflow(denied, {
      action: 'edit', submissionId: 41, expectedSubmissionStatus: 'SUBMITTED',
      values: {}, opportunityValues: { assignedTo: 'employee-2' },
    }, new Date())).rejects.toMatchObject({ statusCode: 403 })

    const client = queryable((text, values) => {
      if (text.includes('private.has_permission')) return permissionRows('opportunity:edit', 'opportunity:assign')
      if (text.startsWith('select id, opportunity_id')) return [{ id: 41, opportunity_id: 'opp-1' }]
      if (text.includes('from public.opportunities') && text.includes('for update')) return [opportunity]
      if (text.includes('from public.bd_submissions') && text.includes('for update')) return [submission]
      if (text.startsWith('update public.opportunities')) {
        expect(values).toContain('New manager')
        return [{ ...opportunity, bdm: 'New manager', assigned_to: 'employee-2' }]
      }
      if (text.includes('from public.employees assigned')) return []
      if (text.startsWith('update public.bd_submissions')) return [{ ...submission, bdm: 'New manager' }]
      throw new Error(`Unexpected query: ${text}`)
    })
    await expect(executeOpportunityWorkflow(client, {
      action: 'edit',
      submissionId: 41,
      expectedOpportunityStatus: 'ACTIVE',
      expectedSubmissionStatus: 'SUBMITTED',
      values: { comment: 'Reviewed' },
      opportunityValues: { assignedTo: 'employee-2', bdm: 'New manager' },
    }, new Date())).resolves.toMatchObject({
      opportunity: { assigned_to: 'employee-2', bdm: 'New manager' },
      submission: { bdm: 'New manager' },
    })
  })

  it('requires delete approval before reading or deleting a submitted opportunity', async () => {
    const statements: string[] = []
    const client = queryable((text) => {
      if (text.includes('private.has_permission')) return permissionRows('opportunity:edit')
      throw new Error(`Unexpected query: ${text}`)
    }, statements)

    await expect(executeOpportunityWorkflow(client, {
      action: 'delete',
      submissionId: 41,
      expectedOpportunityStatus: 'ACTIVE',
      expectedSubmissionStatus: 'SUBMITTED',
    }, new Date())).rejects.toMatchObject({ statusCode: 403, code: 'forbidden' })
    expect(statements.some((text) => text.includes('from public.opportunities'))).toBe(false)
    expect(statements.some((text) => /delete from public\./.test(text))).toBe(false)
  })

  it('hard-deletes the tracker before its linked opportunity', async () => {
    const statements: string[] = []
    const client = queryable((text) => {
      if (text.includes('private.has_permission')) return permissionRows('opportunity:deleteApprove')
      if (text.startsWith('select id, opportunity_id')) return [{ id: 41, opportunity_id: 'opp-1' }]
      if (text.includes('from public.opportunities') && text.includes('for update')) return [opportunity]
      if (text.includes('from public.bd_submissions') && text.includes('for update')) return [submission]
      if (text.startsWith('delete from public.bd_submissions')) return [submission]
      if (text.startsWith('delete from public.opportunities')) return [opportunity]
      throw new Error(`Unexpected query: ${text}`)
    }, statements)

    await expect(executeOpportunityWorkflow(client, {
      action: 'delete',
      submissionId: 41,
      expectedOpportunityStatus: 'ACTIVE',
      expectedSubmissionStatus: 'SUBMITTED',
    }, new Date())).resolves.toMatchObject({
      opportunity: { id: 'opp-1' },
      submission: { id: 41 },
    })
    const trackerDelete = statements.findIndex((text) => text.startsWith('delete from public.bd_submissions'))
    const opportunityDelete = statements.findIndex((text) => text.startsWith('delete from public.opportunities'))
    expect(trackerDelete).toBeGreaterThan(-1)
    expect(opportunityDelete).toBeGreaterThan(trackerDelete)
  })

  it('rejects a stale hard delete without deleting either record', async () => {
    const statements: string[] = []
    const client = queryable((text) => {
      if (text.includes('private.has_permission')) return permissionRows('opportunity:deleteApprove')
      if (text.startsWith('select id, opportunity_id')) return [{ id: 41, opportunity_id: 'opp-1' }]
      if (text.includes('from public.opportunities') && text.includes('for update')) return [opportunity]
      if (text.includes('from public.bd_submissions') && text.includes('for update')) return [submission]
      throw new Error(`Unexpected query: ${text}`)
    }, statements)

    await expect(executeOpportunityWorkflow(client, {
      action: 'delete',
      submissionId: 41,
      expectedOpportunityStatus: 'ACTIVE',
      expectedSubmissionStatus: 'DISCUSSING',
    }, new Date())).rejects.toMatchObject({ statusCode: 409, code: 'stale_workflow' })
    expect(statements.some((text) => /delete from public\./.test(text))).toBe(false)
  })

  it('allows an approved orphan tracker cleanup without touching opportunities', async () => {
    const statements: string[] = []
    const orphan = { ...submission, opportunity_id: null }
    const client = queryable((text) => {
      if (text.includes('private.has_permission')) return permissionRows('opportunity:deleteApprove')
      if (text.startsWith('select id, opportunity_id')) return [{ id: 41, opportunity_id: null }]
      if (text.includes('from public.bd_submissions') && text.includes('for update')) return [orphan]
      if (text.startsWith('delete from public.bd_submissions')) return [orphan]
      throw new Error(`Unexpected query: ${text}`)
    }, statements)

    await expect(executeOpportunityWorkflow(client, {
      action: 'delete',
      submissionId: 41,
      expectedSubmissionStatus: 'SUBMITTED',
    }, new Date())).resolves.toMatchObject({
      opportunity: null,
      submission: { id: 41, opportunity_id: null },
    })
    expect(statements.some((text) => text.includes('public.opportunities'))).toBe(false)
  })

  it('returns a tracker to NEW_ASSIGNMENT only after deleting the child row', async () => {
    const statements: string[] = []
    const client = queryable((text, values) => {
      if (text.includes('private.has_permission')) return permissionRows('opportunity:edit')
      if (text.startsWith('select id, opportunity_id')) return [{ id: 41, opportunity_id: 'opp-1' }]
      if (text.includes('from public.opportunities') && text.includes('for update')) {
        return [{ ...opportunity, status: 'SUBMITTED' }]
      }
      if (text.includes('from public.bd_submissions') && text.includes('for update')) return [submission]
      if (text.startsWith('delete from public.bd_submissions')) return [submission]
      if (text.startsWith('update public.opportunities')) {
        expect(values).toEqual(['NEW_ASSIGNMENT', 'opp-1'])
        return [{ ...opportunity, status: 'NEW_ASSIGNMENT', submitted_at: null }]
      }
      throw new Error(`Unexpected query: ${text}`)
    }, statements)

    await expect(executeOpportunityWorkflow(client, {
      action: 'return',
      submissionId: 41,
      targetOpportunityStatus: 'NEW_ASSIGNMENT',
      expectedOpportunityStatus: 'SUBMITTED',
      expectedSubmissionStatus: 'SUBMITTED',
    }, new Date())).resolves.toMatchObject({
      opportunity: { id: 'opp-1', status: 'NEW_ASSIGNMENT', submitted_at: null },
      submission: { id: 41 },
    })
    const trackerDelete = statements.findIndex((text) => text.startsWith('delete from public.bd_submissions'))
    const opportunityUpdate = statements.findIndex((text) => text.startsWith('update public.opportunities'))
    expect(opportunityUpdate).toBeGreaterThan(trackerDelete)
  })

  it('rejects returning an orphan tracker without deleting it', async () => {
    const statements: string[] = []
    const client = queryable((text) => {
      if (text.includes('private.has_permission')) return permissionRows('opportunity:edit')
      if (text.startsWith('select id, opportunity_id')) return [{ id: 41, opportunity_id: null }]
      if (text.includes('from public.bd_submissions') && text.includes('for update')) {
        return [{ ...submission, opportunity_id: null }]
      }
      throw new Error(`Unexpected query: ${text}`)
    }, statements)

    await expect(executeOpportunityWorkflow(client, {
      action: 'return',
      submissionId: 41,
      targetOpportunityStatus: 'ACTIVE',
      expectedOpportunityStatus: 'ACTIVE',
      expectedSubmissionStatus: 'SUBMITTED',
    }, new Date())).rejects.toMatchObject({ statusCode: 409, code: 'orphan_submission' })
    expect(statements.some((text) => /delete from public\./.test(text))).toBe(false)
  })

  it('reviews a non-submission report after updating both linked workflow records', async () => {
    const statements: string[] = []
    const reviewedAt = new Date('2026-07-21T15:30:00.000Z')
    const client = queryable((text, values) => {
      if (text.includes('private.has_permission')) return permissionRows('nonSubmission:review')
      if (text.startsWith('select id, opportunity_id')) return [{ id: 41, opportunity_id: 'opp-1' }]
      if (text.includes('from public.opportunities') && text.includes('for update')) return [opportunity]
      if (text.includes('from public.bd_submissions') && text.includes('for update')) return [submission]
      if (text.startsWith('select id from public.non_submission_reports')) return [{ id: 'report-1' }]
      if (text.startsWith('update public.opportunities')) {
        return [{ ...opportunity, status: 'NOT_SUBMITTED' }]
      }
      if (text.startsWith('update public.bd_submissions')) {
        return [{ ...submission, status: 'NOT_SUBMITTED' }]
      }
      if (text.startsWith('update public.non_submission_reports')) {
        expect(values).toEqual([
          'APPROVED', reviewedAt.toISOString(), 'Verified by manager', 'report-1', 'opp-1',
        ])
        return [{ id: 'report-1' }]
      }
      throw new Error(`Unexpected query: ${text}`)
    }, statements)

    await expect(executeOpportunityWorkflow(client, {
      action: 'transition',
      submissionId: 41,
      status: 'NOT_SUBMITTED',
      expectedOpportunityStatus: 'ACTIVE',
      expectedSubmissionStatus: 'SUBMITTED',
      nonSubmissionReportId: 'report-1',
      reviewNote: 'Verified by manager',
    }, reviewedAt)).resolves.toMatchObject({
      opportunity: { status: 'NOT_SUBMITTED' },
      submission: { status: 'NOT_SUBMITTED' },
    })
    const opportunityUpdate = statements.findIndex((text) => text.startsWith('update public.opportunities'))
    const trackerUpdate = statements.findIndex((text) => text.startsWith('update public.bd_submissions'))
    const reportUpdate = statements.findIndex((text) => text.startsWith('update public.non_submission_reports'))
    expect(trackerUpdate).toBeGreaterThan(opportunityUpdate)
    expect(reportUpdate).toBeGreaterThan(trackerUpdate)
  })

  it('returns a reviewed non-submission by clearing the parent link before deleting its report', async () => {
    const statements: string[] = []
    const client = queryable((text, values) => {
      if (text.includes('private.has_permission')) {
        return permissionRows('opportunity:edit', 'nonSubmission:review')
      }
      if (text.startsWith('select id, opportunity_id')) return [{ id: 41, opportunity_id: 'opp-1' }]
      if (text.includes('from public.opportunities') && text.includes('for update')) {
        return [{ ...opportunity, status: 'NOT_SUBMITTED', non_submission_report_id: 'report-1' }]
      }
      if (text.includes('from public.bd_submissions') && text.includes('for update')) {
        return [{ ...submission, status: 'NOT_SUBMITTED' }]
      }
      if (text.startsWith('select id from public.non_submission_reports')) return [{ id: 'report-1' }]
      if (text.startsWith('delete from public.bd_submissions')) return [{ ...submission, status: 'NOT_SUBMITTED' }]
      if (text.startsWith('update public.opportunities')) {
        expect(values).toEqual(['ACTIVE', true, 'opp-1'])
        return [{
          ...opportunity,
          status: 'ACTIVE',
          submitted_at: null,
          non_submission_report_id: null,
          non_submission_exempt: true,
        }]
      }
      if (text.startsWith('delete from public.non_submission_reports')) return [{ id: 'report-1' }]
      throw new Error(`Unexpected query: ${text}`)
    }, statements)

    await expect(executeOpportunityWorkflow(client, {
      action: 'return',
      submissionId: 41,
      targetOpportunityStatus: 'ACTIVE',
      expectedOpportunityStatus: 'NOT_SUBMITTED',
      expectedSubmissionStatus: 'NOT_SUBMITTED',
      nonSubmissionExempt: true,
    }, new Date())).resolves.toMatchObject({
      opportunity: {
        status: 'ACTIVE',
        non_submission_report_id: null,
        non_submission_exempt: true,
      },
    })
    const trackerDelete = statements.findIndex((text) => text.startsWith('delete from public.bd_submissions'))
    const opportunityUpdate = statements.findIndex((text) => text.startsWith('update public.opportunities'))
    const reportDelete = statements.findIndex((text) => text.startsWith('delete from public.non_submission_reports'))
    expect(opportunityUpdate).toBeGreaterThan(trackerDelete)
    expect(reportDelete).toBeGreaterThan(opportunityUpdate)
  })

  it('rolls back the tracker deletion when the linked opportunity hard delete fails', async () => {
    const statements: string[] = []
    let released = false
    const client = {
      async query(text: string) {
        statements.push(text)
        if (text === 'begin' || text === 'commit' || text === 'rollback'
          || text.includes("set_config('app.account_id'") || text === 'set local role authenticated') {
          return { rows: [], rowCount: 0 }
        }
        if (text.includes('private.has_permission')) {
          return { rows: permissionRows('opportunity:deleteApprove'), rowCount: 1 }
        }
        if (text.startsWith('select id, opportunity_id')) {
          return { rows: [{ id: 41, opportunity_id: 'opp-1' }], rowCount: 1 }
        }
        if (text.includes('from public.opportunities') && text.includes('for update')) {
          return { rows: [opportunity], rowCount: 1 }
        }
        if (text.includes('from public.bd_submissions') && text.includes('for update')) {
          return { rows: [submission], rowCount: 1 }
        }
        if (text.startsWith('delete from public.bd_submissions')) {
          return { rows: [submission], rowCount: 1 }
        }
        if (text.startsWith('delete from public.opportunities')) throw new Error('parent delete failed')
        throw new Error(`Unexpected query: ${text}`)
      },
      release() { released = true },
    }
    const pool = { async connect() { return client } } as unknown as Database

    await expect(asAuthenticatedUser(pool, 'account-1', (transactionClient) => executeOpportunityWorkflow(
      transactionClient,
      {
        action: 'delete',
        submissionId: 41,
        expectedOpportunityStatus: 'ACTIVE',
        expectedSubmissionStatus: 'SUBMITTED',
      },
      new Date(),
    ))).rejects.toThrow('parent delete failed')
    expect(statements).toContain('rollback')
    expect(statements).not.toContain('commit')
    expect(statements.findIndex((text) => text.startsWith('delete from public.opportunities')))
      .toBeGreaterThan(statements.findIndex((text) => text.startsWith('delete from public.bd_submissions')))
    expect(released).toBe(true)
  })

  it('rolls back opportunity and tracker changes when the report review write fails', async () => {
    const statements: string[] = []
    let released = false
    const client = {
      async query(text: string) {
        statements.push(text)
        if (text === 'begin' || text === 'commit' || text === 'rollback'
          || text.includes("set_config('app.account_id'") || text === 'set local role authenticated') {
          return { rows: [], rowCount: 0 }
        }
        if (text.includes('private.has_permission')) {
          return { rows: permissionRows('nonSubmission:review'), rowCount: 1 }
        }
        if (text.startsWith('select id, opportunity_id')) {
          return { rows: [{ id: 41, opportunity_id: 'opp-1' }], rowCount: 1 }
        }
        if (text.includes('from public.opportunities') && text.includes('for update')) {
          return { rows: [opportunity], rowCount: 1 }
        }
        if (text.includes('from public.bd_submissions') && text.includes('for update')) {
          return { rows: [submission], rowCount: 1 }
        }
        if (text.startsWith('select id from public.non_submission_reports')) {
          return { rows: [{ id: 'report-1' }], rowCount: 1 }
        }
        if (text.startsWith('update public.opportunities')) {
          return { rows: [{ ...opportunity, status: 'NOT_SUBMITTED' }], rowCount: 1 }
        }
        if (text.startsWith('update public.bd_submissions')) {
          return { rows: [{ ...submission, status: 'NOT_SUBMITTED' }], rowCount: 1 }
        }
        if (text.startsWith('update public.non_submission_reports')) throw new Error('report review failed')
        throw new Error(`Unexpected query: ${text}`)
      },
      release() { released = true },
    }
    const pool = { async connect() { return client } } as unknown as Database

    await expect(asAuthenticatedUser(pool, 'account-1', (transactionClient) => executeOpportunityWorkflow(
      transactionClient,
      {
        action: 'transition',
        submissionId: 41,
        status: 'NOT_SUBMITTED',
        expectedOpportunityStatus: 'ACTIVE',
        expectedSubmissionStatus: 'SUBMITTED',
        nonSubmissionReportId: 'report-1',
      },
      new Date(),
    ))).rejects.toThrow('report review failed')
    expect(statements).toContain('rollback')
    expect(statements).not.toContain('commit')
    expect(statements.some((text) => text.startsWith('update public.opportunities'))).toBe(true)
    expect(statements.some((text) => text.startsWith('update public.bd_submissions'))).toBe(true)
    expect(released).toBe(true)
  })

  it('rolls back the tracker delete and parent update when report cleanup fails', async () => {
    const statements: string[] = []
    let released = false
    const client = {
      async query(text: string) {
        statements.push(text)
        if (text === 'begin' || text === 'commit' || text === 'rollback'
          || text.includes("set_config('app.account_id'") || text === 'set local role authenticated') {
          return { rows: [], rowCount: 0 }
        }
        if (text.includes('private.has_permission')) {
          return { rows: permissionRows('opportunity:edit', 'nonSubmission:review'), rowCount: 2 }
        }
        if (text.startsWith('select id, opportunity_id')) {
          return { rows: [{ id: 41, opportunity_id: 'opp-1' }], rowCount: 1 }
        }
        if (text.includes('from public.opportunities') && text.includes('for update')) {
          return { rows: [{ ...opportunity, status: 'NOT_SUBMITTED' }], rowCount: 1 }
        }
        if (text.includes('from public.bd_submissions') && text.includes('for update')) {
          return { rows: [{ ...submission, status: 'NOT_SUBMITTED' }], rowCount: 1 }
        }
        if (text.startsWith('select id from public.non_submission_reports')) {
          return { rows: [{ id: 'report-1' }], rowCount: 1 }
        }
        if (text.startsWith('delete from public.bd_submissions')) {
          return { rows: [{ ...submission, status: 'NOT_SUBMITTED' }], rowCount: 1 }
        }
        if (text.startsWith('update public.opportunities')) {
          return { rows: [{ ...opportunity, status: 'ACTIVE' }], rowCount: 1 }
        }
        if (text.startsWith('delete from public.non_submission_reports')) throw new Error('report delete failed')
        throw new Error(`Unexpected query: ${text}`)
      },
      release() { released = true },
    }
    const pool = { async connect() { return client } } as unknown as Database

    await expect(asAuthenticatedUser(pool, 'account-1', (transactionClient) => executeOpportunityWorkflow(
      transactionClient,
      {
        action: 'return',
        submissionId: 41,
        targetOpportunityStatus: 'ACTIVE',
        expectedOpportunityStatus: 'NOT_SUBMITTED',
        expectedSubmissionStatus: 'NOT_SUBMITTED',
        nonSubmissionReportId: 'report-1',
      },
      new Date(),
    ))).rejects.toThrow('report delete failed')
    expect(statements).toContain('rollback')
    expect(statements).not.toContain('commit')
    expect(statements.some((text) => text.startsWith('delete from public.bd_submissions'))).toBe(true)
    expect(statements.some((text) => text.startsWith('update public.opportunities'))).toBe(true)
    expect(released).toBe(true)
  })

  it('rolls the transaction back if the tracker write fails after the opportunity write', async () => {
    const statements: string[] = []
    let released = false
    const client = {
      async query(text: string) {
        statements.push(text)
        if (text === 'begin' || text === 'commit' || text === 'rollback'
          || text.includes("set_config('app.account_id'") || text === 'set local role authenticated') {
          return { rows: [], rowCount: 0 }
        }
        if (text.includes('private.has_permission')) return { rows: permissionRows('opportunity:submitProposal'), rowCount: 1 }
        if (text.includes('from public.opportunities') && text.includes('for update')) return { rows: [opportunity], rowCount: 1 }
        if (text.startsWith('update public.opportunities')) return { rows: [{ ...opportunity, status: 'SUBMITTED' }], rowCount: 1 }
        if (text.includes('where opportunity_id = $1 for update')) return { rows: [submission], rowCount: 1 }
        if (text.startsWith('update public.bd_submissions')) throw new Error('tracker write failed')
        throw new Error(`Unexpected query: ${text}`)
      },
      release() { released = true },
    }
    const pool = { async connect() { return client } } as unknown as Database

    await expect(asAuthenticatedUser(pool, 'account-1', (transactionClient) => executeOpportunityWorkflow(
      transactionClient,
      {
        action: 'submit', opportunityId: 'opp-1', expectedOpportunityStatus: 'ACTIVE',
        expectedSubmissionStatus: 'SUBMITTED', values: {},
      },
      new Date(),
    ))).rejects.toThrow('tracker write failed')
    expect(statements).toContain('rollback')
    expect(statements).not.toContain('commit')
    expect(released).toBe(true)
  })
})
