import { describe, expect, it } from 'vitest'
import { changeLinks, describeAction } from './assistant'

describe('describeAction', () => {
  it('summarizes a new person with the default cadence', () => {
    expect(describeAction({ name: 'create_contact', args: { name: 'Sam Lee', email: 'sam@x.com' } })).toEqual({
      title: 'Add Sam Lee',
      details: ['Email: sam@x.com', 'Keep in touch: Monthly'],
    })
  })

  it('names the person being updated and lists what changes', () => {
    const summary = describeAction({
      name: 'update_contact',
      args: { id: 'c1', cadence_days: 7, phone: '' },
      contactName: 'Sam Lee',
    })
    expect(summary).toEqual({ title: 'Update Sam Lee', details: ['Keep in touch: Weekly', 'Clear phone'] })
  })

  it('treats archiving as its own action', () => {
    expect(describeAction({ name: 'update_contact', args: { id: 'c1', archived: true }, contactName: 'Sam' }).title).toBe(
      'Archive Sam',
    )
  })

  it('defaults a logged conversation to today', () => {
    expect(
      describeAction({ name: 'log_interaction', args: { contact_id: 'c1', note: 'Coffee' }, contactName: 'Sam' }),
    ).toEqual({ title: 'Log a conversation with Sam', details: ['When: Today', 'Note: Coffee'] })
  })
})

describe('changeLinks', () => {
  it('links only successful writes', () => {
    expect(
      changeLinks(
        [
          { name: 'find_contacts', ok: true, write: false },
          { name: 'create_contact', ok: true, write: true, contactId: 'c2', contactName: 'Ada' },
          { name: 'log_interaction', ok: false, write: true, error: 'nope' },
          { name: 'log_interaction', ok: true, write: true, contactId: 'c1' },
        ],
        'Sam',
      ),
    ).toEqual([
      { id: 'c2', label: 'Added Ada' },
      { id: 'c1', label: 'Logged a conversation with Sam' },
    ])
  })
})
