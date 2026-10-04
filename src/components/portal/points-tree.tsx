import type { RewardEarning } from '@/server/services/rewards'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const WIDTH = 640
const TRUNK_X = WIDTH / 2
const STEP = 54
const TOP = 46
const GROUND = 64

/**
 * A tenant's points drawn as a tree: the trunk is everything earned, and each
 * branch is one month's rent, growing upward from the oldest. A longer branch
 * and a fuller leaf mean more points that month. Green leaves were on time,
 * amber ones late, and pale ones are still in their 30-day settling period.
 */
export function PointsTree({
  earnings,
  total,
  maxBranches = 12,
}: {
  earnings: RewardEarning[]
  total: number
  maxBranches?: number
}) {
  if (earnings.length === 0) {
    return (
      <div className="grid place-items-center px-6 py-10 text-center">
        <svg viewBox="0 0 120 120" className="h-24 w-24" aria-hidden>
          <rect x="56" y="64" width="8" height="40" rx="3" className="fill-faint/50" />
          <circle cx="60" cy="56" r="16" className="fill-brand/25" />
          <line x1="20" y1="104" x2="100" y2="104" className="stroke-line" strokeWidth="2" />
        </svg>
        <p className="mt-3 text-sm font-medium text-ink">Your tree has not sprouted yet</p>
        <p className="mt-1 max-w-xs text-sm text-muted">Each month you pay rent grows a new branch.</p>
      </div>
    )
  }

  const shown = earnings.slice(-maxBranches)
  const hidden = earnings.length - shown.length
  const max = Math.max(...shown.map((earning) => earning.points), 1)
  const height = TOP + shown.length * STEP + GROUND
  const groundY = height - GROUND + 24
  const trunkTop = TOP - 6

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="mx-auto block w-full max-w-2xl"
        role="img"
        aria-label={`Points tree: ${total.toLocaleString()} points from ${earnings.length} months of rent.`}
      >
        {/* Trunk, wider at the base */}
        <path
          d={`M ${TRUNK_X - 9} ${groundY} L ${TRUNK_X - 3} ${trunkTop} L ${TRUNK_X + 3} ${trunkTop} L ${TRUNK_X + 9} ${groundY} Z`}
          className="fill-[#8a6a4b] dark:fill-[#a07d5a]"
        />

        {shown.map((earning, index) => {
          // Oldest at the bottom, newest at the top.
          const y = groundY - 40 - index * STEP
          const side = index % 2 === 0 ? -1 : 1
          const ratio = earning.points / max
          const length = 70 + 120 * ratio
          const leafX = TRUNK_X + side * length
          const leafY = y - 18
          const radius = 9 + 13 * Math.sqrt(ratio)
          const late = (earning.daysLate ?? 0) > 0
          const label = `${MONTHS[earning.periodMonth - 1]} ${earning.periodYear}`
          const status = earning.pending ? 'settling' : late ? `${earning.daysLate} days late` : 'on time'
          const leafClass = earning.pending
            ? 'fill-brand/25 stroke-brand'
            : late
              ? 'fill-warning/80'
              : 'fill-brand'
          const textX = leafX + side * (radius + 8)
          const anchor = side < 0 ? 'end' : 'start'

          return (
            <g key={`${earning.periodYear}-${earning.periodMonth}`}>
              <title>{`${label}: +${earning.points.toLocaleString()} points (${status})`}</title>
              <path
                d={`M ${TRUNK_X} ${y} Q ${TRUNK_X + side * length * 0.45} ${y - 2} ${leafX - side * radius * 0.6} ${leafY}`}
                className="fill-none stroke-[#8a6a4b] dark:stroke-[#a07d5a]"
                strokeWidth={2 + 3 * ratio}
                strokeLinecap="round"
              />
              <circle
                cx={leafX}
                cy={leafY}
                r={radius}
                className={leafClass}
                strokeWidth={earning.pending ? 1.5 : 0}
                strokeDasharray={earning.pending ? '3 3' : undefined}
              />
              <text x={textX} y={leafY - 2} textAnchor={anchor} className="fill-ink text-[14px] font-semibold">
                +{earning.points.toLocaleString()}
              </text>
              <text x={textX} y={leafY + 14} textAnchor={anchor} className="fill-muted text-[12px]">
                {label}
                {earning.pending ? ' · settling' : late ? ' · late' : ''}
              </text>
            </g>
          )
        })}

        {/* Crown: the latest month sits at the top */}
        <circle cx={TRUNK_X} cy={trunkTop - 6} r={7} className="fill-brand" />

        {/* Ground and the total at the root */}
        <line x1={TRUNK_X - 150} y1={groundY} x2={TRUNK_X + 150} y2={groundY} className="stroke-line" strokeWidth="2" strokeLinecap="round" />
        <text x={TRUNK_X} y={groundY + 26} textAnchor="middle" className="fill-ink text-[15px] font-semibold">
          {total.toLocaleString()} points
        </text>
      </svg>

      <figcaption className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-brand" aria-hidden /> Paid on time
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-warning/80" aria-hidden /> Paid late
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border border-dashed border-brand bg-brand/25" aria-hidden /> Still settling
        </span>
        {hidden > 0 && <span>Showing the last {shown.length} months · {hidden} earlier</span>}
      </figcaption>
    </figure>
  )
}
