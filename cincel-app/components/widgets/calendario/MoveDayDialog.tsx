"use client";

import { useState } from "react";

import { Button } from "@/components/ui/shadcn/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/shadcn/dialog";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";

import { MOVE_DIALOG_CANCEL, MOVE_DIALOG_CONFIRM, MOVE_DIALOG_FIELD, MOVE_DIALOG_TITLE } from "./grid-copy";

export type MoveDayDialogProps = {
  title: string;
  date: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  onPick(date: string): void;
};

/** Keyboard and touch alternative to the drag: pick the new day of a task (FE §4.1). */
export function MoveDayDialog({ title, date, open, onOpenChange, onPick }: MoveDayDialogProps) {
  const [value, setValue] = useState(date);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{MOVE_DIALOG_TITLE(title)}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!value) return;
            onOpenChange(false);
            if (value !== date) onPick(value);
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="calendar-move-date">{MOVE_DIALOG_FIELD}</Label>
            <Input id="calendar-move-date" type="date" value={value} onChange={(event) => setValue(event.target.value)} required />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {MOVE_DIALOG_CANCEL}
            </Button>
            <Button type="submit">{MOVE_DIALOG_CONFIRM}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
