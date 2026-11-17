import { ApiKeys } from "./api-keys";

export default function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">API keys</h1>
        <p className="text-sm text-muted-foreground">
          Keys let the Asset IQ MCP server act on your library from Claude Desktop, Claude Code or any MCP client. Each key sees only your
          documents. Keys are stored hashed — copy a new key when it&apos;s shown; it can&apos;t be displayed again.
        </p>
      </div>
      <ApiKeys />
    </div>
  );
}
