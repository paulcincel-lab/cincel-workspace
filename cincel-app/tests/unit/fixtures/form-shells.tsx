/**
 * Test-only stand-ins for `FormSheet` / `FormDialog` (FE §4.11 contract) built on the same
 * shadcn `Sheet` / `Dialog` primitives, so the Gmail tests exercise real focus handling
 * without depending on the pattern files.
 */
import type { FormDialogProps } from "@/components/patterns/FormDialog";
import type { FormSheetProps } from "@/components/patterns/FormSheet";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/shadcn/dialog";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";

export function TestFormSheet(p: FormSheetProps) {
  return (
    <Sheet open={p.open} onOpenChange={(o) => p.onOpenChange(o)}>
      <SheetContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void p.onSubmit();
          }}
        >
          <SheetHeader>
            <SheetTitle>{p.title}</SheetTitle>
            {p.description ? <SheetDescription>{p.description}</SheetDescription> : null}
          </SheetHeader>
          {p.children}
          {p.error ? (
            <Alert variant="destructive">
              <AlertDescription>{p.error}</AlertDescription>
            </Alert>
          ) : null}
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => p.onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={p.pending}>
              {p.submitLabel}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function TestFormDialog(p: FormDialogProps) {
  return (
    <Dialog open={p.open} onOpenChange={(o) => p.onOpenChange(o)}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void p.onSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{p.title}</DialogTitle>
            {p.description ? <DialogDescription>{p.description}</DialogDescription> : null}
          </DialogHeader>
          {p.children}
          {p.error ? (
            <Alert variant="destructive">
              <AlertDescription>{p.error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => p.onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={p.pending}>
              {p.submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
