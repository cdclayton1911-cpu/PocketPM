export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6">
      <div className="flex flex-col items-center gap-1">
        <span className="text-lg font-bold text-primary">Pocket PM</span>
        <span className="text-xs text-muted-foreground">
          Bid Bigger. Build Smarter. Win More.
        </span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
