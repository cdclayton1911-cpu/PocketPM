import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The shape every AI module shares: an input form on the left, the generated
 * output on the right, and a one-line statement of what the module does.
 *
 * Stacks on narrow screens, output first once generated is not worth the
 * complexity — the form is short.
 */
export function AiWorkbench({
  intro,
  formTitle,
  form,
  output,
  belowForm,
}: {
  intro: string;
  formTitle: string;
  form: React.ReactNode;
  output: React.ReactNode;
  belowForm?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-muted-foreground">{intro}</p>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Card className="rounded-r12">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">{formTitle}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">{form}</CardContent>
          </Card>
          {belowForm}
        </div>
        {output}
      </div>
    </div>
  );
}
