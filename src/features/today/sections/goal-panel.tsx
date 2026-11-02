import { ConfirmDelete } from '@/components/confirm-delete';
import { deleteGoalAction } from '@/features/deletes/actions';
import { GoalForm } from '@/features/roadmap/forms';
import { SidePanel } from '../panels';
import type { TodayView } from '../page-data';

/** The goal on Today (WI-060): set or edit the nearest active goal in a modal. */
export function GoalPanel({ v }: { v: TodayView }) {
  const { nearestGoal } = v;
  return (
    <SidePanel
      id="goal"
      title={nearestGoal ? 'Edit goal' : 'Set a goal'}
      variant="modal"
    >
      {/* A new goal is the short form; editing shows status, so it can be marked done. */}
      <GoalForm goal={nearestGoal ?? undefined} compact={!nearestGoal} />
      {nearestGoal && (
        <div className="panel-danger">
          <ConfirmDelete
            action={deleteGoalAction}
            id={nearestGoal.id}
            label="Delete goal"
            question={`Delete the goal ${nearestGoal.title}? Its roadmaps, routines and blocks stay, no longer linked to it.`}
          />
        </div>
      )}
    </SidePanel>
  );
}
