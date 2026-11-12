"use client";

import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MEETING_DIALOG_COPY as C } from "@/components/calendario/meeting-copy";
import { connectGoogleHref } from "@/components/calendario/meeting-format";
import {
  clearMeetingDraft,
  emptyMeetingForm,
  formOfEvent,
  formToDraft,
  isEmail,
  loadMeetingDraft,
  saveMeetingDraft,
  validateMeetingForm,
  addMinutes,
  type MeetingForm,
  type MeetingFormErrors,
} from "@/components/calendario/meeting-draft";
import { replaceCalendarioUrl, useCalendarioQuery, useCalendarioRange } from "@/components/calendario/use-calendario-page";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/shadcn/dialog";
import { FormField } from "@/components/ui/shadcn/form-field";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { createMeetingAction, updateMeetingAction } from "@/lib/actions/calendario-actions";
import { useActionMutation } from "@/lib/query/mutation";
import { catalogOptions } from "@/lib/query/options/catalog";
import { calendarioInvalidations } from "@/lib/query/options/calendario";
import type { CalEventItem, MeetingDraft } from "@/lib/types/calendario";

export type NewMeetingDialogProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Edit mode when set. */
  event?: CalEventItem;
  defaults?: Partial<MeetingDraft>;
};

const NONE = "__none__";

function reasonOf(error: string | null): string | null {
  if (error === "UNAVAILABLE" || error === "RATE_LIMITED") return C.reasonUnavailable;
  if (error === "REAUTH") return C.reasonReauth;
  return null;
}

/** Nueva reunión (FE §6.1, D1): Google is the main path; "Crear solo en Cincel" is the explicit failure path. */
export function NewMeetingDialog({ open, onOpenChange, event, defaults }: NewMeetingDialogProps) {
  const query = useCalendarioQuery();
  const { range } = useCalendarioRange(query);
  const google = range?.google ?? { connected: false, eventsGrant: false, syncedAt: null, error: null };
  const denied = google.error === "ACCESS_DENIED";
  const hasGrant = google.eventsGrant && !denied;
  const editing = Boolean(event);

  const projects = useQuery({ ...catalogOptions.projectOptions(), enabled: open });
  const staff = useQuery({ ...catalogOptions.staff(), enabled: open });

  const [form, setForm] = useState<MeetingForm>(() => emptyMeetingForm(query.fecha, defaults));
  const [errors, setErrors] = useState<MeetingFormErrors>({});
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Each opening starts from the event, the returned draft, or the defaults (state adjusted while rendering).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setErrors({});
      setEmail("");
      setEmailError(null);
      setFormError(null);
      const draft = event ? null : loadMeetingDraft();
      setForm(event ? formOfEvent(event) : (draft ?? emptyMeetingForm(query.fecha, defaults)));
    }
  }
  // A returned draft is used once.
  useEffect(() => {
    if (open && !event) clearMeetingDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it opens
  }, [open]);

  const update = (patch: Partial<MeetingForm>) => setForm((f) => ({ ...f, ...patch }));

  const create = useActionMutation(createMeetingAction, {
    invalidate: () => calendarioInvalidations("meetings"),
    onFormError: setFormError,
  });
  const edit = useActionMutation(
    (v: { id: string; patch: Parameters<typeof updateMeetingAction>[1] }) => updateMeetingAction(v.id, v.patch),
    { invalidate: () => calendarioInvalidations("meetings"), onFormError: setFormError },
  );
  const pending = create.isPending || edit.isPending;

  function submit(opts: { onlyCincel: boolean }) {
    const found = validateMeetingForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setFormError(null);
    if (event) {
      const draft = formToDraft(form, { meet: form.meet });
      edit.mutate(
        { id: event.eventId, patch: { title: draft.title, start: draft.start, end: draft.end, location: draft.location, attendees: draft.attendees, notify: true } },
        {
          onSuccess: () => {
            toast.success(C.updated);
            onOpenChange(false);
          },
        },
      );
      return;
    }
    const draft = formToDraft(form, { meet: opts.onlyCincel ? false : hasGrant && form.meet });
    create.mutate(draft, {
      onSuccess: (item) => {
        const people = item.attendeeCount || draft.attendees.length;
        if (draft.attendees.length === 0) {
          // Nobody to invite: never claim an invitation went out.
          toast.success(C.createdAlone, { description: reasonOf(item.syncError) ?? undefined });
        } else if (item.invitesVia === "cincel" || opts.onlyCincel || !hasGrant) {
          toast.success(C.createdCincel, { description: reasonOf(item.syncError) ?? undefined });
        } else {
          toast.success(C.createdGoogle(people));
        }
        clearMeetingDraft();
        onOpenChange(false);
      },
    });
  }

  function addEmail() {
    const value = email.trim();
    if (!value) return;
    if (!isEmail(value)) {
      setEmailError(C.emailInvalid);
      return;
    }
    if (!form.attendees.some((a) => a.email.toLowerCase() === value.toLowerCase())) {
      update({ attendees: [...form.attendees, { email: value, name: value }] });
    }
    setEmail("");
    setEmailError(null);
  }

  function addStaff(id: string) {
    const person = staff.data?.find((s) => s.id === id);
    if (!person || form.attendees.some((a) => a.staffId === id)) return;
    update({ attendees: [...form.attendees, { staffId: id, email: "", name: person.name }] });
  }

  function connect() {
    saveMeetingDraft(form);
    window.location.assign(connectGoogleHref("/calendario?nueva=reunion"));
  }

  const projectItems = Object.fromEntries([[NONE, C.noProject], ...(projects.data ?? []).map((p) => [p.id, p.name] as const)]);
  const staffItems = Object.fromEntries((staff.data ?? []).map((s) => [s.id, s.name] as const));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? C.titleEdit : C.titleNew}</DialogTitle>
          <DialogDescription className="sr-only">{editing ? C.titleEdit : C.titleNew}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit({ onlyCincel: false });
          }}
        >
          <FormField className="flex flex-col gap-2">
            <Label>{C.title}</Label>
            <Input value={form.title} onChange={(e) => update({ title: e.target.value })} aria-invalid={Boolean(errors.title)} autoFocus />
            {errors.title ? <p className="text-sm text-destructive">{errors.title}</p> : null}
          </FormField>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField className="flex flex-col gap-2">
              <Label>{C.date}</Label>
              <Input type="date" value={form.date} onChange={(e) => update({ date: e.target.value })} aria-invalid={Boolean(errors.date)} />
              {errors.date ? <p className="text-sm text-destructive">{errors.date}</p> : null}
            </FormField>
            <FormField className="flex flex-col gap-2">
              <Label>{C.start}</Label>
              <Input
                type="time"
                value={form.start}
                onChange={(e) => {
                  const next = e.target.value;
                  // The end keeps its 60 min distance while it is still the default one.
                  const keep = form.end === addMinutes(form.start, 60);
                  update({ start: next, ...(keep && next ? { end: addMinutes(next, 60) } : {}) });
                }}
              />
            </FormField>
            <FormField className="flex flex-col gap-2">
              <Label>{C.end}</Label>
              <Input type="time" value={form.end} onChange={(e) => update({ end: e.target.value })} aria-invalid={Boolean(errors.end)} />
            </FormField>
          </div>
          {errors.end ? <p className="-mt-2 text-sm text-destructive">{errors.end}</p> : null}

          <FormField className="flex flex-col gap-2">
            <Label>{C.project}</Label>
            <Select
              items={projectItems}
              value={form.projectId ?? NONE}
              onValueChange={(v) => update({ projectId: v && v !== NONE ? (v as string) : null })}
              disabled={editing}
            >
              <SelectTrigger aria-label={C.project} className="w-full">
                <SelectValue placeholder={C.noProject} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{C.noProject}</SelectItem>
                {(projects.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">{C.attendees}</legend>
            {form.attendees.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {form.attendees.map((a) => (
                  <li key={`${a.staffId ?? a.email}:${a.name}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pr-1 pl-2.5 text-sm">
                    {a.name}
                    <Button type="button" variant="ghost" size="icon-xs" aria-label={C.removeAttendee(a.name)} onClick={() => update({ attendees: form.attendees.filter((x) => x !== a) })}>
                      <X aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <Select items={staffItems} value="" onValueChange={(v) => v && addStaff(v as string)}>
              <SelectTrigger aria-label={C.attendees} className="w-full">
                <SelectValue placeholder={C.staffPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {(staff.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                type="email"
                value={email}
                placeholder={C.emailPlaceholder}
                aria-label={C.emailPlaceholder}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addEmail();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addEmail}>
                {C.addAttendee}
              </Button>
            </div>
            {emailError ? <p className="text-sm text-destructive">{emailError}</p> : null}
          </fieldset>

          <FormField className="flex flex-col gap-2">
            <Label>{C.place}</Label>
            <Input value={form.location} onChange={(e) => update({ location: e.target.value })} />
          </FormField>

          {!editing ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Checkbox id="meeting-meet" checked={hasGrant && form.meet} disabled={!hasGrant} onCheckedChange={(v) => update({ meet: v === true })} />
                <Label htmlFor="meeting-meet">{C.meet}</Label>
              </div>
              {!hasGrant ? <p className="text-sm text-muted-foreground">{C.meetHint}</p> : null}
            </div>
          ) : null}

          <FormField className="flex flex-col gap-2">
            <Label>{C.description}</Label>
            <Textarea value={form.description} onChange={(e) => update({ description: e.target.value })} rows={3} />
          </FormField>

          {!editing && !hasGrant ? (
            <Alert>
              <AlertDescription>{denied ? C.denied : C.noGrant}</AlertDescription>
            </Alert>
          ) : null}
          {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}
          {!editing && hasGrant ? <p className="text-sm text-muted-foreground">{C.withGrant}</p> : null}

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              {C.cancel}
            </Button>
            {!editing && !hasGrant ? (
              <>
                <Button type="button" variant="outline" onClick={() => submit({ onlyCincel: true })} disabled={pending}>
                  {C.onlyCincel}
                </Button>
                {!denied ? (
                  <Button type="button" onClick={connect} disabled={pending}>
                    {C.connect}
                  </Button>
                ) : null}
              </>
            ) : (
              <Button type="submit" disabled={pending}>
                {editing ? C.save : C.create}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Opens the dialog from `?nueva=reunion` ("+ Nuevo › Reunión", the Google grant
 * return); closing clears the param. The page mounts it once.
 */
export function NewMeetingHost() {
  const query = useCalendarioQuery();
  const open = query.nueva === "reunion";
  return (
    <NewMeetingDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) replaceCalendarioUrl({ ...query, nueva: null });
      }}
    />
  );
}
