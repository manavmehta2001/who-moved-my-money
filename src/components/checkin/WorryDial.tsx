function caption(score: number): string {
  if (score <= 20) return "Very little to worry about";
  if (score <= 45) return "A little to keep an eye on";
  if (score <= 70) return "Worth a closer look";
  return "Time for a calm, proper review";
}

/** A quiet half-dial, 0–100. The needle and arc render at their final position; the load timeline sweeps them in. */
export function WorryDial({ score }: { score: number }) {
  const angle = -90 + (Math.min(Math.max(score, 0), 100) / 100) * 180;
  return (
    <figure className="dial" aria-label={`How much to worry: ${score} out of 100. ${caption(score)}.`}>
      <svg viewBox="0 0 200 118" aria-hidden="true">
        <path className="dial-track" d="M 20 100 A 80 80 0 0 1 180 100" pathLength={100} />
        <path className="dial-fill" d="M 20 100 A 80 80 0 0 1 180 100" pathLength={100} strokeDasharray={`${score} 100`} data-anim="dial-fill" data-score={score} />
        <g data-anim="needle" data-angle={angle} transform={`rotate(${angle} 100 100)`}>
          <line className="dial-needle" x1="100" y1="100" x2="100" y2="34" />
        </g>
        <circle className="dial-hub" cx="100" cy="100" r="6" />
      </svg>
      <div className="dial-value num">
        <span data-countup={score}>{score}</span>
        <span className="faint"> / 100</span>
      </div>
      <figcaption className="dial-caption">
        How much to worry
        <br />
        <strong>{caption(score)}</strong>
      </figcaption>
    </figure>
  );
}
