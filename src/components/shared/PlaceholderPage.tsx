import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Temporary stand-in for an unbuilt module route. Confirms the route
 * actually resolves and renders with the ported theme; gets replaced
 * module-by-module in later build steps.
 */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="p-6">
      <Card className="rounded-r12">
        <CardHeader>
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Not yet built.</p>
        </CardContent>
      </Card>
    </div>
  );
}
