import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { owner } from '@/server/db';
import { revisionDeck } from '@/features/ai/service';
import { RevisionDeck } from '@/features/ai/deck';
import { FeedbackOutlet } from '@/components/feedback-outlet';

export const metadata = { title: 'Revision deck' };

/**
 * The revision deck (WI-032): only cards the owner kept from Grill Me, on items due for
 * revision. A finite set; marks stay on this page and Mark revised is the item's own action.
 */
export default async function Deck() {
  const user = await owner();
  const { items, cards } = await revisionDeck(user);
  return (
    <>
      <Link className="link" href="/roadmap" prefetch={false}>
        <ArrowLeft size={14} aria-hidden="true" /> Roadmap
      </Link>
      <p className="eyebrow mt-4">Roadmap</p>
      <div className="page-head">
        <h1>Revision deck</h1>
      </div>
      {/* Outside the deck: Mark revised can empty it, and the answer must stay. */}
      <FeedbackOutlet channel="deck" className="mb-4" />
      {cards.length ? (
        <RevisionDeck items={items} cards={cards} />
      ) : (
        <section className="card" aria-labelledby="deck-empty">
          <h2 id="deck-empty">Nothing to revise from your cards today</h2>
          <p>
            Cards you keep in Grill Me come back here when their item is due for
            revision.
          </p>
          <Link className="button" href="/roadmap" prefetch={false}>
            Open the roadmap
          </Link>
        </section>
      )}
    </>
  );
}
