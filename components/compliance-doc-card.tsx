type ComplianceDocCardProps = {
  title: string;
  body: string;
};

export function ComplianceDocCard({ title, body }: ComplianceDocCardProps) {
  return (
    <section className="card stack">
      <div className="stack" style={{ gap: "0.35rem" }}>
        <h1 style={{ margin: 0 }}>{title}</h1>
      </div>
      <pre
        style={{
          margin: 0,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontFamily: "inherit",
          fontSize: "0.98rem",
          lineHeight: 1.7,
        }}
      >
        {body}
      </pre>
    </section>
  );
}
