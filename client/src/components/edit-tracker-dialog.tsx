import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertCompetitorTrackerSchema, type CompetitorTracker } from "@shared/schema";

const editSchema = insertCompetitorTrackerSchema;
type EditForm = z.infer<typeof editSchema>;

interface EditTrackerDialogProps {
  tracker: Pick<CompetitorTracker, "id" | "name" | "website" | "notes">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditTrackerDialog({ tracker, open, onOpenChange }: EditTrackerDialogProps) {
  const { toast } = useToast();

  const form = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: tracker.name,
      website: tracker.website ?? "",
      notes: tracker.notes ?? "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: tracker.name,
        website: tracker.website ?? "",
        notes: tracker.notes ?? "",
      });
    }
  }, [open, tracker.id, tracker.name, tracker.website, tracker.notes]);

  const updateMutation = {
    mutate: async (data: EditForm) => {
      try {
        const res = await apiRequest("PATCH", `/api/inbox-intel/trackers/${tracker.id}`, data);
        const updated = await res.json();
        queryClient.invalidateQueries({ queryKey: ["/api/inbox-intel/trackers"] });
        queryClient.invalidateQueries({ queryKey: ["/api/inbox-intel/trackers", tracker.id] });
        onOpenChange(false);
        toast({
          title: "Competitor updated",
          description: `${updated.name} was saved.`,
        });
      } catch (err: any) {
        toast({
          title: "Couldn't save changes",
          description: err?.message || "Something went wrong.",
          variant: "destructive",
        });
      }
    },
  };

  const isSubmitting = form.formState.isSubmitting;

  const onSubmit = (data: EditForm) => updateMutation.mutate(data);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit competitor</DialogTitle>
          <DialogDescription>
            Update the name, website, or notes. Changing the website will refresh the preview screenshot.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Competitor name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Acme Coaching"
                      {...field}
                      data-testid="input-edit-tracker-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Website (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://acmecoaching.com"
                      {...field}
                      value={field.value ?? ""}
                      data-testid="input-edit-tracker-website"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What you want to learn from them — funnel structure, subject lines, cadence..."
                      rows={3}
                      {...field}
                      value={field.value ?? ""}
                      data-testid="input-edit-tracker-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-edit-tracker"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                data-testid="button-save-edit-tracker"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
