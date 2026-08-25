import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <Card className="w-full max-w-md rounded-r12">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Pocket PM — scaffold check</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Next.js 16, Tailwind, and shadcn/ui are wired up with the ported theme.
            This page is a build-verification placeholder, not real UI.
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-success text-white">Qualified</Badge>
            <Badge className="bg-warning text-white">Renewal Due</Badge>
            <Badge className="bg-info text-white">Pending A/E</Badge>
            <Badge className="bg-danger text-white">Overdue</Badge>
            <Badge className="bg-caution text-white">At Risk</Badge>
            <Badge className="bg-teal text-white">AI-Powered</Badge>
            <Badge variant="secondary" className="bg-neutral-subtle text-neutral">
              Not Started
            </Badge>
          </div>
          <Button>Primary action</Button>
        </CardContent>
      </Card>
    </div>
  );
}
