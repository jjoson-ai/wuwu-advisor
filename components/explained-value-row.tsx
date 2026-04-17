type ExplainedValueRowProps = {
  label: string;
  value: string;
  explanation?: string | null;
};

export function ExplainedValueRow({
  label,
  value,
  explanation = null,
}: ExplainedValueRowProps) {
  return (
    <div className="value-row">
      <div className="value-label">
        <span>{label}</span>
        {explanation ? (
          <span
            aria-label={`${label} explanation: ${explanation}`}
            className="info-tooltip-trigger"
            data-tooltip={explanation}
            tabIndex={0}
          >
            ⓘ
          </span>
        ) : null}
      </div>
      <p className="value-content">{value}</p>
    </div>
  );
}
