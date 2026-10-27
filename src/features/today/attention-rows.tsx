'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  Briefcase,
  ChevronRight,
  ClipboardCheck,
  Code2,
  Route,
} from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { readNotificationAction } from '@/server/actions';
import { attentionPage, type AttentionItem } from './domain';

const icons = {
  'interview-prep': Briefcase,
  job: Briefcase,
  practice: Code2,
  roadmap: Route,
  notification: Bell,
  weekly: ClipboardCheck,
} as const;

/** One attention row: a neutral icon tile, the category label, title, due context, one way on. */
export function AttentionRow({ item }: { item: AttentionItem }) {
  const Icon = icons[item.source];
  const body = (
    <>
      <span className="attention-icon" aria-hidden="true">
        <Icon size={22} />
      </span>
      <span className="attention-main">
        <span className="attention-label">{item.label}</span>
        <span className="attention-title">{item.title}</span>
        <span className="attention-context">{item.context}</span>
      </span>
    </>
  );
  return (
    <li className="attention-row" data-source={item.source}>
      {item.href ? (
        <Link className="attention-link" href={item.href} prefetch={false}>
          {body}
          <ChevronRight
            size={18}
            aria-hidden="true"
            className="attention-chevron"
          />
        </Link>
      ) : (
        <span className="attention-link is-static">{body}</span>
      )}
      {item.notificationIds.length > 0 && (
        <ActionForm
          action={readNotificationAction}
          broadcast="attention"
          className="attention-read"
        >
          {item.notificationIds.map((id) => (
            <input key={id} type="hidden" name="id" value={id} />
          ))}
          <Button variant="link" aria-label={`Mark read: ${item.title}`}>
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
