'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { readNotificationAction } from '@/server/actions';
import { attentionPage, type AttentionItem } from './domain';

/** One attention row: category label, title, due context, one destination or Mark read. */
export function AttentionRow({ item }: { item: AttentionItem }) {
  return (
    <li className="attention-row" data-source={item.source}>
      <span className="attention-label">{item.label}</span>
      <span className="attention-main">
        {item.href ? (
          <Link className="attention-title" href={item.href} prefetch={false}>
            {item.title}
          </Link>
        ) : (
          <span className="attention-title">{item.title}</span>
        )}
        <span className="attention-context">{item.context}</span>
      </span>
      {item.notificationIds.length > 0 && (
        <ActionForm
          action={readNotificationAction}
          broadcast="attention"
          className="attention-read"
        >
          {item.notificationIds.map((id) => (
            <input key={id} type="hidden" name="id" value={id} />
          ))}
          <Button
            variant="secondary"
            className="small"
            aria-label={`Mark the reminder read: ${item.title}`}
          >
            Mark read
          </Button>
        </ActionForm>
      )}
    </li>
  );
}

/** The full queue, twenty rows at a time, in the attention panel. */
export function AttentionPages({ items }: { items: AttentionItem[] }) {
  const [page, setPage] = useState(1);
  const view = attentionPage(items, page);
  return (
    <>
      <ul className="plain-list attention-list">
        {view.items.map((item) => (
          <AttentionRow key={item.id} item={item} />
        ))}
      </ul>
      {view.pages > 1 && (
        <nav className="attention-pager" aria-label="Attention pages">
          <button
            type="button"
            className="button secondary small"
            disabled={view.page === 1}
            onClick={() => setPage(view.page - 1)}
          >
            Previous
          </button>
          <span className="muted">
            Page {view.page} of {view.pages}
          </span>
          <button
            type="button"
            className="button secondary small"
            disabled={view.page === view.pages}
            onClick={() => setPage(view.page + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </>
  );
}
