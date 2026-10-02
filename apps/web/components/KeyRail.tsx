export interface RailApp {
  name: string;
  /** The grant was cut: the line stops short, a lock sits in the gap, and records after the cut are drawn locked. */
  revoked?: boolean;
}
export interface RailNamespace {
  path: string;
  /** Omitted where the epoch is not known, such as a fingerprint carried in a link. */
  epoch?: number;
  fingerprint: string;
  apps?: RailApp[];
  /** A wrong-namespace attempt: a short stub leaves the chip and stops before this label. */
  stub?: { toLabel: string; code: string };
}
interface Props {
  credentialId?: string;
  /** What the left node is called. Defaults to "passkey"; the reading app shows its own key. */
  origin?: string;
  namespaces: RailNamespace[];
  /** Larger fingerprints, for the cross-device comparison. */
  large?: boolean;
  label: string;
}

const ROW = 64;
const TOP = 36;
const NODE_X = 26;
const CHIP_X = 170;
const CHIP_W = 290;

/** The key rail: one passkey on the left, a line per namespace to a chip, grants at the far end. Every label is DOM text. */
export function KeyRail({ credentialId, origin = "passkey", namespaces, large, label }: Props) {
  const rows = Math.max(namespaces.length, 1);
  const height = TOP + rows * ROW;
  const cy = height / 2;
  return (
    <figure className="rail" aria-label={label} style={{ margin: 0 }}>
      <svg viewBox={`0 0 660 ${height}`} role="img" aria-label={label}>
        <circle className="rail-node" cx={NODE_X} cy={cy} r={7} />
        <text className="rail-text" x={NODE_X - 6} y={cy + 28} data-testid="rail-passkey">
          {credentialId ? `${origin} ${credentialId.slice(0, 8)}` : origin === "passkey" ? "passkey none yet" : origin}
        </text>
        {namespaces.map((n, i) => {
          const y = TOP / 2 + i * ROW + ROW / 2;
          const chipY = y - 14;
          const apps = n.apps ?? [];
          return (
            <g key={n.path} data-testid="rail-ns" data-ns={n.path}>
              <path className="rail-line rail-line-draw" pathLength={1} d={`M ${NODE_X + 7} ${cy} C ${NODE_X + 90} ${cy}, ${CHIP_X - 90} ${y}, ${CHIP_X} ${y}`} />
              <rect className="rail-chip" x={CHIP_X} y={chipY} width={CHIP_W} height={28} rx={6} />
              <text className="rail-text" x={CHIP_X + 10} y={y + 4}>
                {n.path}
              </text>
              {n.epoch !== undefined && (
                <text className="rail-text" x={CHIP_X + 150} y={y + 4} data-testid="rail-epoch">
                  {`e${n.epoch}`}
                </text>
              )}
              <text className={large ? "rail-text-fp" : "rail-text"} x={CHIP_X + (large ? 168 : 190)} y={y + (large ? 7 : 4)} data-testid="rail-fp">
                {n.fingerprint}
              </text>
              {n.stub && (
                <g data-testid="rail-stub">
                  <path className="rail-stub" d={`M ${CHIP_X + CHIP_W / 2} ${chipY + 28} v 14 h 52`} />
                  <text className="rail-text-err" x={CHIP_X + CHIP_W / 2 + 58} y={chipY + 46}>
                    {`${n.stub.code}  ${n.stub.toLabel}`}
                  </text>
                </g>
              )}
              {apps.map((a, j) => {
                const ax = CHIP_X + CHIP_W + 56;
                const ay = y + (j - (apps.length - 1) / 2) * 24;
                const x0 = CHIP_X + CHIP_W;
                const lx = x0 + (ax - 10 - x0) * 0.86;
                const ly = y + (ay - y) * 0.86 - 4;
                return (
                  <g key={a.name} data-testid="rail-app" data-app={a.name} data-revoked={a.revoked ? "true" : "false"}>
                    <path className="rail-grant" pathLength={1} data-cut={a.revoked ? "true" : "false"} d={`M ${x0} ${y} L ${ax - 10} ${ay}`} />
                    {a.revoked && (
                      <path
                        className="rail-lock"
                        d={`M ${lx - 5} ${ly + 1} h 10 v 8 h -10 z M ${lx - 3} ${ly + 1} v -3 a 3 3 0 0 1 6 0 v 3`}
                      />
                    )}
                    <circle className="rail-open" cx={ax} cy={ay} r={8} />
                    <text className="rail-text" x={ax + 16} y={ay + 4}>
                      {a.revoked ? `${a.name} (revoked)` : a.name}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
