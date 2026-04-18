export default async function OpsLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const hasError = params["error"] === "1";

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <div className="stack" style={{ width: "100%", maxWidth: "22rem" }}>
        <div>
          <p className="card-eyebrow">Internal</p>
          <h1 className="page-title" style={{ margin: 0 }}>
            Operator dashboard
          </h1>
        </div>

        <form
          action="/api/ops/auth"
          method="POST"
          className="stack"
          style={{ gap: "0.75rem" }}
        >
          <input
            type="password"
            name="password"
            placeholder="Password"
            required
            autoFocus
            autoComplete="current-password"
            className="input"
            style={{ width: "100%" }}
          />
          {hasError ? (
            <p
              style={{
                margin: 0,
                fontSize: "0.85rem",
                color: "var(--color-destructive, #c0392b)",
              }}
            >
              Incorrect password.
            </p>
          ) : null}
          <button type="submit" className="button button-primary" style={{ width: "100%" }}>
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
